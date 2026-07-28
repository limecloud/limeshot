use std::{
    fs,
    path::{Path, PathBuf},
};

use business_protocol::{
    ApprovalDecideParams, ApprovalDecision, BriefInput, DeliverableConfirmParams,
    MediaProbeSummary, PlanCreateParams, PlanInput, PlanOperationInput, ProjectCreateParams,
    QaCheckSummary, QaReportSummary, SourceAssetImportParams, SourceAssetState, TaskRetryParams,
    TaskRunState, TaskStartParams,
};
use rusqlite::Connection;

use crate::{ProjectStore, epoch_ms};

#[test]
fn requires_approved_media_probe_and_persists_lineage() {
    let fixture = fixture("lineage");
    let start = TaskStartParams {
        project_id: fixture.project_id.clone(),
        plan_id: fixture.plan_id.clone(),
        source_asset_id: fixture.source_asset_id.clone(),
        operation_id: "probe-source".to_owned(),
    };
    assert_eq!(
        fixture
            .store
            .prepare_media_task(start.clone())
            .expect_err("approval required")
            .code(),
        "TASK_APPROVAL_REQUIRED"
    );
    approve(&fixture);
    let prepared = fixture.store.prepare_media_task(start).expect("prepare");
    fixture
        .store
        .mark_media_task_running(&prepared)
        .expect("running");
    let media = MediaProbeSummary {
        duration_ms: 1_000,
        container: "wav".to_owned(),
        byte_size: 13,
        streams: vec![],
    };
    let completed = fixture
        .store
        .complete_media_probe(&prepared, media, br#"{"artifactType":"media-manifest.v1"}"#)
        .expect("complete");
    assert_eq!(completed.task_run.state, TaskRunState::Succeeded);
    assert_eq!(completed.source_asset.state, SourceAssetState::Probed);
    let artifact = completed.artifact.expect("probe artifact");
    assert_eq!(artifact.lineage.plan_version, 1);
    assert!(fixture.workspace.join(&artifact.relative_path).is_file());
    fixture.cleanup();
}

#[test]
fn rejects_changed_imported_content() {
    let fixture = fixture("changed");
    approve(&fixture);
    let imported = fs::read_dir(fixture.workspace.join("assets"))
        .expect("assets")
        .next()
        .expect("file")
        .expect("entry")
        .path();
    fs::write(imported, b"changed").expect("mutate");
    let error = fixture
        .store
        .prepare_media_task(fixture.start_params())
        .expect_err("changed");
    assert_eq!(error.code(), "SOURCE_ASSET_CHANGED");
    assert_eq!(
        fixture
            .store
            .read_execution(&fixture.project_id)
            .expect("read")
            .source_assets[0]
            .state,
        SourceAssetState::Changed
    );
    fixture.cleanup();
}

#[test]
fn marks_inflight_media_work_interrupted_on_restart() {
    let fixture = fixture("restart");
    approve(&fixture);
    let prepared = fixture
        .store
        .prepare_media_task(fixture.start_params())
        .expect("prepare");
    fixture
        .store
        .mark_media_task_running(&prepared)
        .expect("running");
    let Fixture {
        root,
        workspace,
        project_id,
        store,
        ..
    } = fixture;
    drop(store);
    let reopened = ProjectStore::open(&root.join("data")).expect("reopen");
    let execution = reopened.read_execution(&project_id).expect("execution");
    assert_eq!(execution.task_runs[0].state, TaskRunState::Interrupted);
    assert_eq!(
        execution.media_jobs[0].state,
        business_protocol::MediaJobState::Interrupted
    );
    drop(reopened);
    let _ = fs::remove_dir_all(root);
    let _ = workspace;
}

#[test]
fn restart_cleans_interrupted_transcode_partial_output() {
    let fixture = fixture("restart-partial");
    approve(&fixture);
    complete_probe(&fixture);
    let prepared = fixture
        .store
        .prepare_media_task(fixture.transcode_params())
        .expect("prepare output");
    fixture
        .store
        .mark_media_task_running(&prepared)
        .expect("running");
    let output = prepared.output.as_ref().expect("output");
    fs::create_dir_all(output.partial_path.parent().expect("output parent")).expect("output dir");
    fs::write(&output.partial_path, b"partial").expect("partial output");
    let Fixture {
        root,
        project_id,
        store,
        ..
    } = fixture;
    drop(store);
    let reopened = ProjectStore::open(&root.join("data")).expect("reopen");
    let execution = reopened.read_execution(&project_id).expect("execution");
    assert!(execution.task_runs.iter().any(|task| {
        task.task_run_id == prepared.task_run.task_run_id && task.state == TaskRunState::Interrupted
    }));
    assert!(!output.partial_path.exists());
    drop(reopened);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn rejects_source_asset_from_another_project() {
    let source_fixture = fixture("cross-source");
    let target_fixture = fixture("cross-target");
    approve(&target_fixture);
    let error = target_fixture
        .store
        .prepare_media_task(TaskStartParams {
            project_id: target_fixture.project_id.clone(),
            plan_id: target_fixture.plan_id.clone(),
            source_asset_id: source_fixture.source_asset_id.clone(),
            operation_id: "probe-source".to_owned(),
        })
        .expect_err("cross-project asset");
    assert_eq!(error.code(), "SOURCE_ASSET_NOT_FOUND");
    source_fixture.cleanup();
    target_fixture.cleanup();
}

#[test]
fn transcode_requires_dependencies_and_persists_output_lineage() {
    let fixture = fixture("transcode");
    approve(&fixture);
    assert_eq!(
        fixture
            .store
            .prepare_media_task(fixture.transcode_params())
            .expect_err("dependency")
            .code(),
        "TASK_DEPENDENCY_INCOMPLETE"
    );
    complete_probe(&fixture);
    let prepared = fixture
        .store
        .prepare_media_task(fixture.transcode_params())
        .expect("prepare output");
    fixture
        .store
        .mark_media_task_running(&prepared)
        .expect("running");
    fixture
        .store
        .update_media_progress(&prepared, 61)
        .expect("progress");
    let output = prepared.output.as_ref().expect("output path");
    fs::create_dir_all(output.path.parent().expect("output parent")).expect("output directory");
    fs::write(&output.path, b"mp4-output").expect("output fixture");
    let completed = fixture
        .store
        .complete_media_output(
            &prepared,
            MediaProbeSummary {
                duration_ms: 1_000,
                container: "mp4".to_owned(),
                byte_size: 10,
                streams: vec![],
            },
            passed_qa(),
            br#"{"artifactType":"qa-report.v1"}"#,
        )
        .expect("complete output");
    assert_eq!(completed.task_run.state, TaskRunState::Succeeded);
    assert_eq!(completed.media_job.progress_percent, 100);
    let artifact = completed.artifact.expect("output artifact");
    assert_eq!(artifact.artifact_type, "media-output.v1");
    assert_eq!(artifact.lineage.task_run_id, completed.task_run.task_run_id);
    assert!(fixture.workspace.join(artifact.relative_path).is_file());
    assert_eq!(completed.task_run.artifact_ids.len(), 2);
    let delivery = fixture
        .store
        .confirm_deliverable(DeliverableConfirmParams {
            project_id: fixture.project_id.clone(),
            artifact_id: artifact.artifact_id,
        })
        .expect("confirm deliverable")
        .deliverable;
    assert!(delivery.is_current);
    assert_eq!(delivery.qa_artifact_id, completed.task_run.artifact_ids[1]);
    fixture.cleanup();
}

#[test]
fn deliverable_rejects_non_media_output_artifact() {
    let fixture = fixture("deliverable-type");
    approve(&fixture);
    complete_probe(&fixture);
    let probe_artifact = fixture
        .store
        .read_execution(&fixture.project_id)
        .expect("execution")
        .artifacts
        .into_iter()
        .find(|artifact| artifact.artifact_type == "media-manifest.v1")
        .expect("probe artifact");

    let error = fixture
        .store
        .confirm_deliverable(DeliverableConfirmParams {
            project_id: fixture.project_id.clone(),
            artifact_id: probe_artifact.artifact_id,
        })
        .expect_err("probe artifact cannot be delivered");
    assert_eq!(error.code(), "ARTIFACT_NOT_DELIVERABLE");
    fixture.cleanup();
}

#[test]
fn deliverable_requires_a_passing_qa_artifact() {
    let fixture = fixture("deliverable-qa");
    approve(&fixture);
    complete_probe(&fixture);
    let completed = complete_output(&fixture);
    let output = completed.artifact.expect("output artifact");
    let qa_artifact_id = completed.task_run.artifact_ids[1].clone();
    fixture
        .store
        .connection()
        .expect("connection")
        .execute(
            "DELETE FROM artifacts WHERE artifact_id = ?1",
            rusqlite::params![qa_artifact_id],
        )
        .expect("delete QA artifact fixture");

    let error = fixture
        .store
        .confirm_deliverable(DeliverableConfirmParams {
            project_id: fixture.project_id.clone(),
            artifact_id: output.artifact_id,
        })
        .expect_err("passing QA is required");
    assert_eq!(error.code(), "ARTIFACT_QA_REQUIRED");
    fixture.cleanup();
}

#[test]
fn deliverable_rejects_an_output_changed_after_qa() {
    let fixture = fixture("deliverable-changed");
    approve(&fixture);
    complete_probe(&fixture);
    let output = complete_output(&fixture).artifact.expect("output artifact");
    fs::write(
        fixture.workspace.join(&output.relative_path),
        b"changed-after-qa",
    )
    .expect("mutate output fixture");

    let error = fixture
        .store
        .confirm_deliverable(DeliverableConfirmParams {
            project_id: fixture.project_id.clone(),
            artifact_id: output.artifact_id,
        })
        .expect_err("changed output cannot be delivered");
    assert_eq!(error.code(), "ARTIFACT_CHANGED");
    fixture.cleanup();
}

#[test]
fn deliverable_rejects_a_qa_report_changed_after_registration() {
    let fixture = fixture("deliverable-qa-changed");
    approve(&fixture);
    complete_probe(&fixture);
    let completed = complete_output(&fixture);
    let output = completed.artifact.expect("output artifact");
    let qa_artifact_id = &completed.task_run.artifact_ids[1];
    let qa_relative_path = fixture
        .store
        .read_execution(&fixture.project_id)
        .expect("execution")
        .artifacts
        .into_iter()
        .find(|artifact| artifact.artifact_id == *qa_artifact_id)
        .expect("QA artifact")
        .relative_path;
    fs::write(
        fixture.workspace.join(qa_relative_path),
        br#"{"passed":false}"#,
    )
    .expect("mutate QA fixture");

    let error = fixture
        .store
        .confirm_deliverable(DeliverableConfirmParams {
            project_id: fixture.project_id.clone(),
            artifact_id: output.artifact_id,
        })
        .expect_err("changed QA report cannot be delivered");
    assert_eq!(error.code(), "ARTIFACT_CHANGED");
    fixture.cleanup();
}

#[test]
fn cancellation_is_terminal_without_registering_an_artifact() {
    let fixture = fixture("cancel");
    approve(&fixture);
    complete_probe(&fixture);
    let prepared = fixture
        .store
        .prepare_media_task(fixture.transcode_params())
        .expect("prepare output");
    fixture
        .store
        .mark_media_task_running(&prepared)
        .expect("running");
    fixture.store.cancel_media_task(&prepared).expect("cancel");
    let result = fixture
        .store
        .task_cancel_result(&fixture.project_id, &prepared.task_run.task_run_id, true)
        .expect("cancel result");
    assert!(result.accepted);
    assert_eq!(result.task_run.state, TaskRunState::Canceled);
    assert_eq!(
        result.media_job.state,
        business_protocol::MediaJobState::Canceled
    );
    assert!(result.task_run.artifact_ids.is_empty());
    fixture.cleanup();
}

#[test]
fn retry_preserves_terminal_history_and_persists_a_linear_chain() {
    let fixture = fixture("retry-chain");
    approve(&fixture);
    complete_probe(&fixture);
    let canceled = fixture
        .store
        .prepare_media_task(fixture.transcode_params())
        .expect("prepare canceled output");
    fixture
        .store
        .mark_media_task_running(&canceled)
        .expect("run canceled output");
    fixture
        .store
        .cancel_media_task(&canceled)
        .expect("cancel output");

    let retried = fixture
        .store
        .prepare_media_retry(TaskRetryParams {
            project_id: fixture.project_id.clone(),
            task_run_id: canceled.task_run.task_run_id.clone(),
        })
        .expect("prepare retry");
    assert_ne!(retried.task_run.task_run_id, canceled.task_run.task_run_id);
    assert_eq!(
        retried.task_run.retry_of_task_run_id.as_deref(),
        Some(canceled.task_run.task_run_id.as_str())
    );
    fixture
        .store
        .mark_media_task_running(&retried)
        .expect("run retry");
    let output = retried.output.as_ref().expect("retry output");
    fs::create_dir_all(output.path.parent().expect("output parent")).expect("output directory");
    fs::write(&output.path, b"retried-mp4-output").expect("retry output fixture");
    fixture
        .store
        .complete_media_output(
            &retried,
            MediaProbeSummary {
                duration_ms: 1_000,
                container: "mp4".to_owned(),
                byte_size: 18,
                streams: vec![],
            },
            passed_qa(),
            br#"{"artifactType":"qa-report.v1"}"#,
        )
        .expect("complete retry");

    let duplicate = fixture
        .store
        .prepare_media_retry(TaskRetryParams {
            project_id: fixture.project_id.clone(),
            task_run_id: canceled.task_run.task_run_id.clone(),
        })
        .expect_err("retry chain must be linear");
    assert_eq!(duplicate.code(), "TASK_ALREADY_RETRIED");

    let Fixture {
        root,
        project_id,
        store,
        ..
    } = fixture;
    drop(store);
    let reopened = ProjectStore::open(&root.join("data")).expect("reopen");
    let execution = reopened.read_execution(&project_id).expect("execution");
    let original = execution
        .task_runs
        .iter()
        .find(|task| task.task_run_id == canceled.task_run.task_run_id)
        .expect("original task");
    let retry = execution
        .task_runs
        .iter()
        .find(|task| task.task_run_id == retried.task_run.task_run_id)
        .expect("retry task");
    assert_eq!(original.state, TaskRunState::Canceled);
    assert_eq!(retry.state, TaskRunState::Succeeded);
    assert_eq!(
        retry.retry_of_task_run_id.as_deref(),
        Some(original.task_run_id.as_str())
    );
    drop(reopened);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn retry_rejects_non_terminal_success() {
    let fixture = fixture("retry-success");
    approve(&fixture);
    complete_probe(&fixture);
    let succeeded = fixture
        .store
        .read_execution(&fixture.project_id)
        .expect("execution")
        .task_runs
        .into_iter()
        .find(|task| task.operation_id == "probe-source")
        .expect("probe task");
    let error = fixture
        .store
        .prepare_media_retry(TaskRetryParams {
            project_id: fixture.project_id.clone(),
            task_run_id: succeeded.task_run_id,
        })
        .expect_err("success is not retryable");
    assert_eq!(error.code(), "TASK_NOT_RETRYABLE");
    fixture.cleanup();
}

#[test]
fn migrates_retry_lineage_column_for_existing_databases() {
    let root = fixture_root("retry-migration");
    let data = root.join("data");
    fs::create_dir_all(&data).expect("data directory");
    let database = data.join("projects.db");
    let connection = Connection::open(&database).expect("legacy database");
    connection
        .execute_batch(
            "CREATE TABLE task_runs (
                task_run_id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                plan_version INTEGER NOT NULL,
                approval_id TEXT NOT NULL,
                source_asset_id TEXT NOT NULL,
                operation_id TEXT NOT NULL,
                state TEXT NOT NULL,
                input_sha256 TEXT NOT NULL,
                media_job_id TEXT NOT NULL UNIQUE,
                artifact_ids_json TEXT NOT NULL,
                error_code TEXT,
                created_at_epoch_ms INTEGER NOT NULL,
                started_at_epoch_ms INTEGER,
                completed_at_epoch_ms INTEGER
            );",
        )
        .expect("legacy task table");
    drop(connection);

    let store = ProjectStore::open(&data).expect("migrate database");
    drop(store);
    let connection = Connection::open(database).expect("migrated database");
    let mut statement = connection
        .prepare("PRAGMA table_info(task_runs)")
        .expect("task columns");
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .expect("column rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("columns");
    assert!(
        columns
            .iter()
            .any(|column| column == "retry_of_task_run_id")
    );
    drop(statement);
    drop(connection);
    let _ = fs::remove_dir_all(root);
}

struct Fixture {
    root: PathBuf,
    workspace: PathBuf,
    store: ProjectStore,
    project_id: String,
    plan_id: String,
    plan_version: u32,
    source_asset_id: String,
}

impl Fixture {
    fn start_params(&self) -> TaskStartParams {
        TaskStartParams {
            project_id: self.project_id.clone(),
            plan_id: self.plan_id.clone(),
            source_asset_id: self.source_asset_id.clone(),
            operation_id: "probe-source".to_owned(),
        }
    }

    fn transcode_params(&self) -> TaskStartParams {
        TaskStartParams {
            project_id: self.project_id.clone(),
            plan_id: self.plan_id.clone(),
            source_asset_id: self.source_asset_id.clone(),
            operation_id: "transcode-source".to_owned(),
        }
    }

    fn cleanup(self) {
        let root = self.root.clone();
        drop(self);
        let _ = fs::remove_dir_all(root);
    }
}

fn fixture(name: &str) -> Fixture {
    let root = fixture_root(name);
    let workspace = root.join("workspace");
    fs::create_dir_all(&workspace).expect("workspace");
    let source = root.join("source.wav");
    fs::write(&source, b"media-fixture").expect("source");
    let store = ProjectStore::open(&root.join("data")).expect("store");
    let project_id = create_project(&store, &workspace);
    let plan = store
        .create_plan(
            PlanCreateParams {
                project_id: project_id.clone(),
                plan: media_plan(),
            },
            "agent",
        )
        .expect("plan")
        .plan;
    let source_asset_id = store
        .import_source_asset(SourceAssetImportParams {
            project_id: project_id.clone(),
            source_path: source.display().to_string(),
        })
        .expect("asset")
        .source_asset
        .source_asset_id;
    Fixture {
        root,
        workspace,
        store,
        project_id,
        plan_id: plan.plan_id,
        plan_version: plan.version,
        source_asset_id,
    }
}

fn approve(fixture: &Fixture) {
    fixture
        .store
        .decide_plan(ApprovalDecideParams {
            project_id: fixture.project_id.clone(),
            plan_id: fixture.plan_id.clone(),
            expected_version: fixture.plan_version,
            decision: ApprovalDecision::Approve,
            note: String::new(),
        })
        .expect("approve");
}

fn complete_probe(fixture: &Fixture) {
    let prepared = fixture
        .store
        .prepare_media_task(fixture.start_params())
        .expect("prepare probe");
    fixture
        .store
        .mark_media_task_running(&prepared)
        .expect("run probe");
    fixture
        .store
        .complete_media_probe(
            &prepared,
            MediaProbeSummary {
                duration_ms: 1_000,
                container: "wav".to_owned(),
                byte_size: 13,
                streams: vec![],
            },
            br#"{"artifactType":"media-manifest.v1"}"#,
        )
        .expect("complete probe");
}

fn complete_output(fixture: &Fixture) -> business_protocol::TaskStartResult {
    let prepared = fixture
        .store
        .prepare_media_task(fixture.transcode_params())
        .expect("prepare output");
    fixture
        .store
        .mark_media_task_running(&prepared)
        .expect("run output");
    let output = prepared.output.as_ref().expect("output path");
    fs::create_dir_all(output.path.parent().expect("output parent")).expect("output directory");
    fs::write(&output.path, b"mp4-output").expect("output fixture");
    fixture
        .store
        .complete_media_output(
            &prepared,
            MediaProbeSummary {
                duration_ms: 1_000,
                container: "mp4".to_owned(),
                byte_size: 10,
                streams: vec![],
            },
            passed_qa(),
            br#"{"artifactType":"qa-report.v1"}"#,
        )
        .expect("complete output")
}

fn passed_qa() -> QaReportSummary {
    QaReportSummary {
        passed: true,
        checks: vec![QaCheckSummary {
            check_id: "container.mp4".to_owned(),
            passed: true,
            detail: "container=mp4".to_owned(),
        }],
    }
}

fn create_project(store: &ProjectStore, workspace: &Path) -> String {
    store
        .create_project(ProjectCreateParams {
            name: "media".to_owned(),
            profile_id: "general".to_owned(),
            workspace_path: workspace.display().to_string(),
            brief: BriefInput {
                subject: "probe".to_owned(),
                audience: "test".to_owned(),
                platform: "desktop".to_owned(),
                target_duration_seconds: Some(1),
                aspect_ratio: "16:9".to_owned(),
                language: "en-US".to_owned(),
                style: String::new(),
                must_include: vec![],
                prohibited: vec![],
                delivery_format: "mp4".to_owned(),
            },
        })
        .expect("project")
        .project
        .project_id
}

fn media_plan() -> PlanInput {
    PlanInput {
        title: "Probe source".to_owned(),
        summary: "Inspect imported media".to_owned(),
        deliverables: vec!["Manifest".to_owned()],
        operations: vec![
            PlanOperationInput {
                operation_id: "probe-source".to_owned(),
                kind: "media_probe".to_owned(),
                title: "Probe".to_owned(),
                capability_id: None,
                depends_on: vec![],
            },
            PlanOperationInput {
                operation_id: "transcode-source".to_owned(),
                kind: "media_transcode".to_owned(),
                title: "Transcode".to_owned(),
                capability_id: None,
                depends_on: vec!["probe-source".to_owned()],
            },
        ],
        gaps: vec![],
        risks: vec![],
    }
}

fn fixture_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "limeshot-projects-{name}-{}-{}",
        std::process::id(),
        epoch_ms()
    ))
}
