use std::{fs, path::PathBuf};

use business_protocol::{
    ArtifactLineage, ArtifactRecord, MediaJob, MediaJobState, MediaProbeSummary, PlanInput,
    ProjectExecutionReadResult, SourceAsset, SourceAssetImportParams, SourceAssetImportResult,
    SourceAssetState, TaskRetryParams, TaskRun, TaskRunState, TaskStartParams, TaskStartResult,
};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use sha2::{Digest, Sha256};

use super::{ProjectStore, ProjectStoreError, epoch_ms, internal, new_id};
use crate::deliverables::deliverable_from_row;
use crate::execution_support::{
    artifact_from_row, copy_exclusive, find, hash_file, json, media_job_from_row, media_kind,
    query_rows, safe_extension, source_asset_from_row, task_run_from_row, write_artifact,
};

pub(crate) const MEDIA_PROBE_OPERATION: &str = "media_probe";
pub(crate) const MEDIA_TRANSCODE_OPERATION: &str = "media_transcode";
const MEDIA_MANIFEST_TYPE: &str = "media-manifest.v1";

#[derive(Debug, Clone)]
pub struct PreparedMediaTask {
    pub task_run: TaskRun,
    pub media_job: MediaJob,
    pub source_path: PathBuf,
    pub workspace_path: PathBuf,
    pub output: Option<PreparedMediaOutput>,
}

#[derive(Debug, Clone)]
pub struct PreparedMediaOutput {
    pub relative_path: String,
    pub path: PathBuf,
    pub partial_path: PathBuf,
}

