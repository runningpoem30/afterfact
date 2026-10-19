# Afterhack

**Repair the consequences of incorrect AI memory.**

AI agents remember things, but nothing tracks what they *did* with what they remembered. When a remembered fact turns out to be wrong, deleting it is easy. The hard part is finding everything the agent already built on top of it: the decisions it drafted and the actions it proposed.

Afterhack stores agent memory as a **FalkorDB graph of _why_**: which source supports which claim, which claim a decision used, and which action needs that decision. Every claim must carry an exact quote from its source. When a person corrects a claim, Afterhack walks the graph to show what depends on it, flags only the decisions that lost their support, holds the actions that need those decisions, and records the correction as new evidence from a human reviewer, so agents never cite the original mistake as proof of the fix.

> **Hackathon:** WeMakeDevs Graph Hacks with FalkorDB
> **Tracks:** Agent Memory and Coordination · Agents That Act on Connected Data
> **Deployment:** runs locally with one command (`docker compose up --build`). Full setup is below.

---

## Quick start

```bash
git clone https://github.com/runningpoem30/afterfact.git
cd afterfact
cp env.template .env    # set VERCEL_AI_GATEWAY_API_KEY and SESSION_SECRET
docker compose up --build
```

Open http://localhost:5173 and check http://localhost:8000/api/v1/health. Manual setup, FalkorDB Cloud and troubleshooting are in [guide/setup.md](guide/setup.md).

## Documentation

| Guide | What's inside |
|---|---|
| [guide/architecture.md](guide/architecture.md) | System architecture, agent request flow, the full graph data model (nodes, relationships, account graph) |
| [guide/cypher-queries.md](guide/cypher-queries.md) | Every Cypher query the product depends on, with why each one matters |
| [guide/setup.md](guide/setup.md) | Local setup (Docker, manual, FalkorDB Cloud), walkthrough, configuration, API reference, testing, deployment, security |

---

## What it does

| Step | What happens | Where the graph is used |
|---|---|---|
| **1. Ingest** | You paste or upload a source document. A model extracts claims, and each claim must include an exact quote from the source. | `Source → SourceVersion → SourceFragment ← Claim` is written to FalkorDB. Quotes that aren't exact substrings are rejected. |
| **2. Ask** | An **Analyst** agent searches stored claims with graph-backed tools and retrieves their source fragments. It hands a proposal to a **Coordinator** agent, which writes a draft decision. | The agent can only cite claims it both **found** and **retrieved** during this run. `Decision -[:USED_CLAIM]→ Claim` and `Action -[:REQUIRES]→ Decision` are written. |
| **3. Correct** | A reviewer corrects a wrong claim and gets an impact preview first. | A traversal finds every decision and action that depends on the claim. |
| **4. Repair** | Applying the correction supersedes the old claim, creates a replacement with its own human-reviewer evidence, and re-checks every dependent decision. | Decisions with no other supporting claim become `needs_review`, and their actions become `held`. Decisions that still have other support are left alone. |
| **5. Ask again** | A fresh agent task now finds and quotes the **correction**, not the superseded source. | Superseded claims are excluded from retrieval, and the replacement claim points to its reviewer-correction fragment. |

If there's no supporting evidence for a question, the agent records **"No source-backed answer yet"** as a `needs_review` decision and creates no action, rather than inventing an answer.

---

## Why FalkorDB is load-bearing

FalkorDB isn't a visualisation layer here. It's the only store, and the product's core features are graph traversals:

- **There's no other database.** Every source, claim, correction, decision, action, agent run, handoff, audit event and user account lives in FalkorDB. The API has no in-memory fallback. If FalkorDB is down, the health check reports `degraded` and graph routes return `503`.
- **The agents' tools are graph queries.** `search_claims` and `retrieve_source_fragments` are Cypher reads over `Claim -[:SUPPORTED_BY]→ SourceFragment`. Without the graph, the agents have nothing to ground answers in, and the evidence gate rejects every citation.
- **Correction impact is a traversal.** "What depends on this claim?" is `(Claim)<-[:USED_CLAIM]-(Decision)<-[:REQUIRES]-(Action)`. "Does this decision still have support?" is a per-decision walk over its other `USED_CLAIM` edges.
- **Provenance is structure, not a column.** Whether a claim came from a document or from a human reviewer is decided by which `SourceFragment` it's `SUPPORTED_BY`, and what that fragment hangs off (`SourceVersion` or `Correction`).
- **Isolation is per graph.** Each workspace is its own FalkorDB graph, and accounts live in a separate, server-fixed account graph.

