use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{SystemTime, UNIX_EPOCH},
};

use business_protocol::{
    ApprovalDecideParams, ApprovalDecideResult, ArtifactContractListResult, BriefRecord,
    BriefUpdateParams, BriefUpdateResult, BusinessProfile, BusinessProfileListResult,
    BusinessStatusResult, CapabilityListResult, ConversationBindParams, ConversationBindResult,
    ConversationBindingListParams, ConversationBindingListResult, ConversationBindingReadParams,
    ConversationBindingReadResult, ConversationUnbindParams, ConversationUnbindResult,
    DeliverableConfirmParams, DeliverableConfirmResult, ManagedResourceListResult,
    PROTOCOL_VERSION, PlanListParams, PlanListResult, PlanReadParams, PlanReadResult,
    ProfileExecutionState, ProjectArchiveParams, ProjectArchiveResult, ProjectContextReadParams,
    ProjectContextReadResult, ProjectCreateParams, ProjectCreateResult, ProjectExecutionReadParams,
    ProjectExecutionReadResult, ProjectListParams, ProjectListResult, ProjectReadParams,
    ProjectReadResult, ProjectRenameParams, ProjectRenameResult, ServiceListResult,
    SkillListResult, SourceAssetImportParams, SourceAssetImportResult, TaskCancelParams,
    TaskCancelResult, TaskRetryParams, TaskStartParams, TaskStartResult, ToolCallParams,
    ToolCallResult, ToolCatalogListResult,
};
use media::{MediaError, MediaService};
use projects::{PreparedMediaTask, ProjectStore, ProjectStoreError};
use resources::{ResourceManager, ResourceManagerError};
use tools::{ToolHost, ToolHostError};

pub const SERVER_NAME: &str = "limeshot-business";
pub const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug)]
pub struct BusinessCore {
    started_at_epoch_ms: u128,
    projects: Arc<ProjectStore>,
    resources: ResourceManager,
    media: Arc<MediaService>,
    tools: ToolHost,
    active_tasks: Mutex<HashMap<String, ActiveTask>>,
}

#[derive(Debug)]
struct ActiveTask {
    canceled: Arc<AtomicBool>,
    prepared: PreparedMediaTask,
    handle: JoinHandle<()>,
}

impl BusinessCore {
    pub fn open(data_dir: &Path, resources_dir: &Path) -> Result<Self, BusinessError> {
        Self::open_with_media(data_dir, resources_dir, None, None)
    }

    pub fn open_with_media(
        data_dir: &Path,
        resources_dir: &Path,
        ffprobe_override: Option<PathBuf>,
        ffmpeg_override: Option<PathBuf>,
    ) -> Result<Self, BusinessError> {
        let resources = ResourceManager::open(resources_dir)?;
        let ffprobe = match ffprobe_override {
            Some(path) => Some(path),
            None => resources.executable_if_ready("ffmpeg", "ffprobe")?,
        };
        let ffmpeg = match ffmpeg_override {
            Some(path) => Some(path),
            None => resources.executable_if_ready("ffmpeg", "ffmpeg")?,
        };
        Ok(Self {
            started_at_epoch_ms: epoch_ms(),
            projects: Arc::new(ProjectStore::open(data_dir)?),
            resources,
            media: Arc::new(MediaService::with_executables(ffprobe, ffmpeg)?),
            tools: ToolHost,
            active_tasks: Mutex::new(HashMap::new()),
        })
    }

    pub fn in_memory() -> Self {
        Self {
            started_at_epoch_ms: epoch_ms(),
            projects: Arc::new(
                ProjectStore::in_memory().expect("in-memory project store must open"),
            ),
            resources: ResourceManager::open(Path::new("unused"))
                .expect("resource manifest must open"),
            media: Arc::new(MediaService::unavailable()),
            tools: ToolHost,
            active_tasks: Mutex::new(HashMap::new()),
        }
    }

    pub fn status(&self) -> BusinessStatusResult {
        BusinessStatusResult {
            status: "ready".to_owned(),
            server_pid: std::process::id(),
            protocol_version: PROTOCOL_VERSION,
            started_at_epoch_ms: self.started_at_epoch_ms,
        }
    }

    pub fn profiles(&self) -> BusinessProfileListResult {
        BusinessProfileListResult {
            profiles: vec![
                profile(
                    "general",
                    "profile.general.name",
                    "profile.general.description",
                ),
                profile(
                    "short_form",
                    "profile.shortForm.name",
                    "profile.shortForm.description",
                ),
                profile(
                    "visual_transform",
                    "profile.visualTransform.name",
                    "profile.visualTransform.description",
                ),
                profile(
                    "talking_video",
                    "profile.talkingVideo.name",
                    "profile.talkingVideo.description",
                ),
                profile(
                    "commerce_video",
                    "profile.commerceVideo.name",
                    "profile.commerceVideo.description",
                ),
            ],
        }
    }

