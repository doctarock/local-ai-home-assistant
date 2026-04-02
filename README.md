![Preview](https://repository-images.githubusercontent.com/1188661951/fd2bd3dd-5d6e-489e-9259-59c827988f06)

A host-side orchestration application that combines:
- A web control panel
- Multi-brain LLM routing and execution
- A persistent task queue
- Calendar, mail, finance, and project-cycle automation
- Secure sandboxed tool execution in Docker
- Retrieval and document intelligence (Qdrant-backed)

It is designed to run continuously as an autonomous or semi-autonomous operator while still allowing direct user supervision.

## 2. Core User-Facing Features

### 2.1 Main UI and Control Surface

The web UI includes dedicated tabs for:
- `Nova` (identity, trust, environment, props, recreation, questions)
- `Calendar`
- `Mail`
- `Projects`
- `Queue`
- `Jobs` (cron/schedules/history)
- `Gateway` (runtime health and logs)
- `Prompts` (live prompt previews)
- `Brains` (models, endpoints, routing)
- `Secrets`
- `Tools` (tool/skill approvals and request tracking)
- `State` (file/tree inspector and reset tools)
- `Tests` (regression suite runner + command helper)

### 2.2 Conversational Intake and Routing

The system supports:
- Direct run (`/api/agent/run`)
- Triage-first route selection (`/api/tasks/triage`)
- Queue handoff for deeper worker execution
- Observer-native immediate responses for common requests (time/date/status-style prompts)
- Prompt rewrite assistance using idle helper brains
- Optional worker preflight for ambiguity checks and clarification

### 2.3 Queue and Task Lifecycle

Queue functionality includes:
- Enqueueing, dispatching, removing, aborting, and answering tasks
- Task event stream and per-task history retrieval
- Waiting-for-user task handling and resume flow
- Deduplication of recently queued tasks
- Repair/follow-up monitor views
- Reshape issue tracking and reset workflow
- Queue pause/resume controls

### 2.4 Calendar and To-Do

Calendar functionality:
- Event create/update/delete
- Event state transitions (`active`, `completed`, `cancelled`)
- Repeat scheduling (`daily`, `weekly`, `monthly`, `yearly`)
- Optional Nova action payloads when events become due

To-do functionality:
- CRUD-like flow (`add`, `state update`, `remove`)
- Shared backlog for user and Nova
- Session-aware status updates

### 2.5 Mail Operations

Mail capabilities include:
- IMAP polling and inbox status
- SMTP sending
- Move operations (trash/archive, by id/uid/filters/latest)
- Optional unsure-email summary toggles
- Mail trust assessment and command gating by source trust level
- Mail-watch rule workflow for automated handling and user escalation on uncertain messages

### 2.6 Finance Tracking

Finance features include:
- Finance entry listing/creation/update/deletion
- Manual entries (income/expense, status, category, amounts, currency, timestamp)
- Sync from recent mail to derive finance entries
- Tracker summary metrics (tracked/paid/unpaid/net)
- Financial-year style review views

### 2.7 Projects and Pipeline Visibility

Project-cycle features include:
- Project config and system state management
- Workspace project introspection and policy-driven handling
- Checklist operations (remove item, add/remove role)
- Pipeline list and pipeline trace endpoints
- Role/playbook-aware planning and phase/workstream assessment
- Project-cycle retry/recovery shaping and escalation-aware handoff logic
- Completed project visibility after rotation/export

### 2.8 Runtime and State Inspection

Operational inspection includes:
- Runtime status (brains, endpoint health, GPU, Qdrant, activity)
- Runtime options/config snapshots
- SSE logs and observer event streaming
- File tree and file content inspection across scopes (`workspace`, `queue`, `runtime`, etc.)
- Output file listing and download
- Guided internal reset for simple-project state

### 2.9 Voice Interface and Trust

Voice functionality includes:
- Browser speech synthesis and recognition integration
- Passive listening toggle flow
- Voice fingerprint capture and matching
- Threshold-based trust profile matching
- Command allow/block decisions using configured minimum voice trust level
- Persisted trust records that unify email and voice identity concepts

### 2.10 3D Avatar and Visual Stage

Avatar system includes:
- Three.js rendering with GLTF model support
- Emotion-to-animation mapping and talking clip rotation
- Stylization presets/effects (post-processing pipeline)
- Configurable room textures/backgrounds
- Configurable prop slots and model placement

## 3. Automation and Background Intelligence

### 3.1 Internal Periodic Jobs

The system maintains internal queue-backed recurring jobs for:
- Opportunity scanning
- Prompt memory question maintenance
- Mail-watch sweeps
- Recreation/free-time cycles

### 3.2 Opportunity and Maintenance Systems

Background logic includes:
- Idle-time workspace opportunity generation
- Helper-scout work-package generation
- Queue maintenance snapshots and reshape follow-up planning
- Automatic skip/backoff behavior based on activity, backlog, and lane capacity

### 3.3 Recreation Cycle

The recreation subsystem:
- Queues non-deliverable free-time reflection tasks
- Encourages self-directed browsing/thinking/writing
- Validates that personal-note output is actually persisted

## 4. Retrieval and Document Intelligence

Retrieval domain capabilities:
- Qdrant collection lifecycle and health usage
- Workspace document scanning and normalization
- Content chunking with overlap controls
- Embedding-based indexing and query
- Filtered search (workspace/root/document/source)
- Document overview/search summaries surfaced through observer-native tooling

## 5. Tooling, Skills, and Approvals

### 5.1 Tool Catalog and Governance

Tool governance includes:
- Unified catalog across intake and worker scopes
- Risk classification (`normal`, `medium`, `high`, `approval`)
- Per-tool autonomous approval flags
- Persistent tool registry state

### 5.2 Capability Request Tracking

The system records unmet capability demand:
- Missing tool requests
- Skill installation requests
- Aggregation and status tracking for open/resolved requests

### 5.3 Skill Library Integration

Skill features include:
- Search and inspect via clawhub inside sandbox context
- Install into sandbox workspace
- Approved-skill gating before operational usage
- Installed skill inventory and metadata

## 7. Security and Isolation Model

### 7.1 Sandbox Model

Tool execution is isolated in a Docker container with:
- Read-only root filesystem
- Dropped Linux capabilities (`--cap-drop ALL`)
- `no-new-privileges`
- PID/memory/CPU limits
- Dedicated writable mounts only for allowed input/output/state paths

### 7.2 Secrets Management

Secrets are managed via OS keychain (`keytar`) with handles for:
- Mail agent passwords
- WordPress shared secrets
- Retrieval/Qdrant API key
- Custom handles

### 7.3 Trust Controls

Trust system supports:
- Source trust levels (`unknown`, `known`, `trusted`)
- Email command minimum trust policy
- Voice command minimum trust policy
- Unified trust records with optional voice signature thresholds

## 8. API Surface Summary (Grouped)

Primary route groups:
- Runtime: `/api/runtime/*`, `/events/*`
- Intake/run: `/api/agent/run`, `/api/tasks/triage`, `/api/prompts/review`
- Queue/tasks: `/api/tasks/*`, `/api/queue/control`
- Cron/jobs: `/api/cron/*`
- Calendar/mail/todo: `/api/calendar/*`, `/api/mail/*`, `/api/finance/*`, `/api/todos/*`
- Config/control: `/api/app/config`, `/api/brains/config`, `/api/projects/*`, `/api/tools/config`, `/api/secrets/*`
- Inspection/output/regressions: `/api/inspect/*`, `/api/output/*`, `/api/regressions/*`

## 9. Testing and Quality Features

Regression support includes:
- Built-in suite definitions for intake, planner, worker, and related flows
- UI-triggered regression execution
- Latest persisted report retrieval
- Generated command-line helper for external run parity (`run-regressions.js`)

## 10. Runtime Dependencies and Deployment Shape

Expected runtime stack:
- Host Node.js observer process (`node server.js`)
- Ollama endpoint(s) for model execution
- Docker sandbox container for tool execution
- Qdrant for retrieval/search storage

## 11. Feature Positioning Snapshot

In practical terms, this application is:
- A local AI operations console
- A queue-first autonomous worker coordinator
- A personal operations layer (mail/calendar/todo)
- A project-cycle automation engine
- A safety-conscious sandboxed tool runtime

# Handoff

This repo no longer runs as an OpenClaw gateway stack, only the skill library remains integrated. The live system is a host-side Node observer with a Docker sandbox for LLM-controlled tools, plus Ollama for model execution.

Special note on security, the environment described is inherently secure, however, the interface is not currently suitable for open web facing.

The accuracy on the voice security is dubious. There is no spoofing protection on email trust. Use these features carefully, run this on a local envirnonment, you have been warned.

Trust settings are under the Nova tab, I do not currently have a walk through for the interface, my apologies.

## Current Setup

- Repo root: `e:\AI\claw`
- Observer app: `openclaw-observer`
- Observer URL: `http://127.0.0.1:3220/`
- Observer server entry: `openclaw-observer/server.js`
- Observer config: `openclaw-observer/observer.config.json`
- Observer runtime root: `openclaw-observer/.observer-runtime`
- User-facing output folder: `e:\AI\claw\observer-output`

## Runtime Shape

The observer process runs directly on the host:

- launch command: `node server.js`
- working directory: `\workspace\`
- it owns:
  - the web UI
  - the scheduler
  - the queue
  - mail polling/sending
  - document indexing
  - task orchestration

The LLM does not get host shell access directly. Tool execution is isolated in Docker.

## Docker Sandbox

The LLM tool sandbox is the important security boundary.

- container name: `\observer-sandbox`
- image name: `openclaw-safe`
- named volume: `\observer-sandbox-state`
- container home: `/home/openclaw`
- internal working workspace: `/home/openclaw/.observer-sandbox/workspace`
- host output export mount: `/home/openclaw/observer-output`

The observer creates this container automatically on startup if needed.

### Tool install requirements

When adding or restoring a built-in tool for Nova, treat it as a runtime feature, not just a code change.

Required checks:

- if the tool shells out to a system command, that command must exist inside the `openclaw-safe` image, not just on the host
- if the tool depends on a language runtime, library, or binary, install that dependency in `Dockerfile`
- keep the tool name in code, prompts, and diagnostics aligned with the real callable name
- make sure the tool is present in the observer tool catalog so the worker prompt and approval state can expose it
- rebuild `openclaw-safe` after changing runtime dependencies
- replace or recreate `observer-sandbox` so the live observer stops using the old image
- verify the dependency inside the running sandbox with `docker exec observer-sandbox sh -lc "command -v <tool>"`
- verify the tool path end-to-end with one real sandboxed call before trusting overnight autonomy

Recent example:

- `unzip` existed in `server.js`, but the sandbox image did not contain `/usr/bin/unzip`
- result: Nova could see unzip-related work in project input, but runtime execution failed or drifted into bogus capability/missing-tool conclusions
- fix: install `zip` and `unzip` in `Dockerfile`, rebuild `openclaw-safe`, and let the observer recreate `observer-sandbox`

### Sandbox flags

The container is started with:

- `--read-only`
- `--cap-drop ALL`
- `--security-opt no-new-privileges`
- `--pids-limit 200`
- `--memory 2g`
- `--cpus 2.0`
- `--tmpfs /tmp`

Current caveat:

- the sandbox is expected to run as the non-root `openclaw` user
- on startup, the observer may launch a short host-managed bootstrap container as root only to repair ownership inside the named state volume, then it starts the actual AI sandbox as `openclaw`
- the AI-controlled sandbox still remains constrained by the read-only filesystem, dropped capabilities, no-new-privileges, tmpfs `/tmp`, and restricted mounts

### Sandbox mounts

The live sandbox is allowed to access exactly three locations:

- writable input share:
  - `e:\AI\claw\observer-input` -> `/home/openclaw/observer-input`
- writable sandbox workspace:
  - Docker named volume `observer-sandbox-state` -> `/home/openclaw/.observer-sandbox/workspace`
- writable output share:
  - `e:\AI\claw\observer-output` -> `/home/openclaw/observer-output`

No other host bind mounts are allowed into the Nova runtime sandbox.

Persistent internal sandbox state lives in the named Docker volume, not in the host repo.

### Security model

This is the intended design:

- Nova can read and write only within `observer-input`, the sandbox workspace, and `observer-output`
- Nova should not have arbitrary host filesystem write access
- Nova should not have host shell access

This is why the sandbox exists at all. Do not break the observer back out into direct host file/shell tooling.

## Docker and Ollama Containers

Containers that should normally exist:

- `observer-sandbox`
- `ollama`
- `qdrant`

There is no longer a long-lived `openclaw-gw` gateway container in the current design.

## Models and Brains

Enabled brains in `observer.config.json`:

- `intake`
  - label: `CPU Intake`
  - model: `qwen2.5:1.5b`
  - role: user conversation, direct replies, local planning
- `worker`
  - label: `Qwen Worker`
  - model: `qwen3.5:latest`
  - role: queued tool-using work

Defined but currently disabled:

- `helper`
  - label: `Shadow Helper`
  - model: `gemma3:1b`
  - intended role: speculative pre-triage / summarization sidecar

## Mail

Mail is handled by the observer process, not by Dockerized OpenClaw.

- IMAP host: `mail.example.net.au`
- SMTP host: `mail.example.net.au`
- active mailbox: `nova@example.net.au`

The observer currently supports:

- inbox polling
- sending mail
- archive/trash moves
- native spam/phishing heuristics
- recurring mail-watch jobs

## Queue and Scheduler

The queue is local to this observer and stored under:

- `openclaw-observer/.observer-runtime/observer-task-queue`

Task folders:

- `inbox`
- `in_progress`
- `done`
- `closed`

There is no external cron service. Periodic work is implemented as self-perpetuating queued tasks.

Examples of internal recurring jobs:

- idle opportunity scan
- cleanup sweep
- mail watch

## Prompt and Memory Files

Editable prompt/memory files on the host:

- `openclaw-observer/workspace-prompt-edit/AGENTS.md`
- `openclaw-observer/workspace-prompt-edit/TOOLS.md`
- `openclaw-observer/workspace-prompt-edit/SOUL.md`
- `openclaw-observer/workspace-prompt-edit/USER.md`
- `openclaw-observer/workspace-prompt-edit/MEMORY.md`
- `openclaw-observer/workspace-prompt-edit/PERSONAL.md`
- `openclaw-observer/workspace-prompt-edit/memory/...`

These are copied into the sandbox workspace as seed content.

## Important Paths

Host side:

- repo root: `e:\AI\claw`
- observer app: `e:\AI\claw\openclaw-observer`
- output folder: `e:\AI\claw\observer-output`
- runtime state: `e:\AI\claw\openclaw-observer\.observer-runtime`

Sandbox side:

- workspace: `/home/openclaw/.observer-sandbox/workspace`
- input: `/home/openclaw/observer-input`
- output: `/home/openclaw/observer-output`

## Goal

Replicate the current observer architecture on your current environment, not the older OpenClaw gateway stack.

That means:

- host-side Node observer
- Docker sandbox for tool execution
- Ollama for models
- host-side `observer-output`
- local runtime state under `.observer-runtime`

## Priorities

1. Get Docker Desktop working with WSL2.
2. Get Ollama working locally.
3. Clone/copy this repo to the laptop.
4. Build the sandbox image.
5. Start Qdrant.
6. Start the observer.
7. Verify the sandbox and mounts before enabling real work.

## Recommended Bring-Up

```powershell
docker version
docker info
wsl --status
```

Build the sandbox image from the repo root:

```powershell
docker build -t openclaw-safe .
```

Then start Qdrant and the observer from:

```powershell
cd e:\AI\claw
docker compose up -d qdrant

$env:QDRANT_URL="http://127.0.0.1:6333"
cd e:\AI\claw\openclaw-observer
node server.js
```

Then verify:

- `http://127.0.0.1:3220/api/runtime/status`
- `http://127.0.0.1:3220/api/runtime/options`
- sandbox container exists
- Ollama is reachable
- Qdrant is reachable at `http://127.0.0.1:6333/collections`

## What Must Be Updated

- host paths in `openclaw-observer/observer.config.json`
- any machine-specific mail secrets if they differ

Do not blindly migrate:

- old OpenClaw gateway state
- old `openclaw_state` assumptions
- old port `3210`
- old `openclaw-gw` container expectations

## What To Preserve

- observer UI
- Nova avatar and voice flow
- queue-driven work model
- Docker sandbox isolation
- host-backed `observer-output`
- host-backed `observer-input`
- prompt and memory scaffolding
- local mail handling

