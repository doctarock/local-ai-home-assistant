# Local AI Home Assistant Installation

## What Was Installed

- Repository: `doctarock/Nova-Assistant`
- Node dependencies in `nova-observer/node_modules`
- Qdrant Docker service from `docker-compose.yml`
- Observer UI running at `http://127.0.0.1:3220`

## Requirements

- Node.js 18 or newer.
- npm. On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked by execution policy.
- Docker Desktop, running Linux containers.
- Optional: Ollama at `http://127.0.0.1:11434` with the models named in `nova-observer/observer.config.json`.

## Install From Scratch

From the folder where you want the project:

```powershell
Invoke-WebRequest -Uri https://github.com/doctarock/Nova-Assistant/archive/refs/heads/main.zip -OutFile Nova-Assistant-main.zip
Expand-Archive -Path Nova-Assistant-main.zip -DestinationPath . -Force
cd .\Nova-Assistant-main
```

Install the observer dependencies:

```powershell
cd .\nova-observer
npm.cmd install
```

If `npm install` works in your shell, that is fine too. `npm.cmd` avoids PowerShell execution-policy blocking of `npm.ps1`.

## Start Services

Start Qdrant from the repository root:

```powershell
cd [working directory]
docker compose up -d qdrant
```

Start the observer:

```powershell
cd [your-install-path]\Nova-Assistant-main\nova-observer
$env:QDRANT_URL = "http://127.0.0.1:6333"
node server.js
```

Open:

```text
http://127.0.0.1:3220
```

The observer defaults are:

- UI port: `3220`, controlled by `PORT`
- Qdrant URL: `http://127.0.0.1:6333`, controlled by `QDRANT_URL`
- Qdrant collection: `observer_chunks`, controlled by `QDRANT_COLLECTION`
- Local Ollama endpoint: `http://127.0.0.1:11434`, configured in `nova-observer/observer.config.json`

## Background Run On Windows

To run the observer in the background and write logs beside the app:

```powershell
Start-Process -FilePath node `
  -ArgumentList 'server.js' `
  -WorkingDirectory '[your-install-path]\Nova-Assistant-main\nova-observer' `
  -RedirectStandardOutput '[your-install-path]\Nova-Assistant-main\nova-observer\observer.out.log' `
  -RedirectStandardError '[your-install-path]\Nova-Assistant-main\nova-observer\observer.err.log' `
  -WindowStyle Hidden
```

Check it:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3220/
docker ps --filter name=nova-qdrant
```

Stop it:

```powershell
Get-Process node | Stop-Process
docker compose down
```

If you run other Node apps, stop only the observer process rather than every `node` process.

## Optional Ollama Setup

The app can open without Ollama, but model-backed actions expect Ollama endpoints and models to be available. The default local endpoint is:

```text
http://127.0.0.1:11434
```

The default config uses `qwen3:14b` as the default worker model. Install or edit models in `nova-observer/observer.config.json` to match your local Ollama setup.

## Optional Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3220` | Observer UI port |
| `QDRANT_URL` | `http://127.0.0.1:6333` | Qdrant vector store URL |
| `QDRANT_COLLECTION` | `observer_chunks` | Qdrant collection name |
| `OBSERVER_UI_LOCK_INACTIVITY_MS` | `1800000` (30 min) | Voice UI lock inactivity timeout |
| `OBSERVER_SERVER_UNLOCK_TOKEN` | _(random)_ | Pre-shared token for server-side unlock without voice |
| `OBSERVER_EXTERNAL_PLUGIN_IMPORT_MODE` | `allowlist` | Plugin import trust mode (`allowlist` or `permissive`) |

Missing optional plugins (`task-lifecycle-plugin.js`, `session-memory-plugin.js`, etc.) produce startup warnings but do not prevent the server from running.
