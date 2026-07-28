use std::path::{Component, Path, PathBuf};

use business_protocol::{
    ArtifactLineage, DeliverableConfirmParams, DeliverableConfirmResult, DeliverableRecord,
    MediaProbeSummary, QaReportSummary,
};
use rusqlite::{Connection, OptionalExtension, Row, params};

use super::{ProjectStore, ProjectStoreError, epoch_ms, internal, new_id, to_sql_error};
use crate::execution_support::{hash_file, json};

const MEDIA_OUTPUT_TYPE: &str = "media-output.v1";
const QA_REPORT_TYPE: &str = "qa-report.v1";

pub(crate) fn migrate(connection: &mut Connection) -> Result<(), ProjectStoreError> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS deliverables (
                deliverable_id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
                qa_artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
                plan_id TEXT NOT NULL REFERENCES production_plans(plan_id),
                plan_version INTEGER NOT NULL,
                display_name TEXT NOT NULL,
                media_json TEXT NOT NULL,
                confirmed_by TEXT NOT NULL,
                confirmed_at_epoch_ms INTEGER NOT NULL,
                is_current INTEGER NOT NULL,
                UNIQUE(project_id, artifact_id)
            );
            CREATE INDEX IF NOT EXISTS deliverables_by_project
                ON deliverables(project_id, confirmed_at_epoch_ms DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS deliverables_current_by_project
                ON deliverables(project_id) WHERE is_current = 1;",
        )
        .map_err(internal)
}

pub(crate) fn deliverable_from_row(row: &Row<'_>) -> rusqlite::Result<DeliverableRecord> {
    Ok(DeliverableRecord {
        deliverable_id: row.get(0)?,
        project_id: row.get(1)?,
        artifact_id: row.get(2)?,
        qa_artifact_id: row.get(3)?,
        plan_id: row.get(4)?,
        plan_version: row.get(5)?,
        display_name: row.get(6)?,
        media: serde_json::from_str(&row.get::<_, String>(7)?).map_err(to_sql_error)?,
        confirmed_by: row.get(8)?,
        confirmed_at_epoch_ms: row.get(9)?,
        is_current: row.get(10)?,
    })
}

