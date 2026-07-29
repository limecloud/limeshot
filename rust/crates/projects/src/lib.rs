use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use business_protocol::{
    BriefCompleteness, BriefInput, BriefRecord, BriefUpdateParams, ConversationBindParams,
    ConversationBindResult, ConversationBinding, ConversationBindingListResult,
    ConversationBindingReadResult, ConversationUnbindParams, ConversationUnbindResult,
    ProjectArchiveResult, ProjectContextReadResult, ProjectCreateParams, ProjectCreateResult,
    ProjectListResult, ProjectReadResult, ProjectRenameParams, ProjectRenameResult, ProjectState,
    ProjectSummary,
};
use rusqlite::{Connection, OptionalExtension, params};

mod deliverables;
mod execution;
mod execution_support;
mod plans;
mod transcode;

#[cfg(test)]
mod execution_tests;

pub use execution::{PreparedMediaOutput, PreparedMediaTask};

static ID_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug)]
pub struct ProjectStore {
    connection: Mutex<Connection>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectStoreError {
    code: &'static str,
    message: String,
}

impl ProjectStoreError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
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

impl std::fmt::Display for ProjectStoreError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for ProjectStoreError {}

impl ProjectStore {
    pub fn open(data_dir: &Path) -> Result<Self, ProjectStoreError> {
        fs::create_dir_all(data_dir).map_err(internal)?;
        let connection = Connection::open(data_dir.join("projects.db")).map_err(internal)?;
        Self::from_connection(connection)
    }

    pub fn in_memory() -> Result<Self, ProjectStoreError> {
        Self::from_connection(Connection::open_in_memory().map_err(internal)?)
    }

