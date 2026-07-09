# Observer Server API Reference

## 1. Overview

The Observer server is a single Express 4 (ESM) application defined in
[`nova-observer/server.js`](../nova-observer/server.js), which composes route
modules from `nova-observer/server/*.js` via `composeObserverServer()`
(`nova-observer/server/observer-server-composition.js`). There is no separate
client/backend split: the browser UI in `nova-observer/public/` is static
assets served by the same process, and calls back into the routes documented
below.

There is no OpenAPI/Swagger spec — this document is generated from the route
handlers directly. See also [PLUGIN-SYSTEM.md](PLUGIN-SYSTEM.md) for the
plugin route convention and [INSTALLATION.md](INSTALLATION.md) for the full
environment variable reference.

Default port: `3220` (override with `PORT`). All paths below are relative to
the server root, e.g. `http://127.0.0.1:3220`.

## 2. Auth model

Defined in `nova-observer/server/observer-admin-security.js`, wired globally
via `registerAdminSecurityMiddleware(app)`.

There are two independent gates:

1. **Admin token.** Requests must originate from loopback (`127.0.0.1`/`::1`)
   or a trusted local `Origin`/`Referer`, and send header `x-admin-token`
   matching a random 24-byte hex token minted at process start. Fetch it via
   `GET /api/admin-token` (itself only checks trusted-origin), then send it on
   every subsequent gated request.
2. **Voice-gated UI unlock.** If at least one voice trust profile is
   enrolled, the UI session starts "locked" until unlocked via trusted voice
   (`POST /api/security/unlock`) or a recovery ticket
   (`POST /api/security/server-unlock` → `POST /api/security/claim-server-unlock`).
   Sessions auto-relock after `OBSERVER_UI_LOCK_INACTIVITY_MS` (default 30
   min) of inactivity. With no voice profile enrolled, the UI is always
   unlocked.

**Where the gates apply:**

- `/api/plugins/*` — all routes require the unlocked-admin gate, except
  `GET /api/plugins/list` (admin token only, no unlock needed).
- A fixed list of mutating routes requires the unlocked-admin gate:
  `POST /api/tasks/triage`, `POST /api/agent/run`, `POST /api/tasks/enqueue`,
  `POST /api/tasks/dispatch-next`, `POST /api/tasks/remove`,
  `POST /api/tasks/abort`, `POST /api/tasks/answer`,
  `POST /api/tasks/reshape-issues/reset`, `DELETE /api/inspect/file`,
  `POST /api/state/reset-simple-project`, `POST /api/regressions/run`,
  `POST /api/app/config`, `POST /api/brains/config`.
- `DELETE /api/inspect/file` and `POST /api/state/reset-simple-project` also
  perform their own inline `x-admin-token` check (same token, belt-and-braces).
- A sliding-window rate limiter applies to intake POSTs
  (`/api/tasks/triage`, `/api/agent/run`, `/api/tasks/enqueue`): default 40
  requests / 60s (`OBSERVER_INTAKE_RATE_LIMIT_MAX` /
  `OBSERVER_INTAKE_RATE_LIMIT_WINDOW_MS`), returns `429` with a `Retry-After`
  header when exceeded.
- **Everything else has no gate** — e.g. `GET /api/tasks/list`,
  `POST /api/cron/add`, `POST /api/secrets`, all `/api/iot/*`, all
  `/api/agent-skills/*`. This is intentional for a loopback-only local tool
  but means the server is **not safe to expose on an open network** without
  adding your own reverse-proxy auth in front of it.
- `/api/plugin-ui/*.js` (plugin tab JS bundles) is intentionally public so
  the browser can `import()` it without sending admin headers.

## 3. Real-time transport

There is no WebSocket/socket.io server. Live updates use Server-Sent Events,
consumed client-side with `EventSource`:

| Path | Purpose |
|---|---|
| `GET /events/logs` | Streams raw server log lines: `data: {ts, line}` per event; first line is `[observer] connected`. |
| `GET /events/observer` | Streams structured observer events: `data: {ts, type, ...}` (e.g. `intake.request_queued`). |

