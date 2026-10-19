# Setup, configuration and operations

[← Back to README](../README.md)

## Setup: run it locally

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Docker + Docker Compose | recent | The one-command setup (recommended) |
| Model API key | — | Claim extraction and agents. A [Vercel AI Gateway](https://vercel.com/ai-gateway) key by default, or any OpenAI-compatible endpoint with tool calling and JSON mode |
| Python | 3.11+ | Only for running the API without Docker |
| Node.js | 22+ | Only for running the web app without Docker |

### Option A: Docker Compose (recommended)

```bash
# 1. Clone
git clone https://github.com/runningpoem30/afterfact.git
cd afterfact

# 2. Create your local env file
cp env.template .env
```

Open `.env` and set at least these two values:

```dotenv
VERCEL_AI_GATEWAY_API_KEY=your-key-here
SESSION_SECRET=any-long-random-string
```

Generate a session secret with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.

```bash
# 3. Build and start FalkorDB, the API and the web app
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API health | http://localhost:8000/api/v1/health |
| Interactive API docs | http://localhost:8000/docs |
| FalkorDB | `localhost:6379` |

Check that everything is connected:

```bash
curl -s http://localhost:8000/api/v1/health
```

You want to see `"status": "ok"`, `"falkordb": {"available": true}` and `"model": {"configured": true}`.

Compose sets `FALKORDB_HOST=falkordb` for the API container automatically, so leave `FALKORDB_HOST=localhost` in `.env`. That value is used only when you run the API outside Docker.

**Persistence:** FalkorDB runs with `--appendonly yes --appendfsync everysec` on the named volume `recall_graph_data`, so your graphs survive `docker compose down` and restarts. To wipe all data, run `docker compose down -v`.

### Option B: run each part yourself (for development)

**1. Start FalkorDB**

```bash
docker run -d --name falkordb -p 6379:6379 \
  -v falkordb_data:/var/lib/falkordb/data \
  falkordb/falkordb:v4.10.0 --appendonly yes
```

**2. Start the API** (from the repo root, so it picks up the root `.env`)

```bash
cp env.template .env          # then set VERCEL_AI_GATEWAY_API_KEY and SESSION_SECRET
python3 -m venv apps/api/.venv
apps/api/.venv/bin/pip install -e 'apps/api[test]'
apps/api/.venv/bin/uvicorn app.main:app --app-dir apps/api --reload --port 8000
```

**3. Start the web app** (in a second terminal)

```bash
npm --prefix apps/web install
npm --prefix apps/web run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to `http://localhost:8000`.

### Option C: FalkorDB Cloud instead of local FalkorDB

1. Create an instance at [FalkorDB Cloud](https://app.falkordb.cloud).
2. Copy the host and port from the instance's **Connectivity** tab, and the username and password from **Instance Details**.
3. Set them in `.env`:

   ```dotenv
   FALKORDB_HOST=your-instance-host
   FALKORDB_PORT=your-instance-port
   FALKORDB_USERNAME=falkordb
   FALKORDB_PASSWORD=your-password
   FALKORDB_SSL=false        # true only if your tier has TLS enabled
   ```

4. Run the API with Option B. With Compose, also remove the `falkordb` service and the `FALKORDB_HOST` override from `compose.yaml`.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Health shows `"falkordb": {"available": false}` | FalkorDB isn't reachable. Check `docker compose ps`. Outside Docker, make sure `FALKORDB_HOST=localhost` and port 6379 is free. |
| Adding a source returns `503 model_unconfigured` | `VERCEL_AI_GATEWAY_API_KEY` is empty. Set it in `.env` and restart the API. |
| Adding a source returns `Model extraction failed` | The key is wrong, the model isn't enabled on your gateway, or the model doesn't support JSON mode. Try `MODEL_NAME=openai/gpt-4o-mini`. |
| A source saves but has 0 claims | The model's quotes weren't exact substrings of your text, so they were rejected on purpose. Use clear, factual sentences. |
| Apply correction returns `409 stale_correction_preview` | The claim or workspace changed after you previewed. Preview again, then apply. |
| Port 5173, 8000 or 6379 is already in use | Stop the conflicting process, or change the host-side port in `compose.yaml`. |

---

## Configuration reference

All settings are read from environment variables, or from the root `.env` file via `pydantic-settings`. `env.template` lists every variable.

| Variable | Default | Description |
|---|---|---|
| `FALKORDB_HOST` | `localhost` | FalkorDB host. Compose overrides this to `falkordb` inside the API container. |
| `FALKORDB_PORT` | `6379` | FalkorDB port. |
| `FALKORDB_USERNAME` | empty | Database username. Leave blank for local Docker. |
| `FALKORDB_PASSWORD` | empty | Database password. Leave blank for local Docker. |
| `FALKORDB_SSL` | `false` | Set `true` only if your FalkorDB instance has TLS enabled. |
| `ACCOUNT_GRAPH_NAME` | `afterhack_accounts` | The graph that stores users and workspace ownership. Fixed by the server, never chosen by the client. |
| `VERCEL_AI_GATEWAY_API_KEY` | empty | **Required** for extraction and agents. Server-side only. |
| `VERCEL_AI_GATEWAY_BASE_URL` | `https://ai-gateway.vercel.sh/v1` | Any OpenAI-compatible Chat Completions base URL. |
| `MODEL_NAME` | `openai/gpt-4o-mini` | Model ID. It must support tool calling and `response_format: json_object`. |
| `MODEL_PROVIDER` | `vercel-ai-gateway` | Label stored on agent runs. |
| `SESSION_SECRET` | dev placeholder | Signs account and workspace tokens. **Use a long random value.** |
| `MAX_UPLOAD_BYTES` | `250000` | Maximum size for an uploaded text file. |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | JSON list of allowed browser origins. |
| `VITE_API_BASE_URL` | empty | Build-time setting for the web app. Leave empty locally (Vite proxy or nginx handles `/api`). Set it to your API's HTTPS origin for a separately hosted frontend. |

Never put a model key or database credential in a `VITE_*` variable, because Vite embeds those in the browser bundle.

---

## API reference

Base path: `/api/v1`. Interactive docs are at `/docs` while the API is running.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | FalkorDB and model status, plus which features are available |
| `POST` | `/auth/signup` | Create an account. Returns an account token. |
| `POST` | `/auth/login` | Log in. Returns an account token. |
| `POST` | `/workspaces` | Create a workspace (and its FalkorDB graph) |
| `GET` | `/workspaces` | List workspaces you own |
| `POST` | `/workspaces/{id}/session` | Get a workspace token (ownership is checked) |
| `GET` | `/workspaces/{id}/overview` | Counts and attention queue |
| `GET` | `/workspaces/{id}/graph` | Product-level graph view for the UI |
| `GET` | `/workspaces/{id}/sources` | List sources |
| `POST` | `/sources` | Add a text source, extract claims and validate quotes |
| `POST` | `/sources/upload` | Same as above, from an uploaded `.txt` / `.md` / `.csv` / `.json` file |
| `GET` | `/workspaces/{id}/claims` | Current claims with their evidence (optional `q` search) |
| `GET` | `/workspaces/{id}/decisions` | Decisions and the claims they used |
| `GET` | `/workspaces/{id}/actions` | Proposed or held actions and their decisions |
| `GET` | `/workspaces/{id}/events` | Audit log |
| `POST` | `/workspaces/{id}/agents/tasks` | Run Analyst → Coordinator on a task |
| `POST` | `/corrections/preview` | Impact preview. Returns affected decisions and actions, plus revisions. |
| `POST` | `/corrections/apply` | Apply with the preview's revisions. Returns `409` if stale, `already_applied` if it's a duplicate. |

---

## Testing

```bash
# Backend: 17 tests (auth, FalkorDB config and row decoding, agent evidence gate,
# correction provenance, dependency repair, product graph view)
cd apps/api && .venv/bin/python -m pytest -q && cd ../..

# Frontend: 7 tests (landing/auth flow, workspace navigation, graph inspection, error states)
npm --prefix apps/web test

# Production build (TypeScript + Vite)
npm --prefix apps/web run build
```

Unit tests use test doubles for FalkorDB and the model. The full loop (ingest → agent → correct → repair → fresh agent task) has also been run by hand against a live FalkorDB and a live model.

---

## Deploying

There's no hosted deployment yet. Local Docker Compose is the supported way to run Afterhack. The intended production layout:

| Part | Suggested host | Notes |
|---|---|---|
| Web app | Vercel (static) | Project root `apps/web`, build `npm run build`, output `dist`. Set `VITE_API_BASE_URL` to the API's HTTPS origin. |
| API | Any long-running container host (e.g. Northflank, Render, Fly.io, AWS App Runner) | Build from `apps/api/Dockerfile`. Set every server variable from the configuration table as a secret. Add the frontend origin to `CORS_ORIGINS`. |
| Graph | FalkorDB Cloud | See Option C above. Only the API ever holds the credentials. |

Before exposing it publicly: use a fresh `SESSION_SECRET`, restrict `CORS_ORIGINS`, and add email verification, password reset and rate limiting to signup (see limitations below).

---

## Security model

- **Secrets stay on the server.** Model and database credentials are only read by the API. The browser only ever sees `/api/v1` responses.
- **Graph isolation.** The workspace graph name is `recall_<uuid>`, built by the server from a validated UUID. Clients can never name a graph. Accounts live in a separate graph fixed by the server.
- **Ownership checks.** Workspace routes need a signed workspace token, issued only to the workspace's owner. Cross-account access returns `403`.
- **Passwords** are salted PBKDF2 hashes and are never returned by the API. Tokens are signed and expire after 24 hours.
- **Source text is treated as data, not instructions.** Extraction and agent prompts tell the model never to follow instructions inside sources. Every quote must be an exact substring, and agents can only cite evidence they retrieved during the run.
- **Bounded queries.** Every read has a `LIMIT`, tool inputs are capped (20 claim IDs, 200-character queries), and all Cypher is parameterised.