    fn from_connection(mut connection: Connection) -> Result<Self, ProjectStoreError> {
        connection
            .execute_batch(
                "
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS projects (
                project_id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                profile_id TEXT NOT NULL,
                state TEXT NOT NULL,
                workspace_path TEXT NOT NULL,
                workspace_name TEXT NOT NULL,
                created_at_epoch_ms INTEGER NOT NULL,
                updated_at_epoch_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS projects_by_workspace_state
                ON projects(workspace_path, state);
            CREATE TABLE IF NOT EXISTS brief_versions (
                brief_id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                version INTEGER NOT NULL,
                completeness TEXT NOT NULL,
                missing_fields_json TEXT NOT NULL,
                conflicts_json TEXT NOT NULL,
                content_json TEXT NOT NULL,
                created_at_epoch_ms INTEGER NOT NULL,
                UNIQUE(project_id, version)
            );
            CREATE INDEX IF NOT EXISTS brief_versions_by_project
                ON brief_versions(project_id, version DESC);
            CREATE TABLE IF NOT EXISTS conversation_bindings (
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                conversation_id TEXT NOT NULL,
                codex_thread_id TEXT NOT NULL UNIQUE,
                updated_at_epoch_ms INTEGER NOT NULL,
                PRIMARY KEY(project_id, conversation_id)
            );
            CREATE INDEX IF NOT EXISTS conversation_bindings_by_project
                ON conversation_bindings(project_id, updated_at_epoch_ms DESC);
            CREATE TABLE IF NOT EXISTS production_plans (
                plan_id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                version INTEGER NOT NULL,
                state TEXT NOT NULL,
                brief_id TEXT NOT NULL REFERENCES brief_versions(brief_id),
                brief_version INTEGER NOT NULL,
                content_json TEXT NOT NULL,
                created_by TEXT NOT NULL,
                approved_by TEXT,
                created_at_epoch_ms INTEGER NOT NULL,
                approved_at_epoch_ms INTEGER,
                UNIQUE(project_id, version)
            );
            CREATE INDEX IF NOT EXISTS production_plans_by_project
                ON production_plans(project_id, version DESC);
            CREATE TABLE IF NOT EXISTS approval_receipts (
                approval_id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                plan_id TEXT NOT NULL REFERENCES production_plans(plan_id),
                plan_version INTEGER NOT NULL,
                decision TEXT NOT NULL,
                actor TEXT NOT NULL,
                note TEXT NOT NULL,
                decided_at_epoch_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS approval_receipts_by_plan
                ON approval_receipts(plan_id, decided_at_epoch_ms DESC);
            ",
            )
            .map_err(internal)?;
        migrate_conversation_bindings(&mut connection)?;
        execution::migrate(&mut connection)?;
        deliverables::migrate(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn create_project(
        &self,
        params: ProjectCreateParams,
    ) -> Result<ProjectCreateResult, ProjectStoreError> {
        validate_project_name(&params.name)?;
        validate_workspace(&params.workspace_path)?;
        let workspace_path = normalize_workspace_path(&params.workspace_path)?;
        let workspace_name = workspace_display_name(&workspace_path);
        let (completeness, missing_fields, conflicts) = assess_brief(&params.brief);
        let now = epoch_ms();
        let project_id = new_id("project", now);
        let brief_id = new_id("brief", now);
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(internal)?;
        let existing: Option<String> = transaction.query_row(
            "SELECT project_id FROM projects WHERE workspace_path = ?1 AND state != 'archived' LIMIT 1",
            params![&workspace_path], |row| row.get(0),
        ).optional().map_err(internal)?;
        if existing.is_some() {
            return Err(ProjectStoreError::new(
                "PROJECT_CONFLICT",
                "该工作目录已绑定一个未归档项目",
            ));
        }
        transaction.execute(
            "INSERT INTO projects (project_id, name, profile_id, state, workspace_path, workspace_name, created_at_epoch_ms, updated_at_epoch_ms)
             VALUES (?1, ?2, ?3, 'draft', ?4, ?5, ?6, ?6)",
            params![&project_id, params.name.trim(), &params.profile_id, &workspace_path, &workspace_name, now],
        ).map_err(internal)?;
        transaction.execute(
            "INSERT INTO brief_versions (brief_id, project_id, version, completeness, missing_fields_json, conflicts_json, content_json, created_at_epoch_ms)
             VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7)",
            params![
                &brief_id,
                &project_id,
                completeness_to_db(&completeness),
                to_json(&missing_fields)?,
                to_json(&conflicts)?,
                to_json(&params.brief)?,
                now,
            ],
        ).map_err(internal)?;
        transaction.commit().map_err(internal)?;
        Ok(ProjectCreateResult {
            project: ProjectSummary {
                project_id: project_id.clone(),
                name: params.name.trim().to_owned(),
                profile_id: params.profile_id,
                state: ProjectState::Draft,
                workspace_name,
                created_at_epoch_ms: now,
                updated_at_epoch_ms: now,
            },
            brief: BriefRecord {
                brief_id,
                project_id,
                version: 1,
                completeness,
                missing_fields,
                conflicts,
                content: params.brief,
                created_at_epoch_ms: now,
            },
        })
    }

    pub fn list_projects(&self) -> Result<ProjectListResult, ProjectStoreError> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT project_id, name, profile_id, state, workspace_name, created_at_epoch_ms, updated_at_epoch_ms
             FROM projects ORDER BY updated_at_epoch_ms DESC, project_id DESC",
        ).map_err(internal)?;
        let rows = statement
            .query_map([], project_summary_from_row)
            .map_err(internal)?;
        let projects = rows.collect::<Result<Vec<_>, _>>().map_err(internal)?;
        Ok(ProjectListResult { projects })
    }

    pub fn read_project(&self, project_id: &str) -> Result<ProjectReadResult, ProjectStoreError> {
        let connection = self.connection()?;
        let project = connection.query_row(
            "SELECT project_id, name, profile_id, state, workspace_name, created_at_epoch_ms, updated_at_epoch_ms
             FROM projects WHERE project_id = ?1",
            params![project_id], project_summary_from_row,
        ).optional().map_err(internal)?.ok_or_else(|| ProjectStoreError::new("PROJECT_NOT_FOUND", "项目不存在"))?;
        let brief = read_latest_brief(&connection, project_id)?;
        Ok(ProjectReadResult { project, brief })
    }

    pub fn rename_project(
        &self,
        params: ProjectRenameParams,
    ) -> Result<ProjectRenameResult, ProjectStoreError> {
        validate_project_name(&params.name)?;
        let now = epoch_ms();
        let connection = self.connection()?;
        let updated = connection
            .execute(
                "UPDATE projects SET name = ?1, updated_at_epoch_ms = ?2 WHERE project_id = ?3 AND state != 'archived'",
                params![params.name.trim(), now, &params.project_id],
            )
            .map_err(internal)?;
        if updated != 1 {
            return Err(ProjectStoreError::new(
                "PROJECT_NOT_FOUND",
                "项目不存在或已归档",
            ));
        }
        drop(connection);
        Ok(ProjectRenameResult {
            project: self.read_project(&params.project_id)?.project,
        })
    }

    pub fn archive_project(
        &self,
        project_id: &str,
    ) -> Result<ProjectArchiveResult, ProjectStoreError> {
        let now = epoch_ms();
        let connection = self.connection()?;
        let updated = connection
            .execute(
                "UPDATE projects SET state = 'archived', updated_at_epoch_ms = ?1 WHERE project_id = ?2",
                params![now, project_id],
            )
            .map_err(internal)?;
        if updated != 1 {
            return Err(ProjectStoreError::new("PROJECT_NOT_FOUND", "项目不存在"));
        }
        drop(connection);
        Ok(ProjectArchiveResult {
            project: self.read_project(project_id)?.project,
        })
    }

    pub fn read_project_context(
        &self,
        project_id: &str,
    ) -> Result<ProjectContextReadResult, ProjectStoreError> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT project_id, workspace_path FROM projects WHERE project_id = ?1",
                params![project_id],
                |row| {
                    Ok(ProjectContextReadResult {
                        project_id: row.get(0)?,
                        workspace_path: row.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(internal)?
            .ok_or_else(|| ProjectStoreError::new("PROJECT_NOT_FOUND", "项目不存在"))
    }

    pub fn update_brief(
        &self,
        params: BriefUpdateParams,
    ) -> Result<BriefRecord, ProjectStoreError> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(internal)?;
        let current_version: Option<u32> = transaction.query_row(
            "SELECT version FROM brief_versions WHERE project_id = ?1 ORDER BY version DESC LIMIT 1",
            params![&params.project_id], |row| row.get(0),
        ).optional().map_err(internal)?;
        let current_version = current_version
            .ok_or_else(|| ProjectStoreError::new("PROJECT_NOT_FOUND", "项目不存在"))?;
        if current_version != params.expected_version {
            return Err(ProjectStoreError::new(
                "PROJECT_CONFLICT",
                "Brief 已被更新，请重新读取后再提交",
            ));
        }
        let version = current_version + 1;
        let now = epoch_ms();
        let brief_id = new_id("brief", now);
        let (completeness, missing_fields, conflicts) = assess_brief(&params.brief);
        transaction.execute(
            "INSERT INTO brief_versions (brief_id, project_id, version, completeness, missing_fields_json, conflicts_json, content_json, created_at_epoch_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &brief_id, &params.project_id, version, completeness_to_db(&completeness),
                to_json(&missing_fields)?, to_json(&conflicts)?, to_json(&params.brief)?, now,
            ],
        ).map_err(internal)?;
        transaction
            .execute(
                "UPDATE projects SET updated_at_epoch_ms = ?1 WHERE project_id = ?2",
                params![now, &params.project_id],
            )
            .map_err(internal)?;
        transaction.commit().map_err(internal)?;
        Ok(BriefRecord {
            brief_id,
            project_id: params.project_id,
            version,
            completeness,
            missing_fields,
            conflicts,
            content: params.brief,
            created_at_epoch_ms: now,
        })
    }

    pub fn bind_conversation(
        &self,
        params: ConversationBindParams,
    ) -> Result<ConversationBindResult, ProjectStoreError> {
        validate_identifier("conversationId", &params.conversation_id)?;
        validate_identifier("codexThreadId", &params.codex_thread_id)?;
        self.read_project(&params.project_id)?;
        let connection = self.connection()?;
        let existing =
            read_binding_optional(&connection, &params.project_id, &params.conversation_id)?;
        if let Some(binding) = existing {
            if binding.codex_thread_id == params.codex_thread_id {
                return Ok(ConversationBindResult { binding });
            }
            if params.expected_codex_thread_id.as_deref() != Some(&binding.codex_thread_id) {
                return Err(ProjectStoreError::new(
                    "CONVERSATION_BINDING_CONFLICT",
                    "会话已绑定其他 Codex Thread",
                ));
            }
            let now = epoch_ms();
            let updated = connection
                .execute(
                    "UPDATE conversation_bindings
                 SET codex_thread_id = ?1, updated_at_epoch_ms = ?2
                 WHERE project_id = ?3 AND conversation_id = ?4 AND codex_thread_id = ?5",
                    params![
                        &params.codex_thread_id,
                        now,
                        &params.project_id,
                        &params.conversation_id,
                        &binding.codex_thread_id
                    ],
                )
                .map_err(binding_write_error)?;
            if updated != 1 {
                return Err(ProjectStoreError::new(
                    "CONVERSATION_BINDING_CONFLICT",
                    "会话绑定已被其他请求更新",
                ));
            }
            return Ok(ConversationBindResult {
                binding: ConversationBinding {
                    project_id: params.project_id,
                    conversation_id: params.conversation_id,
                    codex_thread_id: params.codex_thread_id,
                    updated_at_epoch_ms: now,
                },
            });
        }
        if params.expected_codex_thread_id.is_some() {
            return Err(ProjectStoreError::new(
                "CONVERSATION_BINDING_CONFLICT",
                "待替换的会话绑定不存在",
            ));
        }
        let now = epoch_ms();
        connection.execute(
            "INSERT INTO conversation_bindings (conversation_id, project_id, codex_thread_id, updated_at_epoch_ms)
             VALUES (?1, ?2, ?3, ?4)",
            params![&params.conversation_id, &params.project_id, &params.codex_thread_id, now],
        ).map_err(binding_write_error)?;
        Ok(ConversationBindResult {
            binding: ConversationBinding {
                project_id: params.project_id,
                conversation_id: params.conversation_id,
                codex_thread_id: params.codex_thread_id,
                updated_at_epoch_ms: now,
            },
        })
    }

    pub fn read_conversation_binding(
        &self,
        project_id: &str,
        conversation_id: &str,
    ) -> Result<ConversationBindingReadResult, ProjectStoreError> {
        let connection = self.connection()?;
        let binding =
            read_binding_optional(&connection, project_id, conversation_id)?.ok_or_else(|| {
                ProjectStoreError::new(
                    "CONVERSATION_BINDING_NOT_FOUND",
                    "会话尚未绑定 Codex Thread",
                )
            })?;
        Ok(ConversationBindingReadResult { binding })
    }

    pub fn list_conversation_bindings(
        &self,
        project_id: &str,
    ) -> Result<ConversationBindingListResult, ProjectStoreError> {
        self.read_project(project_id)?;
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT project_id, conversation_id, codex_thread_id, updated_at_epoch_ms
                 FROM conversation_bindings WHERE project_id = ?1
                 ORDER BY updated_at_epoch_ms DESC, conversation_id ASC",
            )
            .map_err(internal)?;
        let rows = statement
            .query_map(params![project_id], |row| {
                Ok(ConversationBinding {
                    project_id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    codex_thread_id: row.get(2)?,
                    updated_at_epoch_ms: row.get(3)?,
                })
            })
            .map_err(internal)?;
        let bindings = rows.collect::<Result<Vec<_>, _>>().map_err(internal)?;
        Ok(ConversationBindingListResult { bindings })
    }

