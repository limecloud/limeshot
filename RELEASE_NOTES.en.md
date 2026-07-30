## LimeShot v0.5.0

Release date: 2026-07-31

### Workspace desktop experience

- Adds a composable Workspace Chrome. Review, Terminal, Browser, Files, and Tasks can open in right or bottom panels and be switched, closed, or expanded without stacking every tool in the conversation sidebar.
- Runs Project terminals through Electron Main-managed `node-pty` sessions rooted in the managed Project workspace. Input, output, resize, exit, and close all cross typed IPC; the Renderer never starts a shell directly.
- Adds workspace-bounded Project file browsing, text/Markdown reading, and system reveal. Path traversal, oversized reads, binary content, and paths outside the workspace are rejected.
- Adds an Electron-managed `WebContentsView` Browser with HTTP(S)-only navigation, history, reload, title, and loading state. Popups, permissions, and arbitrary file protocols do not enter the Renderer.
- Adds an Environment menu that brings together the local Project, Git branch, changes, Side Tasks, Browser, and source entry points and routes each action to its owned Workspace surface.

### Conversations, models, and Review

- Adds native Codex model and reasoning-effort selection to the Composer. The catalog comes from `model/list`, updates use `thread/settings/update`, and final state comes from `thread/settings/updated`; neither the Renderer nor Rust business layer stores a second model state.
- Connects Composer file/folder references, audio, application-window captures, Plugins, Goal, and Plan mode to real Turns. Regular files are sent as Codex text references while images and audio keep their native upstream message parts, without exposing absolute local paths in the Renderer.
- Covers dynamic model catalogs, per-model efforts, loading/retry, read-only and active-Turn disablement, narrow-window containment, Escape, and outside close. An active upstream model remains visible even when absent from the non-hidden catalog.
- Rebuilds Review as an independent workspace with a large Diff surface and file tree beside the conversation. Timeline File Change rows and the toolbar changes action open the same owner instead of mixing Environment, Runtime, or business inspectors into Review.
- Keeps Conversation Timeline, Composer, Activity, and Workspace panels on Codex Thread / Turn / Item canonical projections without copying history or synthesizing terminal state from deltas.

### Product extensions and business boundaries

- Physically separates the Renderer core shell from Production business UI. Project, Profile, Brief, Plan, Execution, Artifact, and Deliverable surfaces now live in the statically trusted `production` extension workspace.
- Keeps the Extension Host limited to trusted extensions shipped with the app. This release does not introduce downloadable third-party code, a dynamic protocol, a permission sandbox, or a second business backend.
- Keeps Rust Business Service as the sole owner of Projects, business approvals, Tasks, Providers, Costs, Artifacts, Deliverables, and media execution. Codex App Server remains the sole Agent Runtime.
- Adds the LimeCore/AsterRouter cloud multi-model target architecture document, but that path remains Target and is not delivered by this release.

### Platform and packaging

- Adds `@xterm/xterm`, `@xterm/addon-fit`, and `node-pty`, preparing native PTY resources for the current Electron ABI during install, release builds, and Forge ASAR packaging.
- Limits `node-pty` `spawn-helper` permission preparation to macOS, where that helper is used. Linux quality runners no longer report a false missing-resource failure, while Windows continues to use packaged ConPTY/WinPTY resources.
- Continues macOS Apple Silicon DMG/ZIP and Windows x64 Squirrel Setup EXE/NuGet/`RELEASES` distribution, with official assets built only by GitHub Actions.
- Continues to pin official OpenAI Codex `0.145.0` on both platforms and verifies the archive, executable, version output, and packaged companion binaries.
- Publishes only after quality gates, native macOS/Windows Gate B runs, and all packaged assets succeed, then generates a unified `SHA256SUMS.txt`.

### Current scope

- This release does not deliver cloud routing for Claude, Gemini, Grok, Kimi, or DeepSeek. The Composer displays the real model catalog returned by the current Codex Provider.
- Browser is a controlled desktop surface, not a general automation or remote-browser service. Files is currently read-only and is not an editor or arbitrary filesystem entry point.
- macOS uses ad-hoc signing and is not Developer ID signed or Apple-notarized. Windows Squirrel assets remain unsigned when repository signing secrets are unavailable.
- Redistributable FFmpeg/FFprobe runtimes are not yet packaged, and remote image, video, and voice Providers are not configured for production.

### Release verification

- The local candidate must pass version, resource, type, protocol, full Vitest, Rust workspace, Electron release build, and real Electron Gate B checks.
- Gate B must prove model settings, Composer file/media/Plugin/Goal/Plan mode capabilities, Workspace panels, Review/Production ownership, Codex/Rust child processes, dynamic tools, history recovery, and business terminal states remain on the same real Electron path.
- macOS/Windows builds, native PTY behavior, and official assets are verified by this release's GitHub Actions run. Local packages are not uploaded as Release assets.

**Full changes**: `v0.4.0` -> `v0.5.0`
