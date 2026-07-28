use std::fs;

use business_protocol::{
    ArtifactLineage, ArtifactRecord, MediaJob, MediaProbeSummary, QaReportSummary, SourceAsset,
    TaskCancelResult, TaskRun, TaskStartResult,
};
use rusqlite::params;
use sha2::{Digest, Sha256};

use super::{ProjectStore, ProjectStoreError, epoch_ms, internal, new_id};
use crate::{
    execution::PreparedMediaTask,
    execution_support::{find, hash_file, json, write_artifact},
};

const MEDIA_OUTPUT_TYPE: &str = "media-output.v1";
const QA_REPORT_TYPE: &str = "qa-report.v1";

impl ProjectStore {
    pub fn task_start_result(
        &self,
        prepared: &PreparedMediaTask,
    ) -> Result<TaskStartResult, ProjectStoreError> {
        let (task_run, media_job, source_asset) = self.task_projection(
            &prepared.task_run.project_id,
            &prepared.task_run.task_run_id,
        )?;
        Ok(TaskStartResult {
            task_run,
            media_job,
            source_asset,
            artifact: None,
        })
    }

    pub fn task_cancel_result(
        &self,
        project_id: &str,
        task_run_id: &str,
        accepted: bool,
    ) -> Result<TaskCancelResult, ProjectStoreError> {
        let (task_run, media_job, _) = self.task_projection(project_id, task_run_id)?;
        Ok(TaskCancelResult {
            accepted,
            task_run,
            media_job,
        })
    }

    pub fn update_media_progress(
        &self,
        prepared: &PreparedMediaTask,
        progress_percent: u8,
    ) -> Result<(), ProjectStoreError> {
        let progress_percent = progress_percent.clamp(1, 99);
        self.connection()?
            .execute(
                "UPDATE media_jobs SET progress_percent = MAX(progress_percent, ?1)
                 WHERE media_job_id = ?2 AND state = 'running'",
                params![progress_percent, &prepared.media_job.media_job_id],
            )
            .map_err(internal)?;
        Ok(())
    }