    pub fn skills(&self) -> SkillListResult {
        skills::list_skills()
    }
    pub fn artifact_contracts(&self) -> ArtifactContractListResult {
        artifacts::list_contracts()
    }
    pub fn capabilities(&self) -> CapabilityListResult {
        providers::list_capabilities()
    }
    pub fn services(&self) -> ServiceListResult {
        self.media.list_services()
    }
    pub fn managed_resources(&self) -> ManagedResourceListResult {
        self.resources.list()
    }
    pub fn tool_catalog(&self) -> ToolCatalogListResult {
        self.tools.catalog()
    }

    pub fn create_project(
        &self,
        params: ProjectCreateParams,
    ) -> Result<ProjectCreateResult, BusinessError> {
        if !self
            .profiles()
            .profiles
            .iter()
            .any(|profile| profile.profile_id == params.profile_id)
        {
            return Err(BusinessError::unknown_profile());
        }
        Ok(self.projects.create_project(params)?)
    }

    pub fn list_projects(
        &self,
        params: ProjectListParams,
    ) -> Result<ProjectListResult, BusinessError> {
        let mut result = self.projects.list_projects()?;
        if let Some(state) = params.state {
            result.projects.retain(|project| project.state == state);
        }
        Ok(result)
    }

    pub fn read_project(
        &self,
        params: ProjectReadParams,
    ) -> Result<ProjectReadResult, BusinessError> {
        Ok(self.projects.read_project(&params.project_id)?)
    }

    pub fn rename_project(
        &self,
        params: ProjectRenameParams,
    ) -> Result<ProjectRenameResult, BusinessError> {
        Ok(self.projects.rename_project(params)?)
    }

    pub fn archive_project(
        &self,
        params: ProjectArchiveParams,
    ) -> Result<ProjectArchiveResult, BusinessError> {
        Ok(self.projects.archive_project(&params.project_id)?)
    }

    pub fn read_project_context(
        &self,
        params: ProjectContextReadParams,
    ) -> Result<ProjectContextReadResult, BusinessError> {
        Ok(self.projects.read_project_context(&params.project_id)?)
    }

    pub fn update_brief(
        &self,
        params: BriefUpdateParams,
    ) -> Result<BriefUpdateResult, BusinessError> {
        let brief: BriefRecord = self.projects.update_brief(params)?;
        Ok(BriefUpdateResult { brief })
    }

    pub fn bind_conversation(
        &self,
        params: ConversationBindParams,
    ) -> Result<ConversationBindResult, BusinessError> {
        Ok(self.projects.bind_conversation(params)?)
    }

    pub fn read_conversation_binding(
        &self,
        params: ConversationBindingReadParams,
    ) -> Result<ConversationBindingReadResult, BusinessError> {
        Ok(self
            .projects
            .read_conversation_binding(&params.project_id, &params.conversation_id)?)
    }

    pub fn list_conversation_bindings(
        &self,
        params: ConversationBindingListParams,
    ) -> Result<ConversationBindingListResult, BusinessError> {
        Ok(self
            .projects
            .list_conversation_bindings(&params.project_id)?)
    }

    pub fn unbind_conversation(
        &self,
        params: ConversationUnbindParams,
    ) -> Result<ConversationUnbindResult, BusinessError> {
        Ok(self.projects.unbind_conversation(params)?)
    }

    pub fn list_plans(&self, params: PlanListParams) -> Result<PlanListResult, BusinessError> {
        Ok(self.projects.list_plans(params)?)
    }

    pub fn read_plan(&self, params: PlanReadParams) -> Result<PlanReadResult, BusinessError> {
        Ok(self.projects.read_plan(params)?)
    }

    pub fn decide_plan(
        &self,
        params: ApprovalDecideParams,
    ) -> Result<ApprovalDecideResult, BusinessError> {
        Ok(self.projects.decide_plan(params)?)
    }

    pub fn import_source_asset(
        &self,
        params: SourceAssetImportParams,
    ) -> Result<SourceAssetImportResult, BusinessError> {
        Ok(self.projects.import_source_asset(params)?)
    }

    pub fn read_execution(
        &self,
        params: ProjectExecutionReadParams,
    ) -> Result<ProjectExecutionReadResult, BusinessError> {
        Ok(self.projects.read_execution(&params.project_id)?)
    }

    pub fn confirm_deliverable(
        &self,
        params: DeliverableConfirmParams,
    ) -> Result<DeliverableConfirmResult, BusinessError> {
        Ok(self.projects.confirm_deliverable(params)?)
    }

    pub fn start_task(&self, params: TaskStartParams) -> Result<TaskStartResult, BusinessError> {
        self.reap_finished_tasks();
        let prepared = self.projects.prepare_media_task(params)?;
        self.run_prepared_task(prepared)
    }

