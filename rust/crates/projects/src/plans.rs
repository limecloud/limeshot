use std::collections::BTreeSet;

use business_protocol::{
    ApprovalDecideParams, ApprovalDecideResult, ApprovalDecision, ApprovalReceipt,
    BriefCompleteness, PlanCreateParams, PlanCreateResult, PlanInput, PlanListResult,
    PlanReadResult, PlanState, ProductionPlan,
};
use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::{ProjectStoreError, epoch_ms, new_id};

pub(crate) fn create(
    connection: &mut Connection,
    params: PlanCreateParams,
    created_by: &str,
) -> Result<PlanCreateResult, ProjectStoreError> {
    validate_input(&params.plan)?;
    if created_by.trim().is_empty() {
        return Err(ProjectStoreError::new(
            "PLAN_INPUT_INVALID",
            "计划创建者不能为空",
        ));
    }
    let transaction = connection.transaction().map_err(internal)?;
    let brief = transaction
        .query_row(
            "SELECT brief_id, version, completeness FROM brief_versions WHERE project_id = ?1 ORDER BY version DESC LIMIT 1",
            params![&params.project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?, row.get::<_, String>(2)?)),
        )
        .optional()
        .map_err(internal)?
        .ok_or_else(|| ProjectStoreError::new("PROJECT_NOT_FOUND", "项目不存在"))?;
    if brief_completeness(&brief.2)? != BriefCompleteness::Workable {
        return Err(ProjectStoreError::new(
            "PLAN_BRIEF_NOT_WORKABLE",
            "Brief 尚未达到可生成计划的完整度",
        ));
    }
    let version = transaction
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM production_plans WHERE project_id = ?1",
            params![&params.project_id],
            |row| row.get::<_, u32>(0),
        )
        .map_err(internal)?
        + 1;
    let now = epoch_ms();
    let plan_id = new_id("plan", now);
    let state = if params.plan.gaps.is_empty() {
        PlanState::ReadyForReview
    } else {
        PlanState::NeedsInput
    };
    transaction
        .execute(
            "UPDATE production_plans SET state = 'superseded' WHERE project_id = ?1 AND state IN ('draft', 'needs_input', 'ready_for_review')",
            params![&params.project_id],
        )
        .map_err(internal)?;
    transaction
        .execute(
            "INSERT INTO production_plans (plan_id, project_id, version, state, brief_id, brief_version, content_json, created_by, approved_by, created_at_epoch_ms, approved_at_epoch_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, NULL)",
            params![
                &plan_id,
                &params.project_id,
                version,
                plan_state_to_db(&state),
                &brief.0,
                brief.1,
                to_json(&params.plan)?,
                created_by,
                now,
            ],
        )
        .map_err(internal)?;
    transaction
        .execute(
            "UPDATE projects SET updated_at_epoch_ms = ?1 WHERE project_id = ?2",
            params![now, &params.project_id],
        )
        .map_err(internal)?;
    transaction.commit().map_err(internal)?;
    Ok(PlanCreateResult {
        plan: ProductionPlan {
            plan_id,
            project_id: params.project_id,
            version,
            state,
            brief_id: brief.0,
            brief_version: brief.1,
            content: params.plan,
            created_by: created_by.to_owned(),
            approved_by: None,
            created_at_epoch_ms: now,
            approved_at_epoch_ms: None,
        },
    })
}

pub(crate) fn list(
    connection: &Connection,
    project_id: &str,
) -> Result<PlanListResult, ProjectStoreError> {
    ensure_project(connection, project_id)?;
    let mut statement = connection
        .prepare(
            "SELECT plan_id, project_id, version, state, brief_id, brief_version, content_json, created_by, approved_by, created_at_epoch_ms, approved_at_epoch_ms
             FROM production_plans WHERE project_id = ?1 ORDER BY version DESC",
        )
        .map_err(internal)?;
    let rows = statement
        .query_map(params![project_id], plan_from_row)
        .map_err(internal)?;
    Ok(PlanListResult {
        plans: rows.collect::<Result<Vec<_>, _>>().map_err(internal)?,
    })
}

pub(crate) fn read(
    connection: &Connection,
    project_id: &str,
    plan_id: &str,
) -> Result<PlanReadResult, ProjectStoreError> {
    let plan = read_plan(connection, project_id, plan_id)?;
    Ok(PlanReadResult { plan })
}

