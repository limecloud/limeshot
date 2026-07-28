use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceAssetState {
    Imported,
    Probed,
    Changed,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceAsset {
    pub source_asset_id: String,
    pub project_id: String,
    pub display_name: String,
    pub media_kind: String,
    pub byte_size: u64,
    pub sha256: String,
    pub state: SourceAssetState,
    pub probe_artifact_id: Option<String>,
    pub imported_at_epoch_ms: i64,
    pub updated_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceAssetImportParams {
    pub project_id: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceAssetImportResult {
    pub source_asset: SourceAsset,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskRunState {
    Draft,
    AwaitingApproval,
    Queued,
    Running,
    PartiallySucceeded,
    Succeeded,
    Failed,
    Canceled,
    Interrupted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MediaJobState {
    Queued,
    Running,
    Succeeded,
    Failed,
    Canceled,
    Interrupted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaStreamSummary {
    pub index: u32,
    pub kind: String,
    pub codec: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbeSummary {
    pub duration_ms: u64,
    pub container: String,
    pub byte_size: u64,
    pub streams: Vec<MediaStreamSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QaCheckSummary {
    pub check_id: String,
    pub passed: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QaReportSummary {
    pub passed: bool,
    pub checks: Vec<QaCheckSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactLineage {
    pub source_asset_id: String,
    pub plan_id: String,
    pub plan_version: u32,
    pub approval_id: String,
    pub task_run_id: String,
    pub media_job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactRecord {
    pub artifact_id: String,
    pub project_id: String,
    pub artifact_type: String,
    pub schema_version: u32,
    pub relative_path: String,
    pub byte_size: u64,
    pub sha256: String,
    pub lineage: ArtifactLineage,
    pub media: MediaProbeSummary,
    pub qa: Option<QaReportSummary>,
    pub created_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeliverableRecord {
    pub deliverable_id: String,
    pub project_id: String,
    pub artifact_id: String,
    pub qa_artifact_id: String,
    pub plan_id: String,
    pub plan_version: u32,
    pub display_name: String,
    pub media: MediaProbeSummary,
    pub confirmed_by: String,
    pub confirmed_at_epoch_ms: i64,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaJob {
    pub media_job_id: String,
    pub task_run_id: String,
    pub operation: String,
    pub state: MediaJobState,
    pub progress_percent: u8,
    pub error_code: Option<String>,
    pub created_at_epoch_ms: i64,
    pub started_at_epoch_ms: Option<i64>,
    pub completed_at_epoch_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskRun {
    pub task_run_id: String,
    pub project_id: String,
    pub plan_id: String,
    pub plan_version: u32,
    pub approval_id: String,
    pub source_asset_id: String,
    pub operation_id: String,
    pub retry_of_task_run_id: Option<String>,
    pub state: TaskRunState,
    pub input_sha256: String,
    pub media_job_id: String,
    pub artifact_ids: Vec<String>,
    pub error_code: Option<String>,
    pub created_at_epoch_ms: i64,
    pub started_at_epoch_ms: Option<i64>,
    pub completed_at_epoch_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectExecutionReadParams {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectExecutionReadResult {
    pub source_assets: Vec<SourceAsset>,
    pub task_runs: Vec<TaskRun>,
    pub media_jobs: Vec<MediaJob>,
    pub artifacts: Vec<ArtifactRecord>,
    pub deliverables: Vec<DeliverableRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskStartParams {
    pub project_id: String,
    pub plan_id: String,
    pub source_asset_id: String,
    pub operation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskStartResult {
    pub task_run: TaskRun,
    pub media_job: MediaJob,
    pub source_asset: SourceAsset,
    pub artifact: Option<ArtifactRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskCancelParams {
    pub project_id: String,
    pub task_run_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskCancelResult {
    pub accepted: bool,
    pub task_run: TaskRun,
    pub media_job: MediaJob,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskRetryParams {
    pub project_id: String,
    pub task_run_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeliverableConfirmParams {
    pub project_id: String,
    pub artifact_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeliverableConfirmResult {
    pub deliverable: DeliverableRecord,
}
