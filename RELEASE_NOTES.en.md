## LimeShot v0.4.0

Release date: 2026-07-29

### Desktop experience

- Delivers the first GUI-alignment phase for the Sidebar, Project Home, Conversation Timeline, Composer, and blocking interactions using Codex Desktop interaction patterns as a reference. Projects remain LimeShot's business entry point; Codex Desktop is neither a dependency nor part of the runtime.
- Adds a real conversation tree under each Project. The first five bound conversations are shown by default and can be expanded; Project rows open Project Home while nested rows open canonical conversation history.
- Automatically lists unbound local Codex root threads in Recent and de-duplicates them against Project conversations by thread ID. Recent can be grouped by Project or shown as a single list and sorted by priority, update time, or manual order.
- Completes owned Project and Conversation actions including pinning, rename, archive, delete, read state, Finder, and copy operations. Permanent conversation deletion requires confirmation, and removing a Project never deletes workspace files.
- Refines Project-context Home, task starters, the two-level Composer, Timeline activity rows, dialogs, responsive layouts, and accessibility behavior.

### Conversations and Projects

- Discovers local non-ephemeral root threads through paginated Codex `thread/list`. Threads whose working directory is the Project root or a descendant are grouped into that Project; all others appear in Recent.
- Keeps Codex `thread/read` and paginated history as the only conversation-history source. LimeShot does not copy Agent history or synthesize terminal state from deltas.
- Opens automatically discovered, unbound external threads as read-only. Electron Main rejects new Turns for them so capabilities and approvals from another Codex host are not inherited.
- Upgrades the Business protocol to v5 with `project/rename`, `project/archive`, `conversation/binding/list`, and `conversation/unbind`, synchronized across Rust, JSON Schema, the TypeScript client, Electron semantic gateways, and contract tests.
- Inserts newly materialized conversations into the Project tree immediately and reloads their Codex-owned title after each completed Turn. Rename, archive, and delete operate on complete ownership targets and update bindings.

### Agent projection

- Uses compact Activity Rows for Reasoning, Plan, Search, Shell, Diff, MCP, Dynamic Tool, Resource, and Media items. Completed activity is quieter while failed, declined, and interrupted terminal states remain explicit.
- Shows MCP server/tool identity, source, resources, duration, and recent progress. Dynamic Tool failures become visible terminal states, and Image Generation uses stable media geometry with bounded prompt and result content.
- Projects Hook prompts as user messages and Multi-Agent create/message/resume/close activity with Agent status and read-only child-thread navigation. Boundary-only wait/review/sleep events no longer pollute the primary timeline.
- Distinguishes automatic/manual and in-progress/completed Context Compaction. Unknown protocol drift remains in the redacted diagnostic owner instead of producing misleading timeline cards.
- Keeps raw reasoning out of the DOM and applies recursive secret redaction plus bounded rendering to JSON, long text, stdout, and diffs.

### Engineering governance and brand

- Adds repository-level `AGENTS.md`, `internal/aiprompts/**`, and four project Codex skills for command boundaries, governance, quality, and releases. Development Agent skills remain isolated from product runtime skills.
- Adds UI parity governance and real Electron Gate B evidence while preserving the single `Electron Renderer -> preload -> Electron Main -> Codex + Rust Business Service` product chain.
- Uses `assets/icons/limeshot.svg` as the single design source for the 1024px PNG, macOS ICNS, and Windows ICO used by packaged apps and runtime windows.

### Platform release

- Adds the first Windows x64 Squirrel release: Setup EXE, NuGet package, and `RELEASES`.
- Continues macOS Apple Silicon DMG and ZIP releases. Both platforms pin official OpenAI Codex `0.145.0` and verify the archive, executable, version output, and packaged companion binaries.
- Runs the real Electron Gate B natively on macOS and Windows in GitHub Actions. The Release is published only after both platform asset sets succeed and a unified `SHA256SUMS.txt` is generated and verified.

### Current scope

- This release is the first Codex Desktop GUI parity phase, not a claim of complete visual or functional parity. Business inspectors, additional conditional thread actions, and full runtime screenshot comparison remain on the roadmap.
- macOS uses ad-hoc signing and is not Developer ID signed or Apple-notarized. Windows signing secrets are not configured, so the v0.4.0 Squirrel assets are unsigned.
- Redistributable FFmpeg/FFprobe runtimes are not yet packaged. Media services fail closed when managed media resources are unavailable.
- Remote image, video, and voice Providers, cost settlement, and the Codex account login GUI are not yet delivered.

### Release verification

- `npm run verify:local` passes version, runtime/UI governance, resource provenance, type, protocol, 41 Rust tests, the release build, and the real Electron Gate B.
- The full Vitest suite passes 97 tests across 19 files; the Business and Codex client contract suite passes 8 tests.
- Gate B pins Codex `0.145.0` and Business protocol v5, completes 13 deterministic provider requests, and passes all evidence for automatic grouping, canonical history, read-only protection, Project binding, Agent projection, approvals, media, QA, Deliverables, and cold-start recovery.
- macOS and Windows platform builds and official assets remain subject to this version's GitHub Actions run. Official Release assets must be built and verified by Actions.

**Full changes**: `v0.3.0` -> `v0.4.0`