Remove FalkorDB and there's no ingestion, no retrieval, no impact analysis and no repair. Nothing is left to run.

---

## Walkthrough: try the full loop

1. **Create an account** on the landing page, then **create a workspace**. Each workspace gets its own FalkorDB graph.
2. **Sources** → add a source:
   - Name: `Launch plan`
   - Content: `The product launch is scheduled for June 12. The marketing team will book the venue once the launch date is confirmed.`
   - Click **Extract & store**.
3. **Memory** → you'll see the extracted claim with its exact quote highlighted from the source.
4. **Agent workspace** → ask `When is the product launch?` and click **Run Analyst → Coordinator**. The result shows the decision, **EXACT EVIDENCE USED** with its source label, and the tool trail (`search claims` → `retrieve source fragments`).
5. **Investigations** → the dependency canvas shows `Source → Claim → Decision`.
6. **Memory** → open the June 12 claim and enter `The product launch is scheduled for July 12.` → **Preview**. The preview lists the decision that depends on this claim.
7. **Apply** the correction. The old claim is superseded, and the dependent decision is flagged `needs_review` because it has no other support.
8. **Agent workspace** → ask the same question again. The evidence is now the reviewer's correction, labelled **Workspace reviewer correction**, not the superseded June quote.

To check that the agent refuses to guess, ask something unrelated, such as `What is the Q3 hiring budget?`. You'll get **"No source-backed answer yet"**, status `needs_review`, and no action.

---

## Known limitations

- **Repair isn't atomic.** Correction plus dependency repair is several FalkorDB calls. A crash in between can leave partial state; retrying the same apply runs the repair again (`already_applied`), but this isn't a transactional guarantee.
- **Support is one hop deep.** "Alternative support" means "at least one other current claim used by the decision". It doesn't check whether that claim comes from an independent source, and it doesn't follow longer dependency chains.
- **Action holds are verified by tests, not seen live.** In live runs the Coordinator didn't propose an action, so `held` propagation is covered by store tests only.
- **One fragment per source.** There's no chunking yet. Large documents are stored as a single fragment, and extraction reads up to 100,000 characters.
- **Actions are proposals.** Nothing is executed outside the app.
- **Auth is demo-grade.** No email verification, password reset or login rate limiting yet.
- **No workspace delete or reset in the UI.**

---

## Project structure

```
.
├── apps/
│   ├── api/                    FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py         routes, request validation, auth dependencies
│   │   │   ├── store.py        every FalkorDB query (ingest, retrieval, preview, apply, repair, graph view)
│   │   │   ├── agents.py       Analyst → Coordinator orchestration and evidence gate
│   │   │   ├── extractor.py    model claim extraction (JSON mode)
│   │   │   ├── model_client.py OpenAI-compatible client (server-side)
│   │   │   ├── auth.py         password hashing, signed tokens
│   │   │   └── settings.py     environment configuration
│   │   ├── tests/              pytest suite
│   │   ├── Dockerfile
│   │   └── pyproject.toml
│   └── web/                    React + TypeScript + Vite frontend
│       ├── src/
│       │   ├── App.tsx         workspace UI (Overview, Sources, Memory, Agents, Investigations)
│       │   ├── LandingPage.tsx landing, signup and login
│       │   └── App.test.tsx    vitest suite
│       ├── nginx.conf          serves the built app and proxies /api to the API container
│       └── Dockerfile
├── compose.yaml                FalkorDB (persistent) + API + web
├── env.template                every supported environment variable
├── guide/                      architecture, Cypher queries, setup and operations
└── README.md
```

---

## Acknowledgements

Built for **WeMakeDevs Graph Hacks** on [FalkorDB](https://www.falkordb.com/), using the official [falkordb-py](https://github.com/FalkorDB/falkordb-py) client, [FastAPI](https://fastapi.tiangolo.com/), [React Flow](https://reactflow.dev/) and an OpenAI-compatible model gateway.