impl ProjectStore {
    pub fn confirm_deliverable(
        &self,
        params: DeliverableConfirmParams,
    ) -> Result<DeliverableConfirmResult, ProjectStoreError> {
        let (workspace, project_name, output, qa) = {
            let connection = self.connection()?;
            let (workspace, project_name): (String, String) = connection
                .query_row(
                    "SELECT workspace_path, name FROM projects WHERE project_id = ?1",
                    params![&params.project_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(internal)?
                .ok_or_else(|| ProjectStoreError::new("PROJECT_NOT_FOUND", "项目不存在"))?;
            let output = read_output(&connection, &params.project_id, &params.artifact_id)?;
            if output.artifact_type != MEDIA_OUTPUT_TYPE {
                return Err(ProjectStoreError::new(
                    "ARTIFACT_NOT_DELIVERABLE",
                    "只有媒体输出 Artifact 可以确认交付",
                ));
            }
            let qa = read_passing_qa(&connection, &params.project_id, &output.lineage.task_run_id)?;
            (PathBuf::from(workspace), project_name, output, qa)
        };

        verify_artifact_file(&workspace, &output)?;
        verify_artifact_file(&workspace, &qa.artifact)?;

        let now = epoch_ms();
        let deliverable_id = new_id("deliverable", now);
        let display_name = format!("{project_name}.mp4");
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(internal)?;
        let stored_sha: String = transaction
            .query_row(
                "SELECT sha256 FROM artifacts WHERE project_id = ?1 AND artifact_id = ?2",
                params![&params.project_id, &params.artifact_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(internal)?
            .ok_or_else(|| ProjectStoreError::new("ARTIFACT_NOT_FOUND", "Artifact 不存在"))?;
        if stored_sha != output.sha256 {
            return Err(ProjectStoreError::new(
                "ARTIFACT_CHANGED",
                "Artifact 记录在确认期间发生变化",
            ));
        }
        transaction
            .execute(
                "UPDATE deliverables SET is_current = 0 WHERE project_id = ?1 AND is_current = 1",
                params![&params.project_id],
            )
            .map_err(internal)?;
        let existing: Option<String> = transaction
            .query_row(
                "SELECT deliverable_id FROM deliverables WHERE project_id = ?1 AND artifact_id = ?2",
                params![&params.project_id, &params.artifact_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(internal)?;
        let selected_id = if let Some(existing) = existing {
            transaction
                .execute(
                    "UPDATE deliverables SET is_current = 1 WHERE deliverable_id = ?1",
                    params![&existing],
                )
                .map_err(internal)?;
            existing
        } else {
            transaction
                .execute(
                    "INSERT INTO deliverables (deliverable_id, project_id, artifact_id, qa_artifact_id, plan_id, plan_version, display_name, media_json, confirmed_by, confirmed_at_epoch_ms, is_current)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'user', ?9, 1)",
                    params![
                        &deliverable_id,
                        &params.project_id,
                        &params.artifact_id,
                        &qa.artifact.artifact_id,
                        &output.lineage.plan_id,
                        output.lineage.plan_version,
                        &display_name,
                        json(&output.media)?,
                        now,
                    ],
                )
                .map_err(internal)?;
            deliverable_id
        };
        let deliverable = transaction
            .query_row(
                "SELECT deliverable_id, project_id, artifact_id, qa_artifact_id, plan_id, plan_version, display_name, media_json, confirmed_by, confirmed_at_epoch_ms, is_current
                 FROM deliverables WHERE deliverable_id = ?1",
                params![&selected_id],
                deliverable_from_row,
            )
            .map_err(internal)?;
        transaction.commit().map_err(internal)?;
        Ok(DeliverableConfirmResult { deliverable })
    }
}

#[derive(Debug)]
struct StoredArtifact {
    artifact_id: String,
    artifact_type: String,
    relative_path: String,
    byte_size: u64,
    sha256: String,
    lineage: ArtifactLineage,
    media: MediaProbeSummary,
}

#[derive(Debug)]
struct PassingQa {
    artifact: StoredArtifact,
}

fn read_output(
    connection: &Connection,
    project_id: &str,
    artifact_id: &str,
) -> Result<StoredArtifact, ProjectStoreError> {
    connection
        .query_row(
            "SELECT artifact_id, artifact_type, relative_path, byte_size, sha256, lineage_json, media_json
             FROM artifacts WHERE project_id = ?1 AND artifact_id = ?2",
            params![project_id, artifact_id],
            stored_artifact_from_row,
        )
        .optional()
        .map_err(internal)?
        .ok_or_else(|| ProjectStoreError::new("ARTIFACT_NOT_FOUND", "Artifact 不存在"))
}

fn read_passing_qa(
    connection: &Connection,
    project_id: &str,
    task_run_id: &str,
) -> Result<PassingQa, ProjectStoreError> {
    let mut statement = connection
        .prepare(
            "SELECT artifact_id, artifact_type, relative_path, byte_size, sha256, lineage_json, media_json, qa_json
             FROM artifacts WHERE project_id = ?1 AND artifact_type = ?2",
        )
        .map_err(internal)?;
    let candidates = statement
        .query_map(params![project_id, QA_REPORT_TYPE], |row| {
            let artifact = stored_artifact_from_row(row)?;
            let qa = row
                .get::<_, Option<String>>(7)?
                .and_then(|value| serde_json::from_str::<QaReportSummary>(&value).ok());
            Ok((artifact, qa))
        })
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)?;
    candidates
        .into_iter()
        .find(|(artifact, qa)| {
            artifact.lineage.task_run_id == task_run_id
                && qa.as_ref().is_some_and(|summary| summary.passed)
        })
        .map(|(artifact, _)| PassingQa { artifact })
        .ok_or_else(|| ProjectStoreError::new("ARTIFACT_QA_REQUIRED", "媒体输出缺少通过的 QA 报告"))
}

fn stored_artifact_from_row(row: &Row<'_>) -> rusqlite::Result<StoredArtifact> {
    Ok(StoredArtifact {
        artifact_id: row.get(0)?,
        artifact_type: row.get(1)?,
        relative_path: row.get(2)?,
        byte_size: row.get(3)?,
        sha256: row.get(4)?,
        lineage: serde_json::from_str(&row.get::<_, String>(5)?).map_err(to_sql_error)?,
        media: serde_json::from_str(&row.get::<_, String>(6)?).map_err(to_sql_error)?,
    })
}

fn verify_artifact_file(
    workspace: &Path,
    artifact: &StoredArtifact,
) -> Result<(), ProjectStoreError> {
    let relative = Path::new(&artifact.relative_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(ProjectStoreError::new(
            "ARTIFACT_PATH_INVALID",
            "Artifact 路径无效",
        ));
    }
    let path = workspace.join(relative);
    let (byte_size, sha256) = hash_file(&path)
        .map_err(|_| ProjectStoreError::new("ARTIFACT_MISSING", "Artifact 文件不存在或无法读取"))?;
    if byte_size != artifact.byte_size || sha256 != artifact.sha256 {
        return Err(ProjectStoreError::new(
            "ARTIFACT_CHANGED",
            "Artifact 文件内容已改变",
        ));
    }
    Ok(())
}