pub(crate) fn decide(
    connection: &mut Connection,
    params: ApprovalDecideParams,
) -> Result<ApprovalDecideResult, ProjectStoreError> {
    let transaction = connection.transaction().map_err(internal)?;
    let current = read_plan(&transaction, &params.project_id, &params.plan_id)?;
    if current.version != params.expected_version {
        return Err(ProjectStoreError::new(
            "PLAN_CONFLICT",
            "计划版本已变化，请重新读取后再审批",
        ));
    }
    if current.state != PlanState::ReadyForReview {
        return Err(ProjectStoreError::new(
            "PLAN_NOT_REVIEWABLE",
            "只有待审核计划可以审批",
        ));
    }
    let now = epoch_ms();
    let approval_id = new_id("approval", now);
    let (next_state, approved_by, approved_at) = match params.decision {
        ApprovalDecision::Approve => (PlanState::Approved, Some("user".to_owned()), Some(now)),
        ApprovalDecision::RequestChanges => (PlanState::NeedsInput, None, None),
    };
    if params.decision == ApprovalDecision::Approve {
        transaction
            .execute(
                "UPDATE production_plans SET state = 'superseded' WHERE project_id = ?1 AND plan_id != ?2 AND state = 'approved'",
                params![&params.project_id, &params.plan_id],
            )
            .map_err(internal)?;
    }
    transaction
        .execute(
            "UPDATE production_plans SET state = ?1, approved_by = ?2, approved_at_epoch_ms = ?3 WHERE project_id = ?4 AND plan_id = ?5",
            params![
                plan_state_to_db(&next_state),
                approved_by.as_deref(),
                approved_at,
                &params.project_id,
                &params.plan_id,
            ],
        )
        .map_err(internal)?;
    transaction
        .execute(
            "INSERT INTO approval_receipts (approval_id, project_id, plan_id, plan_version, decision, actor, note, decided_at_epoch_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, 'user', ?6, ?7)",
            params![
                &approval_id,
                &params.project_id,
                &params.plan_id,
                current.version,
                approval_decision_to_db(&params.decision),
                params.note.trim(),
                now,
            ],
        )
        .map_err(internal)?;
    transaction
        .execute(
            "UPDATE projects SET state = CASE WHEN ?1 = 'approved' THEN 'active' ELSE state END, updated_at_epoch_ms = ?2 WHERE project_id = ?3",
            params![plan_state_to_db(&next_state), now, &params.project_id],
        )
        .map_err(internal)?;
    transaction.commit().map_err(internal)?;
    let plan = ProductionPlan {
        state: next_state,
        approved_by,
        approved_at_epoch_ms: approved_at,
        ..current
    };
    Ok(ApprovalDecideResult {
        receipt: ApprovalReceipt {
            approval_id,
            project_id: params.project_id,
            plan_id: params.plan_id,
            plan_version: plan.version,
            decision: params.decision,
            actor: "user".to_owned(),
            note: params.note.trim().to_owned(),
            decided_at_epoch_ms: now,
        },
        plan,
    })
}

fn read_plan(
    connection: &Connection,
    project_id: &str,
    plan_id: &str,
) -> Result<ProductionPlan, ProjectStoreError> {
    connection
        .query_row(
            "SELECT plan_id, project_id, version, state, brief_id, brief_version, content_json, created_by, approved_by, created_at_epoch_ms, approved_at_epoch_ms
             FROM production_plans WHERE project_id = ?1 AND plan_id = ?2",
            params![project_id, plan_id],
            plan_from_row,
        )
        .optional()
        .map_err(internal)?
        .ok_or_else(|| ProjectStoreError::new("PLAN_NOT_FOUND", "计划不存在"))
}

fn plan_from_row(row: &Row<'_>) -> rusqlite::Result<ProductionPlan> {
    Ok(ProductionPlan {
        plan_id: row.get(0)?,
        project_id: row.get(1)?,
        version: row.get(2)?,
        state: plan_state_from_db(&row.get::<_, String>(3)?).map_err(to_sql_error)?,
        brief_id: row.get(4)?,
        brief_version: row.get(5)?,
        content: serde_json::from_str(&row.get::<_, String>(6)?).map_err(to_sql_error)?,
        created_by: row.get(7)?,
        approved_by: row.get(8)?,
        created_at_epoch_ms: row.get(9)?,
        approved_at_epoch_ms: row.get(10)?,
    })
}