    pub fn retry_task(&self, params: TaskRetryParams) -> Result<TaskStartResult, BusinessError> {
        self.reap_finished_tasks();
        let prepared = self.projects.prepare_media_retry(params)?;
        self.run_prepared_task(prepared)
    }

    fn run_prepared_task(
        &self,
        prepared: PreparedMediaTask,
    ) -> Result<TaskStartResult, BusinessError> {
        self.projects.mark_media_task_running(&prepared)?;
        if prepared.media_job.operation == "media_transcode" {
            if let Err(error) = self.media.ensure_transcode_ready() {
                self.projects.fail_media_task(&prepared, error.code())?;
                return Err(error.into());
            }
            let result = self.projects.task_start_result(&prepared)?;
            if let Err(error) = self.spawn_transcode(prepared.clone()) {
                self.projects
                    .fail_media_task(&prepared, "TASK_RUNTIME_FAILED")?;
                return Err(error);
            }
            return Ok(result);
        }
        let media = match self.media.probe(&prepared.source_path) {
            Ok(media) => media,
            Err(error) => {
                self.projects.fail_media_task(&prepared, error.code())?;
                return Err(error.into());
            }
        };
        let document = match artifacts::media_manifest_document(
            &prepared.task_run.project_id,
            &prepared.task_run.source_asset_id,
            epoch_ms() as i64,
            &media,
        ) {
            Ok(document) => document,
            Err(error) => {
                self.projects
                    .fail_media_task(&prepared, "ARTIFACT_SERIALIZE_FAILED")?;
                return Err(BusinessError::new(
                    "ARTIFACT_SERIALIZE_FAILED",
                    error.to_string(),
                ));
            }
        };
        Ok(self
            .projects
            .complete_media_probe(&prepared, media, &document)?)
    }

    pub fn cancel_task(&self, params: TaskCancelParams) -> Result<TaskCancelResult, BusinessError> {
        self.reap_finished_tasks();
        self.projects
            .task_cancel_result(&params.project_id, &params.task_run_id, false)?;
        let active = self
            .active_tasks
            .lock()
            .map_err(|_| BusinessError::new("TASK_RUNTIME_FAILED", "任务控制器锁已损坏"))?
            .remove(&params.task_run_id);
        let Some(active) = active else {
            return Ok(self.projects.task_cancel_result(
                &params.project_id,
                &params.task_run_id,
                false,
            )?);
        };
        active.canceled.store(true, Ordering::Release);
        if active.handle.join().is_err() {
            self.projects
                .fail_media_task(&active.prepared, "TASK_WORKER_PANICKED")?;
        }
        let result =
            self.projects
                .task_cancel_result(&params.project_id, &params.task_run_id, true)?;
        Ok(TaskCancelResult {
            accepted: result.task_run.state == business_protocol::TaskRunState::Canceled,
            ..result
        })
    }

    pub fn shutdown_tasks(&self) {
        let tasks = match self.active_tasks.lock() {
            Ok(mut tasks) => tasks.drain().map(|(_, task)| task).collect::<Vec<_>>(),
            Err(_) => return,
        };
        for task in &tasks {
            task.canceled.store(true, Ordering::Release);
        }
        for task in tasks {
            if task.handle.join().is_err() {
                let _ = self
                    .projects
                    .fail_media_task(&task.prepared, "TASK_WORKER_PANICKED");
            }
        }
    }

    fn spawn_transcode(&self, prepared: PreparedMediaTask) -> Result<(), BusinessError> {
        let mut active_tasks = self
            .active_tasks
            .lock()
            .map_err(|_| BusinessError::new("TASK_RUNTIME_FAILED", "任务控制器锁已损坏"))?;
        let projects = Arc::clone(&self.projects);
        let media = Arc::clone(&self.media);
        let canceled = Arc::new(AtomicBool::new(false));
        let worker_cancel = Arc::clone(&canceled);
        let worker_prepared = prepared.clone();
        let handle = thread::Builder::new()
            .name(format!("media-{}", prepared.task_run.task_run_id))
            .spawn(move || {
                run_transcode(projects, media, worker_prepared, worker_cancel);
            })
            .map_err(|error| BusinessError::new("TASK_RUNTIME_FAILED", error.to_string()))?;
        active_tasks.insert(
            prepared.task_run.task_run_id.clone(),
            ActiveTask {
                canceled,
                prepared,
                handle,
            },
        );
        Ok(())
    }

