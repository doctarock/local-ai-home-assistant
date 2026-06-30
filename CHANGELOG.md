# Changelog

## 2026-06-30 1.5.0

### Added
- Added harness evaluation system that tracks worker health signals (hidden tool violations, inspection-heavy passes, stalled completion) and embeds a harness health summary and resume guidance into task resume context and escalation review.
- Added profiles system (`nova-observer/profiles/`) for profile-based plugin, brain, tool, and UI configuration with a `default` profile shipped out of the box.
- Added voice identity grace period: after a verified voice identity is confirmed, it persists for a configurable window (default 5 minutes) without requiring re-identification on every command.
- Added voice-based UI lock with configurable session inactivity timeout (`OBSERVER_UI_LOCK_INACTIVITY_MS`), a server unlock token (`OBSERVER_SERVER_UNLOCK_TOKEN`), and automatic lock/unlock tied to voice profile presence.
- Added `listRecordedTaskIds` to the flight recorder service for browsing task histories sorted by recency.
- Added `providerHistory` and `hookTrace` to the flight recorder resume context so workers resuming a task see LLM call history and hook activity alongside tool steps and transactions.
- Added `harness:check` npm script (`node ./run-harness-checks.js`) for pre-flight harness integrity checks.
- Added `phoneSources` trust registry and `phoneNumbers` field on individual trust contacts.
- Added voice navigation commands for tab and panel switching and scroll control.
- Added brain tool workout tab to developer tools.
- Added `quietMode` config option to suppress idle status updates.
- Added regression and unit coverage for harness gate self-audit, execution runner logic, escalation review, failure domain, worker prompting, worker tools, admin security, runtime support, task execution support, and intake routing.

### Changed
- Improved worker prompting with focused context compaction (line and total character limits), concrete tool envelope examples keyed to the worker's visible tool set, and tighter tool selection guidance for hidden-tool violations and inspection-heavy loops.
- Improved escalation review to include a compact harness eval snapshot with health status, behavioral signals, tool selection confidence, and hidden-tool violation counts.
- Expanded flight recorder to capture provider history and hook traces; harness health status and resume guidance are now included in the context summary passed to resumed workers.
- Simplified default brain roster, endpoints, and assignments — removed legacy LAN/laptop endpoint entries; local-only configuration ships as the default.
- Improved developer tools flight recorder tab with broader packet type coverage.

### Fixed
- Fixed `uniquePaths` variable hoisting in flight recorder resume context so it is calculated before the conditional that uses it.
- Fixed worker tool handling for `summarize` pseudo-tool calls so they produce a non-fatal handoff result instead of an unhandled error.

## 2026-06-04 1.4.0

### Added
- Added a sandbox state store so prompt memory, personal files, and agent workspace state can be read and written through the live Nova sandbox volume.
- Added a State Lens manifest with grouped sandbox, boundary, queue, runtime, config, and public UI inspection scopes.
- Added state-browser file deletion with admin-token protection and container/host file handling.
- Added voice extension events for recognition configuration, listening lifecycle, voice toggles, transcript handling, and pre-submit request transformation.
- Added intake request hooks so plugins can observe or reshape triage and agent-run submissions before routing.
- Added phone-number trust records alongside email and voice trust identity.
- Added regression coverage for sandbox inspect path resolution, failed project-work attempt counting, and Ollama queue-lane concurrency.

### Changed
- Renamed the observer package, sandbox runtime identity, paths, users, prompts, regression fixtures, and UI storage keys from OpenClaw to Nova.
- Simplified the Docker image to provision the Nova runtime user and Playwright without installing or patching the previous OpenClaw runtime.
- Moved prompt-state persistence to the authoritative sandbox volume for memory, dreaming, session-memory, and prompt workspace operations.
- Expanded the developer-tools state browser to load scopes from the server manifest and browse live sandbox prompt files, memory, projects, skills, input, and output.
- Improved voice capture so source identity is tied to transcript segments and submission metadata is preserved for queued voice requests.
- Improved provider runtime scheduling so CPU and GPU Ollama lanes sharing a base URL can run independently while same-lane GPU calls stay serialized.
- Reduced task heartbeat/orphan timing and intake lease waits to make stalled work detection more responsive.

