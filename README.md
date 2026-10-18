# Afterhack

**Repair the consequences of incorrect AI memory.** Afterhack is an evidence-backed agent memory and coordination workspace. Its graph stores the relationships between sources, source versions, fragments, claims, corrections, decisions, and actions so that changed evidence can be traced to dependent work.

> **Current implementation status:** working live API vertical slice. Synthetic end-to-end API tests have verified live Vercel AI Gateway extraction, exact source-quote provenance, FalkorDB graph writes/reads, Analyst → Coordinator handoff, evidence-linked draft decisions, correction preview/apply, duplicate correction retries, and stale-preview rejection. The complete browser journey, restart durability, multi-hop support evaluation, atomic repair, and public deployment are still unverified or incomplete; see [`docs/implementation-status.md`](docs/implementation-status.md).

## Run locally

Prerequisites: Docker with Compose, Python 3.11+ (for local API development), Node 22+ (for local web development), and a Vercel AI Gateway API key for live source extraction. Do not put real secrets in source control.

1. Copy [`env.template`](env.template) to `.env`; set `VERCEL_AI_GATEWAY_API_KEY` and a private `SESSION_SECRET`.
2. Start the stack: `docker compose up --build`.
3. Open <http://localhost:5173>. FalkorDB health is available at <http://localhost:8000/api/v1/health>; API docs at <http://localhost:8000/docs>.
4. Create a private workspace, add a source, and inspect the resulting graph and claims. Without `VERCEL_AI_GATEWAY_API_KEY`, source extraction returns a clear `model_unconfigured` error; without FalkorDB, graph operations return 503.

Local development without Compose: start FalkorDB with a persistent volume, install API dependencies using `pip install -e 'apps/api[test]'`, run `uvicorn app.main:app --app-dir apps/api --reload`, then `npm --prefix apps/web install && npm --prefix apps/web run dev`.

## Configuration notes

The checked-in [`env.template`](env.template) lists all supported variables with non-secret local defaults. Copy it to `.env`; `.env` is ignored by Git. See [`docs/falkordb-deployment.md`](docs/falkordb-deployment.md) for exact local versus hosted connection steps.

- `VERCEL_AI_GATEWAY_API_KEY`: create an API key in Vercel AI Gateway and put it in the root `.env` file as `VERCEL_AI_GATEWAY_API_KEY=...`. Compose passes this file only to the API container; it is never embedded in the browser bundle. Do not commit `.env` or paste the key into chat.
- `MODEL_NAME`: Gateway model identifier, for example `openai/gpt-4o-mini`. Check Vercel Gateway for the model you want to use and its supported tool-calling/JSON output features.
- `VERCEL_AI_GATEWAY_BASE_URL`: defaults to `https://ai-gateway.vercel.sh/v1`.
- `FALKORDB_USERNAME` / `FALKORDB_PASSWORD`: for local Compose, leave blank. For FalkorDB Cloud, copy the displayed database username/password from the instance's **Instance Details** tab (the documented default username is `falkordb`; do not guess the password). These are database credentials, separate from Vercel. `FALKORDB_SSL=true` only if that Cloud tier/instance indicates TLS is enabled; Free-tier instances have no TLS. Always use the instance's actual **Connectivity** host and port.

## Deployment plan and required configuration

The current first screen is a standalone Afterhack landing page. Workspace navigation appears only after a user explicitly creates a private guest workspace or chooses “Continue” to reopen a saved one. Google OAuth signup is not yet implemented. The standalone page is `apps/web/src/LandingPage.tsx`; workspace navigation/rendering is in `apps/web/src/App.tsx`.

The recommended deployment split is Vercel for the static frontend, a persistent Python/FastAPI container service (Northflank is a candidate) for application logic, FalkorDB Cloud for the graph, and server-side Vercel AI Gateway calls. See [`docs/deployment-plan.md`](docs/deployment-plan.md) for the sequence and security boundaries. No cloud deployment has been provisioned yet.