## 4. Runtime & bootstrap — `server/runtime-domain.js`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/runtime/status` | none | Live health snapshot (45s cache). `200 {ok, gateway, intake, worker, ollama, qdrant, ollamaEndpoints[], brains[], brainActivity, gpu, checkedAt}` / `500`. |
| GET | `/api/runtime/options` | none | Bootstrap config bundle for the UI. `200 {ok:true, app, profile, language, lexicon, defaults, queue, projects, routing, networks, mail, brains[], brainEndpoints[], mounts[]}`. |
| POST | `/api/queue/control` | unlocked admin | Pause/resume dispatch. Body `{paused: boolean}`. `200 {ok:true, queue, message}` / `500`. |

## 5. Intake & agent turns — `server/intake-routing-domain.js`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/tasks/triage` | unlocked admin + rate limited | Runs intake analysis and decides direct-reply vs. task plan, **without** enqueuing. Body: `message` (required), `sessionId`, `intakeBrainId`, `internetEnabled`, `forceToolUse`, `sourceIdentity`, `metadata`. `200 {ok:true, triage:{mode, brainId, replyText, plannedTasks, ...}}`; `400` if `message` missing; `500` on error. |
| POST | `/api/agent/run` | unlocked admin + rate limited | Full conversational turn: intake → native reply or enqueue → agent-style response. Body: `message` (required), `sessionId`, `brainId`, `preset`, `internetEnabled`, `forceToolUse`, `requireWorkerPreflight`, `attachments[]`, `sourceIdentity`, `metadata`. `200 {ok:true, code:0, preset, brain, parsed:{status, result:{payloads[], meta}}, stdout, tasks?, rewrite, effectiveMessage}`; `400 {error:"message is required"}` (no `ok` field); `500 {ok:false, error}`. |

## 6. Task queue — `server/queue-engine-domain.js`

Mutating routes (`enqueue`, `dispatch-next`, `remove`, `abort`, `answer`,
`reshape-issues/reset`) require the unlocked-admin gate; everything else in
this table is unauthenticated.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/tasks/list` | `200 {ok, root, queued, inProgress, done, failed, repairMonitor}`. |
| GET | `/api/tasks/events?sinceTs&limit` | Poll for new task events. `200 {ok, tasks}`. |
| GET | `/api/tasks/history?taskId&limit` | `200 {ok, taskId, task, history}`. |
| GET | `/api/tasks/transactions` | List task transactions. |
| GET | `/api/tasks/debug-packet` | Debug bundle for support/troubleshooting. |
| GET | `/api/tasks/provider-history/validate` | Validates provider history integrity. |
| POST | `/api/tasks/transactions/:transactionId/rollback` | Roll back a transaction. |
| POST | `/api/tasks/transactions/:transactionId/approve` | Approve a pending transaction. |
| POST | `/api/tasks/transactions/:transactionId/reject` | Reject a pending transaction. |
| GET | `/api/tasks/reshape-issues` | List reshape issues. |
| POST | `/api/tasks/reshape-issues/reset` | Clear reshape issues. |
| POST | `/api/tasks/enqueue` | Primary task-creation route. Body: `message` (required, ≤8000 chars), `sessionId`, `requestedBrainId`, `intakeBrainId`, `internetEnabled`, `forceToolUse`, `requireWorkerPreflight`, `attachments[]` (≤20), `plannedTasks[]` (≤50), `intakeReviewed`, `lockRequestedBrain`, `sourceIdentity`, `helperAnalysis`. `200 {ok:true, task, tasks[], deduped}`; `409 {ok:false, code:"intake_resolved"|"intake_not_enqueue", triage}` if intake diverts it instead of enqueuing; `400`/`500` otherwise. |
| POST | `/api/tasks/dispatch-next` | Force-dispatch the next queued task. |
| POST | `/api/tasks/remove` | Remove a task; `409`-style `task_in_progress` guard if it's actively running. |
| POST | `/api/tasks/abort` | Abort an in-progress task. |
| GET | `/api/tasks/dead` | List failed/dead-letter tasks. |
| POST | `/api/tasks/dead/requeue` | Requeue a dead-letter task. |
| POST | `/api/tasks/answer` | Answer a task waiting on user input. Body `{taskId, answer, sessionId}`. |

## 7. Worker execution, inspection & output — `server/worker-execution-domain.js`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/inspect/manifest` | none | List inspectable scopes. |
| GET | `/api/inspect/tree?scope` | none | File tree for a scope. |
| GET | `/api/inspect/file?scope&file` | none | `200 {ok, content, relocated, ...}`. |
| DELETE | `/api/inspect/file?scope&file` | unlocked admin + inline `x-admin-token` | Delete a file; `403` on token mismatch. |
| POST | `/api/state/reset-simple-project` | unlocked admin + inline `x-admin-token` | Reset simple-project state. |
| GET | `/api/output/list` | none | List worker output files. |
| GET | `/api/output/file` | none | Streams a file (`Content-Disposition: attachment`). |
| GET | `/api/regressions/list` | none | List regression suites. |
| GET | `/api/regressions/latest` | none | Latest regression run results. |
| POST | `/api/regressions/run` | unlocked admin | Body `{suiteId}`. Runs a regression suite. |

