use business_protocol::{
    PlanCreateParams, PlanInput, ToolCallParams, ToolCallResult, ToolCatalogListResult,
    ToolDescriptor, tool_text,
};
use projects::{ProjectStore, ProjectStoreError};
use serde_json::json;

#[derive(Debug, Default)]
pub struct ToolHost;

impl ToolHost {
    pub fn catalog(&self) -> ToolCatalogListResult {
        ToolCatalogListResult {
            tools: vec![
                ToolDescriptor {
                    name: "project_read".to_owned(),
                    description: "Read the current project and latest brief.".to_owned(),
                    input_schema: json!({
                        "type": "object",
                        "properties": {},
                        "additionalProperties": false
                    }),
                },
                ToolDescriptor {
                    name: "plan_create".to_owned(),
                    description: "Create a versioned production plan from a workable brief."
                        .to_owned(),
                    input_schema: json!({
                        "type": "object",
                        "properties": {
                            "title": { "type": "string", "minLength": 1 },
                            "summary": { "type": "string", "minLength": 1 },
                            "deliverables": { "type": "array", "items": { "type": "string", "minLength": 1 }, "minItems": 1 },
                            "operations": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "operationId": { "type": "string", "minLength": 1 },
                                        "kind": { "type": "string", "minLength": 1 },
                                        "title": { "type": "string", "minLength": 1 },
                                        "capabilityId": { "type": ["string", "null"] },
                                        "dependsOn": { "type": "array", "items": { "type": "string" } }
                                    },
                                    "required": ["operationId", "kind", "title", "dependsOn"],
                                    "additionalProperties": false
                                }
                            },
                            "gaps": { "type": "array", "items": { "type": "string", "minLength": 1 } },
                            "risks": { "type": "array", "items": { "type": "string", "minLength": 1 } }
                        },
                        "required": ["title", "summary", "deliverables", "operations", "gaps", "risks"],
                        "additionalProperties": false
                    }),
                },
            ],
        }
    }

    pub fn call(
        &self,
        projects: &ProjectStore,
        params: ToolCallParams,
    ) -> Result<ToolCallResult, ToolHostError> {
        let binding = projects.read_conversation_binding(
            &params.context.project_id,
            &params.context.conversation_id,
        )?;
        if binding.binding.codex_thread_id != params.context.thread_id {
            return Err(ToolHostError::denied(
                "Codex Thread 与 Project 会话绑定不一致",
            ));
        }
        match params.tool.as_str() {
            "project_read" => {
                let project = projects.read_project(&params.context.project_id)?;
                let text = serde_json::to_string(&project)
                    .map_err(|error| ToolHostError::internal(error.to_string()))?;
                Ok(tool_text(true, text))
            }
            "plan_create" => {
                let plan: PlanInput = serde_json::from_value(params.arguments)
                    .map_err(|_| ToolHostError::input("计划参数不符合 schema"))?;
                let result = projects.create_plan(
                    PlanCreateParams {
                        project_id: params.context.project_id,
                        plan,
                    },
                    "agent",
                )?;
                let text = serde_json::to_string(&result)
                    .map_err(|error| ToolHostError::internal(error.to_string()))?;
                Ok(tool_text(true, text))
            }
            _ => Ok(tool_text(
                false,
                format!("未注册的业务工具: {}", params.tool),
            )),
        }
    }
}

#[derive(Debug)]
pub struct ToolHostError {
    code: &'static str,
    message: String,
}

impl ToolHostError {
    fn denied(message: impl Into<String>) -> Self {
        Self {
            code: "TOOL_CALL_DENIED",
            message: message.into(),
        }
    }
    fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "TOOL_CALL_FAILED",
            message: message.into(),
        }
    }
    fn input(message: impl Into<String>) -> Self {
        Self {
            code: "TOOL_INPUT_INVALID",
            message: message.into(),
        }
    }
    pub fn code(&self) -> &'static str {
        self.code
    }
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl From<ProjectStoreError> for ToolHostError {
    fn from(value: ProjectStoreError) -> Self {
        Self {
            code: value.code(),
            message: value.message().to_owned(),
        }
    }
}

impl std::fmt::Display for ToolHostError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ToolHostError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_exposes_only_registered_semantic_tools() {
        let tools = ToolHost.catalog().tools;
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].name, "project_read");
        assert!(
            tools[0]
                .name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        );
    }
}