Before we implement Google signup/deployment, the items you will need to supply/configure are:
- Google OAuth **Client ID** and **Client Secret** in server-side environment secrets, plus the authorized callback URL after we choose the production API/domain. Never commit/paste the secret in chat.
- A FalkorDB Cloud instance and its endpoint host, port, database username/password, TLS enabled/disabled state, and tier/persistence choice. Put those only in the API host secret settings.
- Northflank account/project/service only if you choose it for the API; Vercel project/team for the frontend. No cloud account API token is needed for local development.
- Public frontend/API domains and the exact OAuth redirect URI(s), once deployment domains are chosen.

Do not send credentials in this chat. When you have them, enter them directly in the relevant provider’s secrets/environment UI or in your local ignored `.env` for testing.

## Architecture

- `apps/web`: React + TypeScript + Vite UI; React Flow renders the backend graph response.
- `apps/api`: FastAPI routes, Vercel AI Gateway structured extraction and bounded tool-calling adapters, signed guest workspace tokens, FalkorDB repository.
- `compose.yaml`: pinned FalkorDB image with append-only persistence and a named volume, API, and static web build.
- The backend derives graph names from UUID workspace IDs; requests cannot select a graph by arbitrary name. Signed workspace guest tokens are isolated and expire after 24 hours. Production deployment should use a full identity provider and a strong random session secret.
- The Analyst → Coordinator route uses real Vercel AI Gateway model calls, bounded FalkorDB-backed tools, source-fragment retrieval, and persisted handoff/run/decision/action proposal records. Synthetic live tests have exercised this route; broader browser acceptance and operational recovery remain outstanding.

## Graph model and query catalog

Full model semantics and query catalog: [`docs/graph-model.md`](docs/graph-model.md), [`docs/query-catalog.md`](docs/query-catalog.md). Operational status and known limitations: [`docs/implementation-status.md`](docs/implementation-status.md).

Core patterns: `Workspace-[:HAS_VERSION]->SourceVersion-[:HAS_FRAGMENT]->SourceFragment`; `Claim-[:SUPPORTED_BY]->SourceFragment`; `Claim-[:SUPERSEDES]->Claim`; `Correction-[:CORRECTS]->Claim`; `Claim-[:USED_CLAIM]->Decision-[:REQUIRES]->Action`; `AuditEvent` stores durable event records. IDs are application-generated and stable; FalkorDB internal IDs are only used to render graph edges.

## Verification

Run backend unit tests with `apps/api/.venv/bin/pytest -q`, frontend tests with `npm --prefix apps/web test`, and the production build with `npm --prefix apps/web run build`. Unit tests use isolated doubles where needed; live synthetic acceptance results are listed separately in `docs/implementation-status.md`.

## Event submission

Intended track: **Track 02 — Agent Memory and Coordination** (Track 01 fit depends on completing the tool-using action workflow). Hackathon: WeMakeDevs Graph Hacks with FalkorDB, Oct 15–18, 2026; submission deadline Oct 18, 11:59 PM IST. Recheck the official rules before submission. Required before submission: public repository, completed graph/query docs, a verified live demo recording, deployment or reproducible local setup, and AI-assistance disclosure. See [`docs/demo-script.md`](docs/demo-script.md).

## Credits and AI disclosure

AI coding assistance was used for implementation; the participant must review, understand, test, and be able to explain all submitted work. This project does not claim that provenance-aware cascading memory repair is novel. Related work: [Yu et al., “From Faulty Memories to Corrected Actions” (arXiv:2608.10502)](https://arxiv.org/abs/2608.10502); [Wang et al., “PACMI: Provenance-Aware Cascading Memory Invalidation” (arXiv:2610.05732)](https://arxiv.org/abs/2610.05732). See [`docs/prior-art.md`](docs/prior-art.md).
