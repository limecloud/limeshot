use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};

use business_protocol::{
    ArtifactRecord, MediaJob, MediaJobState, SourceAsset, SourceAssetState, TaskRun, TaskRunState,
};
use rusqlite::{Connection, Row, params};
use sha2::{Digest, Sha256};

use super::{ProjectStoreError, internal, to_sql_error};

pub(crate) fn query_rows<T>(
    connection: &Connection,
    sql: &str,
    project_id: &str,
    mapper: fn(&Row<'_>) -> rusqlite::Result<T>,
) -> Result<Vec<T>, ProjectStoreError> {
    let mut statement = connection.prepare(sql).map_err(internal)?;
    statement
        .query_map(params![project_id], mapper)
        .map_err(internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(internal)
}

pub(crate) fn source_asset_from_row(row: &Row<'_>) -> rusqlite::Result<SourceAsset> {
    Ok(SourceAsset {
        source_asset_id: row.get(0)?,
        project_id: row.get(1)?,
        display_name: row.get(2)?,
        media_kind: row.get(3)?,
        byte_size: row.get(4)?,
        sha256: row.get(5)?,
        state: source_asset_state(&row.get::<_, String>(6)?).map_err(to_sql_error)?,
        probe_artifact_id: row.get(7)?,
        imported_at_epoch_ms: row.get(8)?,
        updated_at_epoch_ms: row.get(9)?,
    })
}

pub(crate) fn task_run_from_row(row: &Row<'_>) -> rusqlite::Result<TaskRun> {
    Ok(TaskRun {
        task_run_id: row.get(0)?,
        project_id: row.get(1)?,
        plan_id: row.get(2)?,
        plan_version: row.get(3)?,
        approval_id: row.get(4)?,
        source_asset_id: row.get(5)?,
        operation_id: row.get(6)?,
        retry_of_task_run_id: row.get(7)?,
        state: task_state(&row.get::<_, String>(8)?).map_err(to_sql_error)?,
        input_sha256: row.get(9)?,
        media_job_id: row.get(10)?,
        artifact_ids: serde_json::from_str(&row.get::<_, String>(11)?).map_err(to_sql_error)?,
        error_code: row.get(12)?,
        created_at_epoch_ms: row.get(13)?,
        started_at_epoch_ms: row.get(14)?,
        completed_at_epoch_ms: row.get(15)?,
    })
}

pub(crate) fn media_job_from_row(row: &Row<'_>) -> rusqlite::Result<MediaJob> {
    Ok(MediaJob {
        media_job_id: row.get(0)?,
        task_run_id: row.get(1)?,
        operation: row.get(2)?,
        state: media_job_state(&row.get::<_, String>(3)?).map_err(to_sql_error)?,
        progress_percent: row.get(4)?,
        error_code: row.get(5)?,
        created_at_epoch_ms: row.get(6)?,
        started_at_epoch_ms: row.get(7)?,
        completed_at_epoch_ms: row.get(8)?,
    })
}

pub(crate) fn artifact_from_row(row: &Row<'_>) -> rusqlite::Result<ArtifactRecord> {
    Ok(ArtifactRecord {
        artifact_id: row.get(0)?,
        project_id: row.get(1)?,
        artifact_type: row.get(2)?,
        schema_version: row.get(3)?,
        relative_path: row.get(4)?,
        byte_size: row.get(5)?,
        sha256: row.get(6)?,
        lineage: serde_json::from_str(&row.get::<_, String>(7)?).map_err(to_sql_error)?,
        media: serde_json::from_str(&row.get::<_, String>(8)?).map_err(to_sql_error)?,
        qa: row
            .get::<_, Option<String>>(9)?
            .map(|value| serde_json::from_str(&value))
            .transpose()
            .map_err(to_sql_error)?,
        created_at_epoch_ms: row.get(10)?,
    })
}

fn source_asset_state(value: &str) -> Result<SourceAssetState, ProjectStoreError> {
    match value {
        "imported" => Ok(SourceAssetState::Imported),
        "probed" => Ok(SourceAssetState::Probed),
        "changed" => Ok(SourceAssetState::Changed),
        "missing" => Ok(SourceAssetState::Missing),
        _ => Err(internal("素材状态损坏")),
    }
}

fn task_state(value: &str) -> Result<TaskRunState, ProjectStoreError> {
    match value {
        "draft" => Ok(TaskRunState::Draft),
        "awaiting_approval" => Ok(TaskRunState::AwaitingApproval),
        "queued" => Ok(TaskRunState::Queued),
        "running" => Ok(TaskRunState::Running),
        "partially_succeeded" => Ok(TaskRunState::PartiallySucceeded),
        "succeeded" => Ok(TaskRunState::Succeeded),
        "failed" => Ok(TaskRunState::Failed),
        "canceled" => Ok(TaskRunState::Canceled),
        "interrupted" => Ok(TaskRunState::Interrupted),
        _ => Err(internal("TaskRun 状态损坏")),
    }
}

fn media_job_state(value: &str) -> Result<MediaJobState, ProjectStoreError> {
    match value {
        "queued" => Ok(MediaJobState::Queued),
        "running" => Ok(MediaJobState::Running),
        "succeeded" => Ok(MediaJobState::Succeeded),
        "failed" => Ok(MediaJobState::Failed),
        "canceled" => Ok(MediaJobState::Canceled),
        "interrupted" => Ok(MediaJobState::Interrupted),
        _ => Err(internal("MediaJob 状态损坏")),
    }
}

pub(crate) fn safe_extension(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| {
            !extension.is_empty()
                && extension.len() <= 12
                && extension.bytes().all(|byte| byte.is_ascii_alphanumeric())
        })
        .unwrap_or_default()
}

pub(crate) fn media_kind(path: &Path) -> String {
    match safe_extension(path).as_str() {
        "wav" | "mp3" | "m4a" | "aac" | "flac" | "ogg" => "audio",
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "heic" => "image",
        "txt" | "md" | "json" | "srt" | "vtt" => "text",
        _ => "video",
    }
    .to_owned()
}

pub(crate) fn copy_exclusive(source: &Path, destination: &Path) -> Result<(), ProjectStoreError> {
    let mut reader = File::open(source).map_err(internal)?;
    let mut writer = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(internal)?;
    std::io::copy(&mut reader, &mut writer).map_err(internal)?;
    writer.sync_all().map_err(internal)
}

pub(crate) fn hash_file(path: &Path) -> Result<(u64, String), ProjectStoreError> {
    let mut file = File::open(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            ProjectStoreError::new("SOURCE_ASSET_MISSING", "已导入素材不存在")
        } else {
            internal(error)
        }
    })?;
    let mut hasher = Sha256::new();
    let mut byte_size = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(internal)?;
        if read == 0 {
            break;
        }
        byte_size += read as u64;
        hasher.update(&buffer[..read]);
    }
    Ok((byte_size, hex::encode(hasher.finalize())))
}

pub(crate) fn write_artifact(path: &Path, document: &[u8]) -> Result<(), ProjectStoreError> {
    let parent = path
        .parent()
        .ok_or_else(|| ProjectStoreError::new("ARTIFACT_INVALID", "Artifact 路径无效"))?;
    fs::create_dir_all(parent).map_err(internal)?;
    let partial = parent.join(format!(
        ".{}.part",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("artifact")
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&partial)
        .map_err(internal)?;
    if let Err(error) = file.write_all(document).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&partial);
        return Err(internal(error));
    }
    if let Err(error) = fs::rename(&partial, path) {
        let _ = fs::remove_file(&partial);
        return Err(internal(error));
    }
    Ok(())
}

pub(crate) fn json(value: &impl serde::Serialize) -> Result<String, ProjectStoreError> {
    serde_json::to_string(value).map_err(internal)
}

pub(crate) fn find<T: Clone>(
    values: &[T],
    predicate: impl Fn(&T) -> bool,
) -> Result<T, ProjectStoreError> {
    values
        .iter()
        .find(|value| predicate(value))
        .cloned()
        .ok_or_else(|| internal("刚完成的执行记录无法读取"))
}
