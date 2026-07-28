## LimeShot v0.1.0

Release date: 2026-07-28

Simplified Chinese release notes are the primary version.

### First usable release

- Introduces a conversation-first Electron desktop workspace with General, Short-form, Redraw, Talking, and Commerce production modes.
- Electron Main directly supervises a pinned official Codex App Server, while the Rust Business Service owns Project, Brief, Plan, Approval, and business tools over JSON-RPC 2.0.
- Supports managed project creation, streaming conversations, history recovery, business tool calls, production plan generation, and user approval.
- Includes LimeShot Skills, the business tool catalog, Artifact contracts, Provider capability declarations, and media service declarations.

### Fixes

- New Project now creates a managed workspace and opens the conversation directly instead of showing a system directory picker.
- Fixed binding collisions when multiple projects use the default `main` conversation name.
- Fixed cold-start recovery for Codex Threads that were not materialized before their first user message.
- Fixed development previews requiring a manually configured `LIMESHOT_CODEX_BIN` before conversations could start.
- Internal Electron IPC and process-path errors are no longer exposed in the user interface.

### Testing and quality

- A real Electron Gate B covers preload/IPC, the Codex child, the Rust child, Project binding, Turns, tool routing, plan approval, and history recovery.
- Protocol, Artifact schema, Rust workspace, React GUI, and managed workspace behavior have automated regression coverage.
- Production contains no Tauri runtime, reimplemented Agent runtime, Renderer mock fallback, or system PATH runtime fallback.

### Current scope

- This release provides a macOS Apple Silicon build.
- The app has a complete ad-hoc signature but is not yet Developer ID signed or Apple-notarized; first launch requires confirmation in macOS Privacy & Security.
- Node, FFmpeg/FFprobe, and production media Providers are not available yet; those capabilities remain fail-closed.
- Codex account login UI, upstream native tool approvals, and the complete settings experience will arrive in later releases.

**Full changes**: `Initial commit` -> `v0.1.0`