    pub fn unbind_conversation(
        &self,
        params: ConversationUnbindParams,
    ) -> Result<ConversationUnbindResult, ProjectStoreError> {
        let connection = self.connection()?;
        let binding =
            read_binding_optional(&connection, &params.project_id, &params.conversation_id)?
                .ok_or_else(|| {
                    ProjectStoreError::new(
                        "CONVERSATION_BINDING_NOT_FOUND",
                        "会话尚未绑定 Codex Thread",
                    )
                })?;
        if binding.codex_thread_id != params.expected_codex_thread_id {
            return Err(ProjectStoreError::new(
                "CONVERSATION_BINDING_CONFLICT",
                "会话绑定已被其他请求更新",
            ));
        }
        let removed = connection
            .execute(
                "DELETE FROM conversation_bindings WHERE project_id = ?1 AND conversation_id = ?2 AND codex_thread_id = ?3",
                params![
                    &params.project_id,
                    &params.conversation_id,
                    &params.expected_codex_thread_id
                ],
            )
            .map_err(binding_write_error)?;
        if removed != 1 {
            return Err(ProjectStoreError::new(
                "CONVERSATION_BINDING_CONFLICT",
                "会话绑定已被其他请求更新",
            ));
        }
        Ok(ConversationUnbindResult { binding })
    }