pub(crate) fn migrate(connection: &mut Connection) -> Result<(), ProjectStoreError> {
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS source_assets (
                source_asset_id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                display_name TEXT NOT NULL,
                media_kind TEXT NOT NULL,
                stored_relative_path TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                state TEXT NOT NULL,
                probe_artifact_id TEXT,
                imported_at_epoch_ms INTEGER NOT NULL,
                updated_at_epoch_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS source_assets_by_project
                ON source_assets(project_id, imported_at_epoch_ms DESC);
            CREATE TABLE IF NOT EXISTS task_runs (
                task_run_id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                plan_id TEXT NOT NULL REFERENCES production_plans(plan_id),
                plan_version INTEGER NOT NULL,
                approval_id TEXT NOT NULL REFERENCES approval_receipts(approval_id),
                source_asset_id TEXT NOT NULL REFERENCES source_assets(source_asset_id),
                operation_id TEXT NOT NULL,
                retry_of_task_run_id TEXT REFERENCES task_runs(task_run_id),
                state TEXT NOT NULL,
                input_sha256 TEXT NOT NULL,
                media_job_id TEXT NOT NULL UNIQUE,
                artifact_ids_json TEXT NOT NULL,
                error_code TEXT,
                created_at_epoch_ms INTEGER NOT NULL,
                started_at_epoch_ms INTEGER,
                completed_at_epoch_ms INTEGER
            );
            CREATE INDEX IF NOT EXISTS task_runs_by_project
                ON task_runs(project_id, created_at_epoch_ms DESC);
            CREATE TABLE IF NOT EXISTS media_jobs (
                media_job_id TEXT PRIMARY KEY NOT NULL,
                task_run_id TEXT NOT NULL UNIQUE REFERENCES task_runs(task_run_id),
                operation TEXT NOT NULL,
                state TEXT NOT NULL,
                progress_percent INTEGER NOT NULL,
                error_code TEXT,
                created_at_epoch_ms INTEGER NOT NULL,
                started_at_epoch_ms INTEGER,
                completed_at_epoch_ms INTEGER
            );
            CREATE TABLE IF NOT EXISTS artifacts (
                artifact_id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                artifact_type TEXT NOT NULL,
                schema_version INTEGER NOT NULL,
                relative_path TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                lineage_json TEXT NOT NULL,
                media_json TEXT NOT NULL,
                qa_json TEXT,
                created_at_epoch_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS artifacts_by_project
                ON artifacts(project_id, created_at_epoch_ms DESC);
            ",
        )
        .map_err(internal)?;
    if !task_runs_has_retry_column(connection)? {
        connection
            .execute(
                "ALTER TABLE task_runs ADD COLUMN retry_of_task_run_id TEXT REFERENCES task_runs(task_run_id)",
                [],
            )
            .map_err(internal)?;
    }
    if !table_has_column(connection, "artifacts", "qa_json")? {
        connection
            .execute("ALTER TABLE artifacts ADD COLUMN qa_json TEXT", [])
            .map_err(internal)?;
    }
    let stale_partials = {
        let mut statement = connection
            .prepare(
                "SELECT projects.workspace_path, task_runs.task_run_id
                 FROM task_runs
                 JOIN media_jobs ON media_jobs.task_run_id = task_runs.task_run_id
                 JOIN projects ON projects.project_id = task_runs.project_id
                 WHERE task_runs.state IN ('queued', 'running')
                   AND media_jobs.operation = 'media_transcode'",
            )
            .map_err(internal)?;
        statement
            .query_map([], |row| {
                let workspace: String = row.get(0)?;
                let task_run_id: String = row.get(1)?;
                Ok(PathBuf::from(workspace).join(format!("outputs/.{task_run_id}.mp4.part")))
            })
            .map_err(internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(internal)?
    };
    for partial in stale_partials {
        match fs::remove_file(&partial) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(internal(error)),
        }
    }
    let now = epoch_ms();
    connection
        .execute(
            "UPDATE task_runs SET state = 'interrupted', error_code = 'APP_RESTARTED', completed_at_epoch_ms = ?1
             WHERE state IN ('queued', 'running')",
            params![now],
        )
        .map_err(internal)?;
    connection
        .execute(
            "UPDATE media_jobs SET state = 'interrupted', error_code = 'APP_RESTARTED', progress_percent = 0, completed_at_epoch_ms = ?1
             WHERE state IN ('queued', 'running')",
            params![now],
        )
        .map_err(internal)?;
    Ok(())
}

impl ProjectStore {
    pub fn import_source_asset(
        &self,
        params: SourceAssetImportParams,
    ) -> Result<SourceAssetImportResult, ProjectStoreError> {
        let source = PathBuf::from(&params.source_path);
        if !source.is_absolute() || !source.is_file() {
            return Err(ProjectStoreError::new(
                "SOURCE_ASSET_INVALID",
                "导入素材必须是存在的绝对文件路径",
            ));
        }
        let source = source.canonicalize().map_err(internal)?;
        let display_name = source
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or_else(|| ProjectStoreError::new("SOURCE_ASSET_INVALID", "素材文件名无效"))?
            .to_owned();
        let workspace_path = {
            let connection = self.connection()?;
            project_workspace(&connection, &params.project_id)?
        };
        let now = epoch_ms();
        let source_asset_id = new_id("asset", now);
        let extension = safe_extension(&source);
        let stored_name = if extension.is_empty() {
            source_asset_id.clone()
        } else {
            format!("{source_asset_id}.{extension}")
        };
        let relative_path = format!("assets/{stored_name}");
        let asset_root = workspace_path.join("assets");
        fs::create_dir_all(&asset_root).map_err(internal)?;
        let destination = asset_root.join(&stored_name);
        let partial = asset_root.join(format!(".{stored_name}.part"));
        if let Err(error) = copy_exclusive(&source, &partial) {
            let _ = fs::remove_file(&partial);
            return Err(error);
        }
        if let Err(error) = fs::rename(&partial, &destination) {
            let _ = fs::remove_file(&partial);
            return Err(internal(error));
        }
        let (byte_size, sha256) = match hash_file(&destination) {
            Ok(value) => value,
            Err(error) => {
                let _ = fs::remove_file(&destination);
                return Err(error);
            }
        };
        let source_asset = SourceAsset {
            source_asset_id,
            project_id: params.project_id,
            display_name,
            media_kind: media_kind(&source),
            byte_size,
            sha256,
            state: SourceAssetState::Imported,
            probe_artifact_id: None,
            imported_at_epoch_ms: now,
            updated_at_epoch_ms: now,
        };
        let insert = self.connection()?.execute(
            "INSERT INTO source_assets (source_asset_id, project_id, display_name, media_kind, stored_relative_path, byte_size, sha256, state, probe_artifact_id, imported_at_epoch_ms, updated_at_epoch_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'imported', NULL, ?8, ?8)",
            params![
                &source_asset.source_asset_id,
                &source_asset.project_id,
                &source_asset.display_name,
                &source_asset.media_kind,
                &relative_path,
                source_asset.byte_size,
                &source_asset.sha256,
                now,
            ],
        );
        if let Err(error) = insert {
            let _ = fs::remove_file(&destination);
            return Err(internal(error));
        }
        Ok(SourceAssetImportResult { source_asset })
    }

    pub fn read_execution(
        &self,
        project_id: &str,
    ) -> Result<ProjectExecutionReadResult, ProjectStoreError> {
        let connection = self.connection()?;
        ensure_project(&connection, project_id)?;
        Ok(ProjectExecutionReadResult {
            source_assets: query_rows(
                &connection,
                "SELECT source_asset_id, project_id, display_name, media_kind, byte_size, sha256, state, probe_artifact_id, imported_at_epoch_ms, updated_at_epoch_ms
                 FROM source_assets WHERE project_id = ?1 ORDER BY imported_at_epoch_ms DESC",
                project_id,
                source_asset_from_row,
            )?,
            task_runs: query_rows(
                &connection,
                "SELECT task_run_id, project_id, plan_id, plan_version, approval_id, source_asset_id, operation_id, retry_of_task_run_id, state, input_sha256, media_job_id, artifact_ids_json, error_code, created_at_epoch_ms, started_at_epoch_ms, completed_at_epoch_ms
                 FROM task_runs WHERE project_id = ?1 ORDER BY created_at_epoch_ms DESC",
                project_id,
                task_run_from_row,
            )?,
            media_jobs: query_rows(
                &connection,
                "SELECT media_job_id, task_run_id, operation, state, progress_percent, error_code, created_at_epoch_ms, started_at_epoch_ms, completed_at_epoch_ms
                 FROM media_jobs WHERE task_run_id IN (SELECT task_run_id FROM task_runs WHERE project_id = ?1) ORDER BY created_at_epoch_ms DESC",
                project_id,
                media_job_from_row,
            )?,
            artifacts: query_rows(
                &connection,
                "SELECT artifact_id, project_id, artifact_type, schema_version, relative_path, byte_size, sha256, lineage_json, media_json, qa_json, created_at_epoch_ms
                 FROM artifacts WHERE project_id = ?1 ORDER BY created_at_epoch_ms DESC",
                project_id,
                artifact_from_row,
            )?,
            deliverables: query_rows(
                &connection,
                "SELECT deliverable_id, project_id, artifact_id, qa_artifact_id, plan_id, plan_version, display_name, media_json, confirmed_by, confirmed_at_epoch_ms, is_current
                 FROM deliverables WHERE project_id = ?1 ORDER BY confirmed_at_epoch_ms DESC",
                project_id,
                deliverable_from_row,
            )?,
        })
    }

    pub fn prepare_media_task(
        &self,
        params: TaskStartParams,
    ) -> Result<PreparedMediaTask, ProjectStoreError> {
        self.prepare_media_task_inner(params, None)
    }

    pub fn prepare_media_retry(
        &self,
        params: TaskRetryParams,
    ) -> Result<PreparedMediaTask, ProjectStoreError> {
        let (plan_id, source_asset_id, operation_id, state): (String, String, String, String) =
            self.connection()?
                .query_row(
                    "SELECT plan_id, source_asset_id, operation_id, state FROM task_runs
                 WHERE project_id = ?1 AND task_run_id = ?2",
                    params![&params.project_id, &params.task_run_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .optional()
                .map_err(internal)?
                .ok_or_else(|| ProjectStoreError::new("TASK_NOT_FOUND", "媒体任务不存在"))?;
        ensure_retryable(&state)?;
        self.prepare_media_task_inner(
            TaskStartParams {
                project_id: params.project_id,
                plan_id,
                source_asset_id,
                operation_id,
            },
            Some(params.task_run_id),
        )
    }

    fn prepare_media_task_inner(
        &self,
        params: TaskStartParams,
        retry_of_task_run_id: Option<String>,
    ) -> Result<PreparedMediaTask, ProjectStoreError> {
        let now = epoch_ms();
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(internal)?;
        if let Some(task_run_id) = retry_of_task_run_id.as_deref() {
            let state: String = transaction
                .query_row(
                    "SELECT state FROM task_runs WHERE project_id = ?1 AND task_run_id = ?2",
                    params![&params.project_id, task_run_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(internal)?
                .ok_or_else(|| ProjectStoreError::new("TASK_NOT_FOUND", "媒体任务不存在"))?;
            ensure_retryable(&state)?;
            let already_retried: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM task_runs WHERE retry_of_task_run_id = ?1)",
                    params![task_run_id],
                    |row| row.get(0),
                )
                .map_err(internal)?;
            if already_retried {
                return Err(ProjectStoreError::new(
                    "TASK_ALREADY_RETRIED",
                    "该任务已有后续重试记录",
                ));
            }
        }
        let (plan_version, plan_content, plan_state): (u32, String, String) = transaction
            .query_row(
                "SELECT version, content_json, state FROM production_plans WHERE project_id = ?1 AND plan_id = ?2",
                params![&params.project_id, &params.plan_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(internal)?
            .ok_or_else(|| ProjectStoreError::new("PLAN_NOT_FOUND", "计划不存在"))?;
        if !matches!(plan_state.as_str(), "approved" | "executing") {
            return Err(ProjectStoreError::new(
                "TASK_APPROVAL_REQUIRED",
                "只有已批准的计划可以开始媒体任务",
            ));
        }
        let plan: PlanInput = serde_json::from_str(&plan_content).map_err(internal)?;
        let operation = plan
            .operations
            .iter()
            .find(|operation| operation.operation_id == params.operation_id)
            .ok_or_else(|| {
                ProjectStoreError::new("TASK_OPERATION_NOT_FOUND", "计划中不存在该 operation")
            })?;
        if !matches!(
            operation.kind.as_str(),
            MEDIA_PROBE_OPERATION | MEDIA_TRANSCODE_OPERATION
        ) {
            return Err(ProjectStoreError::new(
                "TASK_OPERATION_NOT_ALLOWED",
                "媒体执行器不支持该 operation",
            ));
        }
        let operation_kind = operation.kind.clone();
        let dependencies = operation.depends_on.clone();
        let approval_id: String = transaction
            .query_row(
                "SELECT approval_id FROM approval_receipts
                 WHERE project_id = ?1 AND plan_id = ?2 AND plan_version = ?3 AND decision = 'approve'
                 ORDER BY decided_at_epoch_ms DESC LIMIT 1",
                params![&params.project_id, &params.plan_id, plan_version],
                |row| row.get(0),
            )
            .optional()
            .map_err(internal)?
            .ok_or_else(|| {
                ProjectStoreError::new("TASK_APPROVAL_REQUIRED", "计划缺少有效批准凭证")
            })?;
        let active: Option<String> = transaction
            .query_row(
                "SELECT task_run_id FROM task_runs
                 WHERE project_id = ?1 AND plan_id = ?2 AND source_asset_id = ?3 AND operation_id = ?4 AND state IN ('queued', 'running') LIMIT 1",
                params![&params.project_id, &params.plan_id, &params.source_asset_id, &params.operation_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(internal)?;
        if active.is_some() {
            return Err(ProjectStoreError::new(
                "TASK_ALREADY_RUNNING",
                "相同媒体 operation 已在执行",
            ));
        }
        let stored = read_stored_asset(&transaction, &params.project_id, &params.source_asset_id)?;
        if operation_kind == MEDIA_TRANSCODE_OPERATION
            && !matches!(stored.asset.media_kind.as_str(), "video" | "audio")
        {
            return Err(ProjectStoreError::new(
                "MEDIA_INPUT_UNSUPPORTED",
                "首个媒体输出 operation 只接受视频或音频素材",
            ));
        }
        for dependency in dependencies {
            let completed: bool = transaction
                .query_row(
                    "SELECT EXISTS(
                        SELECT 1 FROM task_runs
                        WHERE project_id = ?1 AND plan_id = ?2 AND source_asset_id = ?3
                          AND operation_id = ?4 AND state = 'succeeded'
                    )",
                    params![
                        &params.project_id,
                        &params.plan_id,
                        &params.source_asset_id,
                        dependency
                    ],
                    |row| row.get(0),
                )
                .map_err(internal)?;
            if !completed {
                return Err(ProjectStoreError::new(
                    "TASK_DEPENDENCY_INCOMPLETE",
                    "媒体 operation 的前置任务尚未成功",
                ));
            }
        }
        let workspace_path = project_workspace(&transaction, &params.project_id)?;
        let source_path = workspace_path.join(&stored.relative_path);
        let (byte_size, actual_sha256) = match hash_file(&source_path) {
            Ok(value) => value,
            Err(error) if error.code() == "SOURCE_ASSET_MISSING" => {
                transaction
                    .execute(
                        "UPDATE source_assets SET state = 'missing', updated_at_epoch_ms = ?1 WHERE source_asset_id = ?2",
                        params![now, &params.source_asset_id],
                    )
                    .map_err(internal)?;
                transaction.commit().map_err(internal)?;
                return Err(error);
            }
            Err(error) => return Err(error),
        };
        if byte_size != stored.asset.byte_size || actual_sha256 != stored.asset.sha256 {
            transaction
                .execute(
                    "UPDATE source_assets SET state = 'changed', updated_at_epoch_ms = ?1 WHERE source_asset_id = ?2",
                    params![now, &params.source_asset_id],
                )
                .map_err(internal)?;
            transaction.commit().map_err(internal)?;
            return Err(ProjectStoreError::new(
                "SOURCE_ASSET_CHANGED",
                "素材内容已改变，必须重新导入并重新批准",
            ));
        }

        let task_run_id = new_id("task", now);
        let media_job_id = new_id("media", now);
        transaction
            .execute(
                "INSERT INTO task_runs (task_run_id, project_id, plan_id, plan_version, approval_id, source_asset_id, operation_id, retry_of_task_run_id, state, input_sha256, media_job_id, artifact_ids_json, error_code, created_at_epoch_ms, started_at_epoch_ms, completed_at_epoch_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'queued', ?9, ?10, '[]', NULL, ?11, NULL, NULL)",
                params![&task_run_id, &params.project_id, &params.plan_id, plan_version, &approval_id, &params.source_asset_id, &params.operation_id, retry_of_task_run_id.as_deref(), &actual_sha256, &media_job_id, now],
            )
            .map_err(internal)?;
        transaction
            .execute(
                "INSERT INTO media_jobs (media_job_id, task_run_id, operation, state, progress_percent, error_code, created_at_epoch_ms, started_at_epoch_ms, completed_at_epoch_ms)
                 VALUES (?1, ?2, ?3, 'queued', 0, NULL, ?4, NULL, NULL)",
                params![&media_job_id, &task_run_id, &operation_kind, now],
            )
            .map_err(internal)?;
        transaction.commit().map_err(internal)?;
        let output = if operation_kind == MEDIA_TRANSCODE_OPERATION {
            let relative_path = format!("outputs/{task_run_id}.mp4");
            Some(PreparedMediaOutput {
                path: workspace_path.join(&relative_path),
                partial_path: workspace_path.join(format!("outputs/.{task_run_id}.mp4.part")),
                relative_path,
            })
        } else {
            None
        };
        Ok(PreparedMediaTask {
            task_run: TaskRun {
                task_run_id: task_run_id.clone(),
                project_id: params.project_id,
                plan_id: params.plan_id,
                plan_version,
                approval_id,
                source_asset_id: params.source_asset_id,
                operation_id: params.operation_id,
                retry_of_task_run_id,
                state: TaskRunState::Queued,
                input_sha256: actual_sha256,
                media_job_id: media_job_id.clone(),
                artifact_ids: vec![],
                error_code: None,
                created_at_epoch_ms: now,
                started_at_epoch_ms: None,
                completed_at_epoch_ms: None,
            },
            media_job: MediaJob {
                media_job_id,
                task_run_id,
                operation: operation_kind,
                state: MediaJobState::Queued,
                progress_percent: 0,
                error_code: None,
                created_at_epoch_ms: now,
                started_at_epoch_ms: None,
                completed_at_epoch_ms: None,
            },
            source_path,
            workspace_path,
            output,
        })
    }

    pub fn mark_media_task_running(
        &self,
        prepared: &PreparedMediaTask,
    ) -> Result<(), ProjectStoreError> {
        let now = epoch_ms();
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(internal)?;
        let task_changed = transaction
            .execute(
                "UPDATE task_runs SET state = 'running', started_at_epoch_ms = ?1
                 WHERE task_run_id = ?2 AND state = 'queued'",
                params![now, &prepared.task_run.task_run_id],
            )
            .map_err(internal)?;
        let job_changed = transaction
            .execute(
                "UPDATE media_jobs SET state = 'running', progress_percent = 10, started_at_epoch_ms = ?1
                 WHERE media_job_id = ?2 AND state = 'queued'",
                params![now, &prepared.media_job.media_job_id],
            )
            .map_err(internal)?;
        if task_changed != 1 || job_changed != 1 {
            return Err(ProjectStoreError::new(
                "TASK_STATE_CONFLICT",
                "媒体任务状态已改变",
            ));
        }
        transaction.commit().map_err(internal)
    }

    pub fn complete_media_probe(
        &self,
        prepared: &PreparedMediaTask,
        media: MediaProbeSummary,
        artifact_document: &[u8],
    ) -> Result<TaskStartResult, ProjectStoreError> {
        if artifact_document.is_empty() {
            return Err(ProjectStoreError::new(
                "ARTIFACT_INVALID",
                "Artifact 文档不能为空",
            ));
        }
        let now = epoch_ms();
        let artifact_id = new_id("artifact", now);
        let relative_path = format!(".limeshot/artifacts/{artifact_id}.json");
        let destination = prepared.workspace_path.join(&relative_path);
        write_artifact(&destination, artifact_document)?;
        let artifact_sha256 = hex::encode(Sha256::digest(artifact_document));
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
            artifact_type: MEDIA_MANIFEST_TYPE.to_owned(),
            schema_version: 1,
            relative_path,
            byte_size: artifact_document.len() as u64,
            sha256: artifact_sha256,
            lineage,
            media,
            qa: None,
            created_at_epoch_ms: now,
        };

        let result = (|| {
            let mut connection = self.connection()?;
            let transaction = connection.transaction().map_err(internal)?;
            transaction
                .execute(
                    "INSERT INTO artifacts (artifact_id, project_id, artifact_type, schema_version, relative_path, byte_size, sha256, lineage_json, media_json, qa_json, created_at_epoch_ms)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10)",
                    params![&artifact.artifact_id, &artifact.project_id, &artifact.artifact_type, artifact.schema_version, &artifact.relative_path, artifact.byte_size, &artifact.sha256, json(&artifact.lineage)?, json(&artifact.media)?, now],
                )
                .map_err(internal)?;
            let task_changed = transaction
                .execute(
                    "UPDATE task_runs SET state = 'succeeded', artifact_ids_json = ?1, error_code = NULL, completed_at_epoch_ms = ?2
                     WHERE task_run_id = ?3 AND state = 'running'",
                    params![json(&vec![&artifact_id])?, now, &prepared.task_run.task_run_id],
                )
                .map_err(internal)?;
            let job_changed = transaction
                .execute(
                    "UPDATE media_jobs SET state = 'succeeded', progress_percent = 100, error_code = NULL, completed_at_epoch_ms = ?1
                     WHERE media_job_id = ?2 AND state = 'running'",
                    params![now, &prepared.media_job.media_job_id],
                )
                .map_err(internal)?;
            let asset_changed = transaction
                .execute(
                    "UPDATE source_assets SET state = 'probed', probe_artifact_id = ?1, updated_at_epoch_ms = ?2
                     WHERE source_asset_id = ?3",
                    params![&artifact_id, now, &prepared.task_run.source_asset_id],
                )
                .map_err(internal)?;
            if task_changed != 1 || job_changed != 1 || asset_changed != 1 {
                return Err(ProjectStoreError::new(
                    "TASK_STATE_CONFLICT",
                    "媒体任务完成时状态已改变",
                ));
            }
            transaction.commit().map_err(internal)
        })();
        if let Err(error) = result {
            let _ = fs::remove_file(&destination);
            return Err(error);
        }
        let execution = self.read_execution(&prepared.task_run.project_id)?;
        Ok(TaskStartResult {
            task_run: find(&execution.task_runs, |item| {
                item.task_run_id == prepared.task_run.task_run_id
            })?,
            media_job: find(&execution.media_jobs, |item| {
                item.media_job_id == prepared.media_job.media_job_id
            })?,
            source_asset: find(&execution.source_assets, |item| {
                item.source_asset_id == prepared.task_run.source_asset_id
            })?,
            artifact: Some(artifact),
        })
    }

    pub fn fail_media_task(
        &self,
        prepared: &PreparedMediaTask,
        error_code: &str,
    ) -> Result<(), ProjectStoreError> {
        let now = epoch_ms();
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(internal)?;
        transaction
            .execute(
                "UPDATE task_runs SET state = 'failed', error_code = ?1, completed_at_epoch_ms = ?2
                 WHERE task_run_id = ?3 AND state IN ('queued', 'running')",
                params![error_code, now, &prepared.task_run.task_run_id],
            )
            .map_err(internal)?;
        transaction
            .execute(
                "UPDATE media_jobs SET state = 'failed', progress_percent = 0, error_code = ?1, completed_at_epoch_ms = ?2
                 WHERE media_job_id = ?3 AND state IN ('queued', 'running')",
                params![error_code, now, &prepared.media_job.media_job_id],
            )
            .map_err(internal)?;
        transaction.commit().map_err(internal)
    }
}

fn task_runs_has_retry_column(connection: &Connection) -> Result<bool, ProjectStoreError> {
    table_has_column(connection, "task_runs", "retry_of_task_run_id")
}

fn table_has_column(
    connection: &Connection,
    table: &str,
    expected: &str,
) -> Result<bool, ProjectStoreError> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(internal)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?;
    Ok(columns.iter().any(|column| column == expected))
}

fn ensure_retryable(state: &str) -> Result<(), ProjectStoreError> {
    if matches!(state, "failed" | "canceled" | "interrupted") {
        Ok(())
    } else {
        Err(ProjectStoreError::new(
            "TASK_NOT_RETRYABLE",
            "只有失败、取消或中断的任务可以重试",
        ))
    }
}

#[derive(Debug)]
struct StoredAsset {
    asset: SourceAsset,
    relative_path: String,
}

fn read_stored_asset(
    transaction: &Transaction<'_>,
    project_id: &str,
    source_asset_id: &str,
) -> Result<StoredAsset, ProjectStoreError> {
    transaction
        .query_row(
            "SELECT source_asset_id, project_id, display_name, media_kind, byte_size, sha256, state, probe_artifact_id, imported_at_epoch_ms, updated_at_epoch_ms, stored_relative_path
             FROM source_assets WHERE project_id = ?1 AND source_asset_id = ?2",
            params![project_id, source_asset_id],
            |row| {
                Ok(StoredAsset {
                    asset: source_asset_from_row(row)?,
                    relative_path: row.get(10)?,
                })
            },
        )
        .optional()
        .map_err(internal)?
        .ok_or_else(|| ProjectStoreError::new("SOURCE_ASSET_NOT_FOUND", "素材不存在"))
}

fn project_workspace(
    connection: &Connection,
    project_id: &str,
) -> Result<PathBuf, ProjectStoreError> {
    connection
        .query_row(
            "SELECT workspace_path FROM projects WHERE project_id = ?1",
            params![project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(internal)?
        .map(PathBuf::from)
        .ok_or_else(|| ProjectStoreError::new("PROJECT_NOT_FOUND", "项目不存在"))
}

fn ensure_project(connection: &Connection, project_id: &str) -> Result<(), ProjectStoreError> {
    project_workspace(connection, project_id).map(|_| ())
}