    pub fn complete_media_output(
        &self,
        prepared: &PreparedMediaTask,
        media: MediaProbeSummary,
        qa: QaReportSummary,
        qa_document: &[u8],
    ) -> Result<TaskStartResult, ProjectStoreError> {
        let output = prepared.output.as_ref().ok_or_else(|| {
            ProjectStoreError::new("MEDIA_OUTPUT_INVALID", "媒体任务没有输出路径")
        })?;
        if !qa.passed || qa_document.is_empty() {
            let _ = fs::remove_file(&output.path);
            return Err(ProjectStoreError::new(
                "MEDIA_QA_FAILED",
                "媒体输出未通过 QA，不能登记成功 Artifact",
            ));
        }
        let (byte_size, sha256) = match hash_file(&output.path) {
            Ok(value) => value,
            Err(error) => {
                let _ = fs::remove_file(&output.path);
                return Err(ProjectStoreError::new(
                    "MEDIA_OUTPUT_MISSING",
                    error.message().to_owned(),
                ));
            }
        };
        let now = epoch_ms();
        let artifact_id = new_id("artifact", now);
        let qa_artifact_id = new_id("artifact", now);
        let lineage = ArtifactLineage {
            source_asset_id: prepared.task_run.source_asset_id.clone(),
            plan_id: prepared.task_run.plan_id.clone(),
            plan_version: prepared.task_run.plan_version,
            approval_id: prepared.task_run.approval_id.clone(),
            task_run_id: prepared.task_run.task_run_id.clone(),
            media_job_id: prepared.media_job.media_job_id.clone(),
        };
        let artifact = ArtifactRecord {
            artifact_id: artifact_id.clone(),
            project_id: prepared.task_run.project_id.clone(),
            artifact_type: MEDIA_OUTPUT_TYPE.to_owned(),
            schema_version: 1,
            relative_path: output.relative_path.clone(),
            byte_size,
            sha256,
            lineage: lineage.clone(),
            media: media.clone(),
            qa: None,
            created_at_epoch_ms: now,
        };
        let qa_relative_path = format!(".limeshot/artifacts/{qa_artifact_id}.json");
        let qa_path = prepared.workspace_path.join(&qa_relative_path);
        if let Err(error) = write_artifact(&qa_path, qa_document) {
            let _ = fs::remove_file(&output.path);
            return Err(error);
        }
        let qa_artifact = ArtifactRecord {
            artifact_id: qa_artifact_id.clone(),
            project_id: prepared.task_run.project_id.clone(),
            artifact_type: QA_REPORT_TYPE.to_owned(),
            schema_version: 1,
            relative_path: qa_relative_path,
            byte_size: qa_document.len() as u64,
            sha256: hex::encode(Sha256::digest(qa_document)),
            lineage,
            media,
            qa: Some(qa),
            created_at_epoch_ms: now,
        };
        let result = (|| {
            let mut connection = self.connection()?;
            let transaction = connection.transaction().map_err(internal)?;
            transaction
                .execute(
                    "INSERT INTO artifacts (artifact_id, project_id, artifact_type, schema_version, relative_path, byte_size, sha256, lineage_json, media_json, qa_json, created_at_epoch_ms)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10)",
                    params![
                        &artifact.artifact_id,
                        &artifact.project_id,
                        &artifact.artifact_type,
                        artifact.schema_version,
                        &artifact.relative_path,
                        artifact.byte_size,
                        &artifact.sha256,
                        json(&artifact.lineage)?,
                        json(&artifact.media)?,
                        now
                    ],
                )
                .map_err(internal)?;
            transaction
                .execute(
                    "INSERT INTO artifacts (artifact_id, project_id, artifact_type, schema_version, relative_path, byte_size, sha256, lineage_json, media_json, qa_json, created_at_epoch_ms)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        &qa_artifact.artifact_id,
                        &qa_artifact.project_id,
                        &qa_artifact.artifact_type,
                        qa_artifact.schema_version,
                        &qa_artifact.relative_path,
                        qa_artifact.byte_size,
                        &qa_artifact.sha256,
                        json(&qa_artifact.lineage)?,
                        json(&qa_artifact.media)?,
                        json(qa_artifact.qa.as_ref().expect("QA artifact summary"))?,
                        now
                    ],
                )
                .map_err(internal)?;
            let task_changed = transaction
                .execute(
                    "UPDATE task_runs SET state = 'succeeded', artifact_ids_json = ?1, error_code = NULL, completed_at_epoch_ms = ?2
                     WHERE task_run_id = ?3 AND state = 'running'",
                    params![
                        json(&vec![&artifact_id, &qa_artifact_id])?,
                        now,
                        &prepared.task_run.task_run_id
                    ],
                )
                .map_err(internal)?;
            let job_changed = transaction
                .execute(
                    "UPDATE media_jobs SET state = 'succeeded', progress_percent = 100, error_code = NULL, completed_at_epoch_ms = ?1
                     WHERE media_job_id = ?2 AND state = 'running'",
                    params![now, &prepared.media_job.media_job_id],
                )
                .map_err(internal)?;
            if task_changed != 1 || job_changed != 1 {
                return Err(ProjectStoreError::new(
                    "TASK_STATE_CONFLICT",
                    "媒体输出完成时任务状态已改变",
                ));
            }
            transaction.commit().map_err(internal)
        })();
        if let Err(error) = result {
            let _ = fs::remove_file(&output.path);
            let _ = fs::remove_file(&qa_path);
            return Err(error);
        }
        let (task_run, media_job, source_asset) = self.task_projection(
            &prepared.task_run.project_id,
            &prepared.task_run.task_run_id,
        )?;
        Ok(TaskStartResult {
            task_run,
            media_job,
            source_asset,
            artifact: Some(artifact),
        })
    }

    pub fn cancel_media_task(&self, prepared: &PreparedMediaTask) -> Result<(), ProjectStoreError> {
        let now = epoch_ms();
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(internal)?;
        transaction
            .execute(
                "UPDATE task_runs SET state = 'canceled', error_code = 'TASK_CANCELED', completed_at_epoch_ms = ?1
                 WHERE task_run_id = ?2 AND state IN ('queued', 'running')",
                params![now, &prepared.task_run.task_run_id],
            )
            .map_err(internal)?;
        transaction
            .execute(
                "UPDATE media_jobs SET state = 'canceled', error_code = 'TASK_CANCELED', completed_at_epoch_ms = ?1
                 WHERE media_job_id = ?2 AND state IN ('queued', 'running')",
                params![now, &prepared.media_job.media_job_id],
            )
            .map_err(internal)?;
        transaction.commit().map_err(internal)
    }

    fn task_projection(
        &self,
        project_id: &str,
        task_run_id: &str,
    ) -> Result<(TaskRun, MediaJob, SourceAsset), ProjectStoreError> {
        let execution = self.read_execution(project_id)?;
        let task_run = find(&execution.task_runs, |item| item.task_run_id == task_run_id)
            .map_err(|_| ProjectStoreError::new("TASK_NOT_FOUND", "媒体任务不存在"))?;
        let media_job = find(&execution.media_jobs, |item| {
            item.media_job_id == task_run.media_job_id
        })?;
        let source_asset = find(&execution.source_assets, |item| {
            item.source_asset_id == task_run.source_asset_id
        })?;
        Ok((task_run, media_job, source_asset))
    }
}