    pub fn create_plan(
        &self,
        params: business_protocol::PlanCreateParams,
        created_by: &str,
    ) -> Result<business_protocol::PlanCreateResult, ProjectStoreError> {
        let mut connection = self.connection()?;
        plans::create(&mut connection, params, created_by)
    }

    pub fn list_plans(
        &self,
        params: business_protocol::PlanListParams,
    ) -> Result<business_protocol::PlanListResult, ProjectStoreError> {
        let connection = self.connection()?;
        plans::list(&connection, &params.project_id)
    }

    pub fn read_plan(
        &self,
        params: business_protocol::PlanReadParams,
    ) -> Result<business_protocol::PlanReadResult, ProjectStoreError> {
        let connection = self.connection()?;
        plans::read(&connection, &params.project_id, &params.plan_id)
    }

    pub fn decide_plan(
        &self,
        params: business_protocol::ApprovalDecideParams,
    ) -> Result<business_protocol::ApprovalDecideResult, ProjectStoreError> {
        let mut connection = self.connection()?;
        plans::decide(&mut connection, params)
    }

    fn connection(&self) -> Result<MutexGuard<'_, Connection>, ProjectStoreError> {
        self.connection
            .lock()
            .map_err(|_| ProjectStoreError::new("PROJECT_STORE_FAILED", "项目数据库锁已损坏"))
    }
}