## 8. Config — `server/observer-config-domain.js`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET / POST | `/api/app/config` | POST: unlocked admin | Avatar/persona/trust settings. |
| GET / POST | `/api/brains/config` | POST: unlocked admin | Brain/endpoint/routing/queue config. |
| GET / POST | `/api/tools/config` | none | Tool approval config. |
| GET | `/api/secrets/status?handle` | none | Whether a secret is set (never returns the value). |
| GET | `/api/secrets/catalog` | none | Known secret handles. |
| POST | `/api/secrets` | **none** | Body `{handle, value}` — sets a secret (keytar/OS-keychain backed). |
| DELETE | `/api/secrets` | **none** | `{handle}` from body or query. |

## 9. Cron / scheduled jobs — `server/cron-domain.js`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cron/list` | List scheduled job series. |
| GET | `/api/cron/events?sinceTs&limit` | Poll cron run events. |
| POST | `/api/cron/add` | Body `{name, every ("5m"/"2h"/"1d"), message}` — creates a queue-backed recurring task series. |
| POST | `/api/cron/toggle` | Body `{seriesId}` — enable/disable a series. |
| POST | `/api/cron/remove` | Body `{seriesId}`; `200 {ok:false, code:"job_in_progress"}` if a run is currently active. |

None of these routes are auth-gated.

## 10. Admin / security — `server/observer-admin-security.js`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin-token` | trusted origin only | Bootstraps the admin token. |
| GET | `/api/security/session` | none | Lock/unlock status. |
| POST | `/api/security/unlock` | none | Body `{sourceIdentity:{kind:"voice", trustLevel:"trusted"}}`. |
| POST | `/api/security/relock` | none | Force session relock. |
| POST | `/api/security/server-unlock` | loopback only + `x-observer-server-unlock` header or `{token}` body matching `OBSERVER_SERVER_UNLOCK_TOKEN` | Mints a 5-minute recovery-unlock ticket. |
| POST | `/api/security/claim-server-unlock` | admin token | Consumes the recovery ticket. |

## 11. Profile — inline in `server.js`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/profile` | none | Active profile. |
| GET | `/api/profile/options` | none | Available profiles. |
| POST | `/api/profile/select` | unlocked admin | Body `{profileId, restart?}`. May schedule a self-restart (`SIGTERM`) under PM2. |

## 12. IoT / Home Assistant — `server/observer-iot-routes.js`

No inline auth found on these routes.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/plugin-ui/iot/secrets-tab.js` | Public plugin-tab JS bundle. |
| GET | `/api/iot/instances` | List configured IoT instances. |
| POST | `/api/iot/instances` | Add an instance. |
| DELETE | `/api/iot/instances/:instanceId` | Remove an instance. |
| POST | `/api/iot/instances/:instanceId/test` | Test connectivity for an instance. |

## 13. Agent skills — `server/observer-agent-skill-routes.js`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/agent-skills` | List available skills. |
| GET | `/api/agent-skills/search?q=` | Search skills. |
| GET | `/api/agent-skills/:id` | Skill detail. |
| POST | `/api/agent-skills/:id/run` | Body `{input, brainId}` — run a skill. |

