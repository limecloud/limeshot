use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use business_protocol::{
    ApprovalDecideParams, ApprovalDecideResult, ArtifactContractListResult, BriefRecord,
    BriefUpdateParams, BriefUpdateResult, BusinessProfile, BusinessProfileListResult,
    BusinessStatusResult, CapabilityListResult, ConversationBindParams, ConversationBindResult,
    ConversationBindingReadParams, ConversationBindingReadResult, ManagedResourceListResult,
    PROTOCOL_VERSION, PlanListParams, PlanListResult, PlanReadParams, PlanReadResult,
    ProfileExecutionState, ProjectContextReadParams, ProjectContextReadResult, ProjectCreateParams,
    ProjectCreateResult, ProjectListParams, ProjectListResult, ProjectReadParams,
    ProjectReadResult, ServiceListResult, SkillListResult, ToolCallParams, ToolCallResult,
    ToolCatalogListResult,
};
use projects::{ProjectStore, ProjectStoreError};
use resources::{ResourceManager, ResourceManagerError};
use tools::{ToolHost, ToolHostError};

pub const SERVER_NAME: &str = "limeshot-business";
pub const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug)]
pub struct BusinessCore {
    started_at_epoch_ms: u128,
    projects: ProjectStore,
    resources: ResourceManager,
    tools: ToolHost,
}

impl BusinessCore {
    pub fn open(data_dir: &Path, resources_dir: &Path) -> Result<Self, BusinessError> {
        Ok(Self {
            started_at_epoch_ms: epoch_ms(),
            projects: ProjectStore::open(data_dir)?,
            resources: ResourceManager::open(resources_dir)?,
            tools: ToolHost,
        })
    }

    pub fn in_memory() -> Self {
        Self {
            started_at_epoch_ms: epoch_ms(),
            projects: ProjectStore::in_memory().expect("in-memory project store must open"),
            resources: ResourceManager::open(Path::new("unused"))
                .expect("resource manifest must open"),
            tools: ToolHost,
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
        media::list_services()
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

    pub fn call_tool(&self, params: ToolCallParams) -> Result<ToolCallResult, BusinessError> {
        Ok(self.tools.call(&self.projects, params)?)
    }
}

#[derive(Debug)]
pub struct BusinessError {
    code: &'static str,
    message: String,
}

impl BusinessError {
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