fn binding_write_error(error: rusqlite::Error) -> ProjectStoreError {
    if matches!(error, rusqlite::Error::SqliteFailure(ref detail, _) if matches!(
        detail.extended_code,
        rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE | rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY
    )) {
        ProjectStoreError::new(
            "CONVERSATION_BINDING_CONFLICT",
            "Codex Thread 已绑定其他会话",
        )
    } else {
        internal(error)
    }
}

fn migrate_conversation_bindings(connection: &mut Connection) -> Result<(), ProjectStoreError> {
    let primary_key = {
        let mut statement = connection
            .prepare("PRAGMA table_info(conversation_bindings)")
            .map_err(internal)?;
        let columns = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, i64>(5)?))
            })
            .map_err(internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(internal)?;
        columns
            .into_iter()
            .filter(|(_, position)| *position > 0)
            .collect::<Vec<_>>()
    };
    if primary_key
        == [
            ("project_id".to_owned(), 1),
            ("conversation_id".to_owned(), 2),
        ]
    {
        return Ok(());
    }

    connection
        .execute_batch(
            "
            BEGIN IMMEDIATE;
            ALTER TABLE conversation_bindings RENAME TO conversation_bindings_legacy;
            CREATE TABLE conversation_bindings (
                project_id TEXT NOT NULL REFERENCES projects(project_id),
                conversation_id TEXT NOT NULL,
                codex_thread_id TEXT NOT NULL UNIQUE,
                updated_at_epoch_ms INTEGER NOT NULL,
                PRIMARY KEY(project_id, conversation_id)
            );
            INSERT INTO conversation_bindings (project_id, conversation_id, codex_thread_id, updated_at_epoch_ms)
                SELECT project_id, conversation_id, codex_thread_id, updated_at_epoch_ms
                FROM conversation_bindings_legacy;
            DROP TABLE conversation_bindings_legacy;
            CREATE INDEX conversation_bindings_by_project
                ON conversation_bindings(project_id, updated_at_epoch_ms DESC);
            COMMIT;
            ",
        )
        .map_err(internal)
}

