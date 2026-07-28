## LimeShot v0.2.0

Release date: 2026-07-28

Simplified Chinese release notes are the primary version.

### New features

- Completes the business path from an approved ProductionPlan through asset import, media probing, MP4 transcoding, and explicit delivery confirmation.
- Adds structured FFprobe and FFmpeg execution. Background progress, cancellation, timeout, process reaping, atomic `.part` commits, and failure cleanup are owned by the Rust Business Service.
- Adds explicit task retry. Failed, canceled, and interrupted TaskRuns retain their history and create a linear successor through `retryOfTaskRunId`.
- Adds deterministic media QA. A transcode must pass MP4 container, positive duration, non-empty file, and playable media-stream checks before `media-output.v1` and `qa-report.v1` are registered atomically.
- Adds GUI delivery confirmation. Confirming a QA-passing media output revalidates file integrity and creates the Project's single current Deliverable while retaining prior delivery records.
- New conversations accept input while the Codex Thread is starting and automatically send the queued first message once ready.

### Fixes

- Cancellation, timeout, application shutdown, and process errors now use kill plus wait, preventing orphaned FFmpeg processes and `.part` files.
- Changed source assets, output files, and QA reports now fail closed instead of using invalid or modified Artifacts.
- A zero FFmpeg exit code is no longer mistaken for successful QA or delivery.
- Existing SQLite databases receive idempotent retry-lineage, QA, and Deliverable migrations; in-flight local tasks become interrupted after restart.
- Switching Projects or returning home clears an unsent first-turn request so it cannot be delivered to the wrong conversation.

### Improvements and refactoring

- Upgrades the Rust business protocol to v4 with SourceAsset, TaskRun, MediaJob, Artifact QA, Deliverable projections, and `deliverable/confirm`.
- Keeps media responsibilities within the existing `business-core`, `projects`, `media`, and `artifacts` owners without adding another Agent runtime or workflow DAG.
- The Renderer continues to use preload semantic APIs only and never receives file paths, processes, codecs, FFmpeg argv, or raw JSON-RPC.
- Adds media execution, retry, QA, and delivery text in all five supported interface languages.

### Testing and quality

- `npm run verify:local` passes version, governance, resource, type, protocol, Artifact schema, full Rust, release build, and real Electron Gate B checks.
- React regression coverage includes 9 test files and 23 tests; the Projects repository includes 19 tests.
- The real Gate B covers Codex dynamic tools, GUI plan approval, asset import, media probe, transcode, cancellation, retry, passing QA, delivery confirmation, and full cold-start recovery.
- Delivery negative tests cover non-media Artifacts, missing passing QA, changed output files, and changed QA reports.

### Documentation

- Updates the PRD, business specification, protocol v4, architecture, business flow, local media sequence, quality gates, and execution plan.
- Defines Task success, passing QA, Artifact registration, and Deliverable confirmation as four independent facts; only an explicit GUI user action can confirm delivery.

### Current scope

- This release provides a macOS Apple Silicon build.
- The app has a complete ad-hoc signature but is not yet Developer ID signed or Apple-notarized; first launch requires confirmation in macOS Privacy & Security.
- The media path passes a real Electron Gate B with pinned FFprobe and FFmpeg fixtures. Redistributable macOS and Windows LGPL FFmpeg builds are not yet present in the resource manifest, so media services remain fail-closed in the packaged application.
- Remote media Providers, cost settlement, Codex account login UI, and upstream native tool approvals are not included.

**Full changes**: `v0.1.0` -> `v0.2.0`