### Fixed
- Prevented sandbox inspection path resolution from escaping the selected inspect root.
- Prevented quiet-mode idle scan and cleanup reports from surfacing as normal assistant updates.
- Fixed admin-only task reshape reset calls to use the configured admin fetch path.
- Updated low-signal completion detection, tool-loop repair, and worker prompting to recognize Nova sandbox paths and skill-library naming.

## 2026-05-20 1.3.0

### Added
- Added modular Observer browser bundles for config, plugins, regressions, secrets, speech, and state browsing.
- Added Agent Skills (Claude skills wrapper) support with API routes, Capabilities UI, worker tools, and prompt guidance for running local model skills through Dogpile (https://github.com/bubstack/dogpile).
- Added first-party Dreaming, Session Memory, and Task Lifecycle plugins.
- Added plugin runtime services for prompt review, task lifecycle access, plugin tool catalogs, and queue/intake lifecycle hooks.
- Added OpenAI-compatible provider support alongside Ollama runtime handling, including provider endpoint normalization and chat completions coverage.
- Added installation notes in `docs/INSTALLATION.md`.
- Added regression and unit coverage for native conversational responses, todo clarification, provider routing, and project-cycle prompt boundaries.

### Changed
- Split large server and runtime files into focused services for admin security, config loading, Ollama runtime, task lifecycle, workspace file helpers, state reset, and runtime accessors.
- Improved native/direct replies for greetings, thanks, knock-knock jokes, casual wellbeing prompts, help requests, and incomplete todo-add requests.
- Improved worker prompting with Agent Skills guidance, more precise `internalJobType` handling, and tighter tool selection for recreation and project-cycle work.
- Improved plugin system internals with richer capability/hook metadata, material hook tracing, and developer-tools panel updates.
- Updated the Observer UI styling toward a darker glass-style theme and moved voice status controls into the composer area.
- Simplified the default observer config by removing old LAN/laptop endpoints and switching the default worker model to `qwen3:14b`.

### Fixed
- Prevented incidental `PROJECT-TODO.md` mentions in non-project tasks from triggering project-cycle worker instructions.
- Fixed recreation jobs so they only complete successfully after daily personal notes are actually updated.
- Fixed todo-add handling so requests missing the item text ask for clarification instead of falling through to summary behavior.
- Fixed provider runtime behavior so OpenAI-compatible brains use `/chat/completions` instead of Ollama generate endpoints.

## 2026-05-06 1.2.1

### Added
- Added task Flight Recorder diagnostics for provider history, tool steps, read basis, transactions, and hook traces.
- Added workspace transaction records for worker file writes, edits, moves, and selected external side effects.
- Added transaction approval, rejection, rollback, and debug packet API routes for task inspection.
- Added regression coverage for transaction approval/apply behavior, stale read-basis protection, rollback, flight recorder packets, and architecture boundaries.
- Added `observer/package.json` release metadata and npm scripts for observer startup and regression runs.

### Changed
- Improved worker resume context with prior tool steps, applied transactions, and read-basis summaries.
- Improved project status responses to match specific project names from the user message.
- Improved task event sequencing for live observer event ordering.
- Improved developer tools with a Flight Recorder tab for inspecting task execution state.

### Fixed
- Prevented high-risk sandbox writes, edits, and moves from mutating files before approval.
- Prevented approved writes from applying over files changed after the transaction proposal.
- Fixed move transaction rollback so source files and overwritten destinations are restored correctly.
- Fixed external transaction approval so non-sandbox side effects are approved without being forced through sandbox apply.
- Fixed Flight Recorder UI encoding artifacts.

## 2026-04-29 1.2.0

### Added
- Added Home Assistant / IoT support with secure instance registry and token handling.
- Added worker tool integrations for IoT device listing, state queries, and Home Assistant service calls.
- Added voice invitation flow for waiting tasks, including yes/acknowledge acceptance and question time support.
- Added avatar scene addon extension points for custom visual effects and runtime integrations.
- Added runtime plugin lifecycle hook telemetry for queue and worker execution events.
- Added IoT/Home Assistant secret catalog support to `Secrets` UI via OS keychain handles.
- Updated README to document the new IoT feature set and secrets improvements.

### Changed
- Improved `Secrets` management documentation to include IoT token storage.
- Extended `Secrets` tab and plugin lifecycle description in the README.