## 14. Plugin system — `server/plugin-system.js` and built-in plugins

All routes under `/api/plugins/*` require the unlocked-admin gate (global
middleware) except `GET /api/plugins/list`, which needs only the admin
token. See [PLUGIN-SYSTEM.md](PLUGIN-SYSTEM.md) for the full developer guide.

**Core:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/plugins/list` | List all plugins and their state (admin token only). |
| GET | `/api/plugins/state` | Detailed plugin runtime state. |
| POST | `/api/plugins/:pluginId/toggle` | Enable/disable a plugin. |
| GET / POST | `/api/plugins/trust` | Read/update plugin trust settings. |
| POST | `/api/plugins/trust/lock` | Lock trust settings. |
| POST | `/api/plugins/install` | Install a plugin. |

**Built-in plugin routes** (all under `/api/plugins/<plugin>/*` unless noted):

- `dreaming-plugin.js`: `GET /dreaming/state`, `POST /dreaming/scan`, `POST /dreaming/apply`.
- `developer-tools-plugin.js`: hook-explorer stats/events/clear, task-debug,
  harness-eval/harness-check reporting, brain-tool-workout suite,
  `POST /api/prompts/review`, plus four **public** (unauthenticated)
  `/api/plugin-ui/*.js` tab-script routes: flight-recorder, state-browser,
  prompt-review, brain-tool-workout.
- `security-plugin.js`: `/security/*` — permission rules `GET`/`POST`,
  `POST /evaluate`, cron hardening status.
- `session-memory-plugin.js`: `GET /session-memory/state`,
  `POST /session-memory/capture`.
- `task-lifecycle-plugin.js`: `/tasks/output|stop|answer|create|wait` — a
  plugin-owned parallel task API mirroring the core queue routes in §6.

`/api/plugin-ui/*.js` routes are always public by design, regardless of
which plugin registers them, so the browser can `import()` them without
admin headers.

## 15. Configuration reference

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3220` | HTTP port |
| `QDRANT_URL` | `http://127.0.0.1:6333` | Vector store for retrieval |
| `QDRANT_COLLECTION` | `observer_chunks` | Qdrant collection name |
| `OBSERVER_PROFILE` | unset | Force a specific profile (overrides UI selection) |
| `OBSERVER_SERVER_UNLOCK_TOKEN` | random | Pre-shared recovery-unlock secret |
| `OBSERVER_UI_LOCK_INACTIVITY_MS` | `1800000` (30m) | Voice-lock session timeout |
| `OBSERVER_INTAKE_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window for intake POSTs |
| `OBSERVER_INTAKE_RATE_LIMIT_MAX` | `40` | Max intake POSTs per window |
| `OBSERVER_DISABLE_PLUGINS` | unset | `1` disables plugin loading |
| `OBSERVER_PLUGIN_DIR` | unset | Extra plugin search dirs (`;`-delimited on Windows) |
| `OBSERVER_EXTERNAL_PLUGIN_IMPORT_MODE` | `allowlist` | `allowlist` or `permissive` |
| `OBSERVER_PLUGIN_HOOK_TIMEOUT_MS` | `12000` | Plugin hook execution timeout |
| `OPEN_WEATHER_API_KEY` / `WEATHER_LOCATION` | unset | Weather summary feature |
| `OPENAI_API_KEY` | unset | Optional external model provider |
| `LOG_LEVEL` | pino default | Logging verbosity |
| `OBSERVER_BASE_URL` | — | Used only by the `run-regressions.js` CLI helper |

See [INSTALLATION.md](INSTALLATION.md) for the authoritative install-time
env var table. Non-secret runtime config lives in
`nova-observer/observer.config.json`; secrets go through the OS keychain
(`keytar`) via the `/api/secrets` routes in §8.