fn read_binding_optional(
    connection: &Connection,
    project_id: &str,
    conversation_id: &str,
) -> Result<Option<ConversationBinding>, ProjectStoreError> {
    connection
        .query_row(
            "SELECT project_id, conversation_id, codex_thread_id, updated_at_epoch_ms
         FROM conversation_bindings WHERE project_id = ?1 AND conversation_id = ?2",
            params![project_id, conversation_id],
            |row| {
                Ok(ConversationBinding {
                    project_id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    codex_thread_id: row.get(2)?,
                    updated_at_epoch_ms: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(internal)
}

fn read_latest_brief(
    connection: &Connection,
    project_id: &str,
) -> Result<BriefRecord, ProjectStoreError> {
    connection.query_row(
        "SELECT brief_id, project_id, version, completeness, missing_fields_json, conflicts_json, content_json, created_at_epoch_ms
         FROM brief_versions WHERE project_id = ?1 ORDER BY version DESC LIMIT 1",
        params![project_id], brief_from_row,
    ).optional().map_err(internal)?.ok_or_else(|| ProjectStoreError::new("PROJECT_NOT_FOUND", "项目 Brief 不存在"))
}

fn project_summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectSummary> {
    Ok(ProjectSummary {
        project_id: row.get(0)?,
        name: row.get(1)?,
        profile_id: row.get(2)?,
        state: project_state_from_db(&row.get::<_, String>(3)?).map_err(to_sql_error)?,
        workspace_name: row.get(4)?,
        created_at_epoch_ms: row.get(5)?,
        updated_at_epoch_ms: row.get(6)?,
    })
}

fn brief_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BriefRecord> {
    Ok(BriefRecord {
        brief_id: row.get(0)?,
        project_id: row.get(1)?,
        version: row.get(2)?,
        completeness: brief_completeness_from_db(&row.get::<_, String>(3)?)
            .map_err(to_sql_error)?,
        missing_fields: serde_json::from_str(&row.get::<_, String>(4)?).map_err(to_sql_error)?,
        conflicts: serde_json::from_str(&row.get::<_, String>(5)?).map_err(to_sql_error)?,
        content: serde_json::from_str(&row.get::<_, String>(6)?).map_err(to_sql_error)?,
        created_at_epoch_ms: row.get(7)?,
    })
}

fn internal(error: impl std::fmt::Display) -> ProjectStoreError {
    ProjectStoreError::new("PROJECT_STORE_FAILED", error.to_string())
}

fn to_json(value: &impl serde::Serialize) -> Result<String, ProjectStoreError> {
    serde_json::to_string(value).map_err(internal)
}

fn to_sql_error(error: impl std::error::Error + Send + Sync + 'static) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

fn validate_project_name(name: &str) -> Result<(), ProjectStoreError> {
    let length = name.trim().chars().count();
    if length == 0 || length > 120 {
        return Err(ProjectStoreError::new(
            "PROJECT_INPUT_INVALID",
            "项目名称不能为空且不能超过 120 个字符",
        ));
    }
    Ok(())
}

fn validate_identifier(field: &str, value: &str) -> Result<(), ProjectStoreError> {
    if value.trim().is_empty() || value.len() > 256 {
        return Err(ProjectStoreError::new(
            "PROJECT_INPUT_INVALID",
            format!("{field} 无效"),
        ));
    }
    Ok(())
}

fn validate_workspace(path: &str) -> Result<(), ProjectStoreError> {
    let workspace = Path::new(path);
    if !workspace.is_absolute() || !workspace.is_dir() {
        return Err(ProjectStoreError::new(
            "PROJECT_INPUT_INVALID",
            "工作目录必须是可用的绝对路径",
        ));
    }
    Ok(())
}

fn normalize_workspace_path(path: &str) -> Result<String, ProjectStoreError> {
    PathBuf::from(path)
        .canonicalize()
        .map(|path| path.display().to_string())
        .map_err(internal)
}

fn workspace_display_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("工作目录")
        .to_owned()
}

fn assess_brief(brief: &BriefInput) -> (BriefCompleteness, Vec<String>, Vec<String>) {
    let mut missing = Vec::new();
    for (field, empty) in [
        ("subject", brief.subject.trim().is_empty()),
        ("audience", brief.audience.trim().is_empty()),
        ("platform", brief.platform.trim().is_empty()),
        (
            "target_duration_seconds",
            brief.target_duration_seconds.is_none(),
        ),
        ("aspect_ratio", brief.aspect_ratio.trim().is_empty()),
        ("language", brief.language.trim().is_empty()),
    ] {
        if empty {
            missing.push(field.to_owned());
        }
    }
    let mut conflicts = Vec::new();
    if brief.target_duration_seconds == Some(0) {
        conflicts.push("target_duration_seconds".to_owned());
    }
    if !matches!(
        brief.aspect_ratio.as_str(),
        "" | "1:1" | "9:16" | "16:9" | "4:3"
    ) {
        conflicts.push("aspect_ratio".to_owned());
    }
    let completeness = if !conflicts.is_empty() {
        BriefCompleteness::Conflicting
    } else if missing.is_empty() {
        BriefCompleteness::Workable
    } else {
        BriefCompleteness::Incomplete
    };
    (completeness, missing, conflicts)
}

fn project_state_from_db(value: &str) -> Result<ProjectState, ProjectStoreError> {
    match value {
        "draft" => Ok(ProjectState::Draft),
        "active" => Ok(ProjectState::Active),
        "archived" => Ok(ProjectState::Archived),
        _ => Err(internal("项目状态损坏")),
    }
}

fn brief_completeness_from_db(value: &str) -> Result<BriefCompleteness, ProjectStoreError> {
    match value {
        "incomplete" => Ok(BriefCompleteness::Incomplete),
        "workable" => Ok(BriefCompleteness::Workable),
        "conflicting" => Ok(BriefCompleteness::Conflicting),
        _ => Err(internal("Brief 完整性状态损坏")),
    }
}

fn completeness_to_db(value: &BriefCompleteness) -> &'static str {
    match value {
        BriefCompleteness::Incomplete => "incomplete",
        BriefCompleteness::Workable => "workable",
        BriefCompleteness::Conflicting => "conflicting",
    }
}

pub(crate) fn epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

pub(crate) fn new_id(kind: &str, now: i64) -> String {
    format!(
        "{kind}-{now}-{}-{}",
        std::process::id(),
        ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(workspace_path: String) -> ProjectCreateParams {
        ProjectCreateParams {
            name: "口播项目".to_owned(),
            profile_id: "talking_video".to_owned(),
            workspace_path,
            brief: BriefInput {
                subject: "产品介绍".to_owned(),
                audience: "创作者".to_owned(),
                platform: "短视频".to_owned(),
                target_duration_seconds: Some(30),
                aspect_ratio: "9:16".to_owned(),
                language: "zh-CN".to_owned(),
                style: "清晰".to_owned(),
                must_include: vec![],
                prohibited: vec![],
                delivery_format: "mp4".to_owned(),
            },
        }
    }

    fn plan_input(title: &str) -> business_protocol::PlanInput {
        business_protocol::PlanInput {
            title: title.to_owned(),
            summary: "制作一条 30 秒产品介绍视频".to_owned(),
            deliverables: vec!["16:9 MP4".to_owned()],
            operations: vec![business_protocol::PlanOperationInput {
                operation_id: "script".to_owned(),
                kind: "content".to_owned(),
                title: "生成脚本".to_owned(),
                capability_id: None,
                depends_on: vec![],
            }],
            gaps: vec![],
            risks: vec!["商品事实需要复核".to_owned()],
        }
    }

    #[test]
    fn stores_business_objects_without_agent_history() {
        let store = ProjectStore::in_memory().expect("store");
        let workspace = std::env::temp_dir();
        let created = store
            .create_project(params(workspace.display().to_string()))
            .expect("project");
        let binding = store
            .bind_conversation(ConversationBindParams {
                project_id: created.project.project_id.clone(),
                conversation_id: "conversation-1".to_owned(),
                codex_thread_id: "thread-1".to_owned(),
                expected_codex_thread_id: None,
            })
            .expect("binding");
        assert_eq!(binding.binding.codex_thread_id, "thread-1");
        assert_eq!(
            store
                .read_project(&created.project.project_id)
                .expect("read")
                .brief
                .version,
            1
        );
    }

    #[test]
    fn renames_and_archives_projects_without_touching_workspace_files() {
        let store = ProjectStore::in_memory().expect("store");
        let workspace = test_workspace("project-actions");
        let project = store
            .create_project(params(workspace.display().to_string()))
            .expect("project")
            .project;

        let renamed = store
            .rename_project(ProjectRenameParams {
                project_id: project.project_id.clone(),
                name: "新的项目名".to_owned(),
            })
            .expect("rename project");
        assert_eq!(renamed.project.name, "新的项目名");

        let archived = store
            .archive_project(&project.project_id)
            .expect("archive project");
        assert_eq!(archived.project.state, ProjectState::Archived);
        assert!(workspace.exists());

        fs::remove_dir_all(workspace).expect("remove workspace");
    }

    #[test]
    fn lists_and_compare_and_swap_removes_conversation_bindings() {
        let store = ProjectStore::in_memory().expect("store");
        let workspace = test_workspace("binding-actions");
        let project = store
            .create_project(params(workspace.display().to_string()))
            .expect("project")
            .project;
        store
            .bind_conversation(ConversationBindParams {
                project_id: project.project_id.clone(),
                conversation_id: "main".to_owned(),
                codex_thread_id: "thread-1".to_owned(),
                expected_codex_thread_id: None,
            })
            .expect("binding");

        let listed = store
            .list_conversation_bindings(&project.project_id)
            .expect("list bindings");
        assert_eq!(listed.bindings.len(), 1);

        let conflict = store
            .unbind_conversation(ConversationUnbindParams {
                project_id: project.project_id.clone(),
                conversation_id: "main".to_owned(),
                expected_codex_thread_id: "thread-other".to_owned(),
            })
            .expect_err("stale thread id must fail");
        assert_eq!(conflict.code(), "CONVERSATION_BINDING_CONFLICT");

        let removed = store
            .unbind_conversation(ConversationUnbindParams {
                project_id: project.project_id.clone(),
                conversation_id: "main".to_owned(),
                expected_codex_thread_id: "thread-1".to_owned(),
            })
            .expect("unbind");
        assert_eq!(removed.binding.codex_thread_id, "thread-1");
        assert!(
            store
                .list_conversation_bindings(&project.project_id)
                .expect("list empty bindings")
                .bindings
                .is_empty()
        );

        fs::remove_dir_all(workspace).expect("remove workspace");
    }

    #[test]
    fn scopes_default_conversation_id_to_each_project() {
        let store = ProjectStore::in_memory().expect("store");
        let first_workspace = test_workspace("first");
        let second_workspace = test_workspace("second");
        let first = store
            .create_project(params(first_workspace.display().to_string()))
            .expect("first project");
        let second = store
            .create_project(params(second_workspace.display().to_string()))
            .expect("second project");

        for (project_id, thread_id) in [
            (first.project.project_id, "thread-first"),
            (second.project.project_id, "thread-second"),
        ] {
            store
                .bind_conversation(ConversationBindParams {
                    project_id: project_id.clone(),
                    conversation_id: "main".to_owned(),
                    codex_thread_id: thread_id.to_owned(),
                    expected_codex_thread_id: None,
                })
                .expect("bind main conversation");
            assert_eq!(
                store
                    .read_conversation_binding(&project_id, "main")
                    .expect("read binding")
                    .binding
                    .codex_thread_id,
                thread_id
            );
        }

        fs::remove_dir_all(first_workspace).expect("remove first workspace");
        fs::remove_dir_all(second_workspace).expect("remove second workspace");
    }

    #[test]
    fn replaces_binding_only_when_expected_thread_matches() {
        let store = ProjectStore::in_memory().expect("store");
        let workspace = test_workspace("replace");
        let project = store
            .create_project(params(workspace.display().to_string()))
            .expect("project")
            .project;
        store
            .bind_conversation(ConversationBindParams {
                project_id: project.project_id.clone(),
                conversation_id: "main".to_owned(),
                codex_thread_id: "thread-stale".to_owned(),
                expected_codex_thread_id: None,
            })
            .expect("initial binding");

        let conflict = store
            .bind_conversation(ConversationBindParams {
                project_id: project.project_id.clone(),
                conversation_id: "main".to_owned(),
                codex_thread_id: "thread-new".to_owned(),
                expected_codex_thread_id: Some("thread-other".to_owned()),
            })
            .expect_err("mismatched compare-and-swap must fail");
        assert_eq!(conflict.code(), "CONVERSATION_BINDING_CONFLICT");

        let replaced = store
            .bind_conversation(ConversationBindParams {
                project_id: project.project_id,
                conversation_id: "main".to_owned(),
                codex_thread_id: "thread-new".to_owned(),
                expected_codex_thread_id: Some("thread-stale".to_owned()),
            })
            .expect("replace stale binding");
        assert_eq!(replaced.binding.codex_thread_id, "thread-new");
        fs::remove_dir_all(workspace).expect("remove workspace");
    }

    #[test]
    fn migrates_global_conversation_primary_key() {
        let connection = Connection::open_in_memory().expect("connection");
        connection
            .execute_batch(
                "CREATE TABLE conversation_bindings (
                    conversation_id TEXT PRIMARY KEY NOT NULL,
                    project_id TEXT NOT NULL REFERENCES projects(project_id),
                    codex_thread_id TEXT NOT NULL UNIQUE,
                    updated_at_epoch_ms INTEGER NOT NULL,
                    UNIQUE(project_id, conversation_id)
                );",
            )
            .expect("legacy schema");
        let store = ProjectStore::from_connection(connection).expect("migrate store");
        let connection = store.connection().expect("store connection");
        let mut statement = connection
            .prepare("PRAGMA table_info(conversation_bindings)")
            .expect("table info");
        let primary_key = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(1)?, row.get::<_, i64>(5)?))
            })
            .expect("query columns")
            .collect::<Result<Vec<_>, _>>()
            .expect("columns")
            .into_iter()
            .filter(|(_, position)| *position > 0)
            .collect::<Vec<_>>();
        assert_eq!(
            primary_key,
            [
                ("project_id".to_owned(), 1),
                ("conversation_id".to_owned(), 2)
            ]
        );
    }

    fn test_workspace(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(new_id(label, epoch_ms()));
        fs::create_dir_all(&path).expect("create test workspace");
        path
    }

    #[test]
    fn versions_plans_and_records_explicit_user_approval() {
        let store = ProjectStore::in_memory().expect("store");
        let project = store
            .create_project(params(std::env::temp_dir().display().to_string()))
            .expect("project");
        let project_id = project.project.project_id;
        let first = store
            .create_plan(
                business_protocol::PlanCreateParams {
                    project_id: project_id.clone(),
                    plan: plan_input("第一版"),
                },
                "agent",
            )
            .expect("first plan")
            .plan;
        assert_eq!(first.state, business_protocol::PlanState::ReadyForReview);

        let approved = store
            .decide_plan(business_protocol::ApprovalDecideParams {
                project_id: project_id.clone(),
                plan_id: first.plan_id.clone(),
                expected_version: first.version,
                decision: business_protocol::ApprovalDecision::Approve,
                note: "范围确认".to_owned(),
            })
            .expect("approve plan");
        assert_eq!(approved.plan.state, business_protocol::PlanState::Approved);
        assert_eq!(approved.receipt.actor, "user");

        let second = store
            .create_plan(
                business_protocol::PlanCreateParams {
                    project_id: project_id.clone(),
                    plan: plan_input("第二版"),
                },
                "agent",
            )
            .expect("second plan")
            .plan;
        assert_eq!(second.version, 2);
        store
            .decide_plan(business_protocol::ApprovalDecideParams {
                project_id: project_id.clone(),
                plan_id: second.plan_id,
                expected_version: second.version,
                decision: business_protocol::ApprovalDecision::Approve,
                note: String::new(),
            })
            .expect("approve replacement");
        let first = store
            .read_plan(business_protocol::PlanReadParams {
                project_id,
                plan_id: first.plan_id,
            })
            .expect("read first plan")
            .plan;
        assert_eq!(first.state, business_protocol::PlanState::Superseded);
    }
}