    fn reap_finished_tasks(&self) {
        let finished = match self.active_tasks.lock() {
            Ok(mut tasks) => {
                let ids = tasks
                    .iter()
                    .filter(|(_, task)| task.handle.is_finished())
                    .map(|(task_id, _)| task_id.clone())
                    .collect::<Vec<_>>();
                ids.into_iter()
                    .filter_map(|task_id| tasks.remove(&task_id))
                    .collect::<Vec<_>>()
            }
            Err(_) => return,
        };
        for task in finished {
            if task.handle.join().is_err() {
                let _ = self
                    .projects
                    .fail_media_task(&task.prepared, "TASK_WORKER_PANICKED");
            }
        }
    }

    pub fn call_tool(&self, params: ToolCallParams) -> Result<ToolCallResult, BusinessError> {
        Ok(self.tools.call(&self.projects, params)?)
    }
}

impl Drop for BusinessCore {
    fn drop(&mut self) {
        self.shutdown_tasks();
    }
}

fn run_transcode(
    projects: Arc<ProjectStore>,
    media: Arc<MediaService>,
    prepared: PreparedMediaTask,
    canceled: Arc<AtomicBool>,
) {
    let Some(output) = prepared.output.as_ref() else {
        let _ = projects.fail_media_task(&prepared, "MEDIA_OUTPUT_INVALID");
        return;
    };
    let mut progress_failed = false;
    let result = media.transcode(
        &prepared.source_path,
        &output.partial_path,
        &output.path,
        &canceled,
        |progress| {
            if projects.update_media_progress(&prepared, progress).is_err() {
                progress_failed = true;
                canceled.store(true, Ordering::Release);
            }
        },
    );
    if progress_failed {
        let _ = std::fs::remove_file(&output.path);
        let _ = projects.fail_media_task(&prepared, "TASK_PROGRESS_PERSIST_FAILED");
        return;
    }
    match result {
        Ok(_) if canceled.load(Ordering::Acquire) => {
            let _ = std::fs::remove_file(&output.path);
            let _ = projects.cancel_media_task(&prepared);
        }
        Ok(media) => {
            let qa = artifacts::evaluate_media_output(&media);
            if !qa.passed {
                let _ = std::fs::remove_file(&output.path);
                let _ = projects.fail_media_task(&prepared, "MEDIA_QA_FAILED");
                return;
            }
            let qa_document = match artifacts::qa_report_document(
                &prepared.task_run.project_id,
                &prepared.task_run.task_run_id,
                epoch_ms() as i64,
                &qa,
            ) {
                Ok(document) => document,
                Err(_) => {
                    let _ = std::fs::remove_file(&output.path);
                    let _ = projects.fail_media_task(&prepared, "ARTIFACT_SERIALIZE_FAILED");
                    return;
                }
            };
            if let Err(error) = projects.complete_media_output(&prepared, media, qa, &qa_document) {
                let _ = projects.fail_media_task(&prepared, error.code());
            }
        }
        Err(error) if error.code() == "MEDIA_TASK_CANCELED" => {
            let _ = projects.cancel_media_task(&prepared);
        }
        Err(error) => {
            let _ = projects.fail_media_task(&prepared, error.code());
        }
    }
}

#[derive(Debug)]
pub struct BusinessError {
    code: &'static str,
    message: String,
}

impl BusinessError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    fn unknown_profile() -> Self {
        Self {
            code: "BUSINESS_PROFILE_NOT_FOUND",
            message: "未知的业务类型".to_owned(),
        }
    }
    pub fn code(&self) -> &'static str {
        self.code
    }
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl From<ProjectStoreError> for BusinessError {
    fn from(value: ProjectStoreError) -> Self {
        Self {
            code: value.code(),
            message: value.message().to_owned(),
        }
    }
}

impl From<ResourceManagerError> for BusinessError {
    fn from(value: ResourceManagerError) -> Self {
        Self {
            code: value.code(),
            message: value.message().to_owned(),
        }
    }
}

impl From<ToolHostError> for BusinessError {
    fn from(value: ToolHostError) -> Self {
        Self {
            code: value.code(),
            message: value.message().to_owned(),
        }
    }
}

impl From<MediaError> for BusinessError {
    fn from(value: MediaError) -> Self {
        Self {
            code: value.code(),
            message: value.message().to_owned(),
        }
    }
}

impl std::fmt::Display for BusinessError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for BusinessError {}

fn profile(profile_id: &str, name_key: &str, description_key: &str) -> BusinessProfile {
    BusinessProfile {
        profile_id: profile_id.to_owned(),
        name_key: name_key.to_owned(),
        description_key: description_key.to_owned(),
        execution_state: ProfileExecutionState::Preparing,
    }
}

fn epoch_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_business_catalogs_without_agent_state() {
        let core = BusinessCore::in_memory();
        assert_eq!(core.profiles().profiles.len(), 5);
        assert_eq!(core.skills().skills.len(), 6);
        assert_eq!(core.tool_catalog().tools[0].name, "project_read");
        assert_eq!(core.managed_resources().resources.len(), 2);
    }
}