fn ensure_project(connection: &Connection, project_id: &str) -> Result<(), ProjectStoreError> {
    let exists = connection
        .query_row(
            "SELECT 1 FROM projects WHERE project_id = ?1",
            params![project_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(internal)?;
    exists.ok_or_else(|| ProjectStoreError::new("PROJECT_NOT_FOUND", "项目不存在"))
}

fn validate_input(plan: &PlanInput) -> Result<(), ProjectStoreError> {
    if plan.title.trim().is_empty()
        || plan.summary.trim().is_empty()
        || plan.deliverables.is_empty()
    {
        return Err(ProjectStoreError::new(
            "PLAN_INPUT_INVALID",
            "计划标题、摘要和交付目标不能为空",
        ));
    }
    if plan.deliverables.iter().any(|item| item.trim().is_empty())
        || plan.gaps.iter().any(|item| item.trim().is_empty())
        || plan.risks.iter().any(|item| item.trim().is_empty())
    {
        return Err(ProjectStoreError::new(
            "PLAN_INPUT_INVALID",
            "计划列表项不能为空",
        ));
    }
    let ids = plan
        .operations
        .iter()
        .map(|operation| operation.operation_id.as_str())
        .collect::<BTreeSet<_>>();
    if ids.len() != plan.operations.len()
        || plan.operations.iter().any(|operation| {
            operation.operation_id.trim().is_empty()
                || operation.kind.trim().is_empty()
                || operation.title.trim().is_empty()
                || operation.depends_on.iter().any(|dependency| {
                    dependency == &operation.operation_id || !ids.contains(dependency.as_str())
                })
        })
    {
        return Err(ProjectStoreError::new(
            "PLAN_INPUT_INVALID",
            "计划 operation 标识或依赖无效",
        ));
    }
    let mut resolved = BTreeSet::new();
    while resolved.len() < plan.operations.len() {
        let before = resolved.len();
        for operation in &plan.operations {
            if operation
                .depends_on
                .iter()
                .all(|dependency| resolved.contains(dependency.as_str()))
            {
                resolved.insert(operation.operation_id.as_str());
            }
        }
        if resolved.len() == before {
            return Err(ProjectStoreError::new(
                "PLAN_INPUT_INVALID",
                "计划 operation 依赖存在环",
            ));
        }
    }
    Ok(())
}

fn brief_completeness(value: &str) -> Result<BriefCompleteness, ProjectStoreError> {
    match value {
        "incomplete" => Ok(BriefCompleteness::Incomplete),
        "workable" => Ok(BriefCompleteness::Workable),
        "conflicting" => Ok(BriefCompleteness::Conflicting),
        _ => Err(internal("Brief 完整性状态损坏")),
    }
}

fn plan_state_from_db(value: &str) -> Result<PlanState, ProjectStoreError> {
    match value {
        "draft" => Ok(PlanState::Draft),
        "needs_input" => Ok(PlanState::NeedsInput),
        "ready_for_review" => Ok(PlanState::ReadyForReview),
        "approved" => Ok(PlanState::Approved),
        "executing" => Ok(PlanState::Executing),
        "delivered" => Ok(PlanState::Delivered),
        "failed" => Ok(PlanState::Failed),
        "superseded" => Ok(PlanState::Superseded),
        "canceled" => Ok(PlanState::Canceled),
        _ => Err(internal("计划状态损坏")),
    }
}

fn plan_state_to_db(value: &PlanState) -> &'static str {
    match value {
        PlanState::Draft => "draft",
        PlanState::NeedsInput => "needs_input",
        PlanState::ReadyForReview => "ready_for_review",
        PlanState::Approved => "approved",
        PlanState::Executing => "executing",
        PlanState::Delivered => "delivered",
        PlanState::Failed => "failed",
        PlanState::Superseded => "superseded",
        PlanState::Canceled => "canceled",
    }
}

fn approval_decision_to_db(value: &ApprovalDecision) -> &'static str {
    match value {
        ApprovalDecision::Approve => "approve",
        ApprovalDecision::RequestChanges => "request_changes",
    }
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
