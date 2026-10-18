# RECALL implementation status

Updated: 2026-10-17. Initial inspection found an empty directory; a user-owned Git commit and configured origin appeared during implementation and were preserved.

## Implemented (code-level)
- FalkorDB is the required graph store, with one server-derived graph per UUID workspace; no in-memory fallback. Host, port, ACL username/password, and TLS are environment-configurable.
- Source, version, fragment, claim, correction and audit-event graph records; Compose uses append-only persistence and a named volume.
- Vercel AI Gateway OpenAI-compatible adapter configured via `VERCEL_AI_GATEWAY_API_KEY`; exact-substring quote validation; no provider/canned fallback.
- Bounded model-driven Analyst tools (`search_claims`, source-fragment retrieval) hand a structured proposal to a separate Coordinator model call; separate run records, tool metadata, handoff artifacts, decision/action proposals and events are persisted.
- Signed, expiring guest workspace tokens; routes require workspace authorization.
- Bounded graph endpoint; React Flow consumes backend-returned nodes/edges.
- Text and supported text upload; exact evidence offsets.
- Correction preview/apply with workspace+claim revision checks, duplicate-request idempotency, preserved historical source-fragment context, and terminal-state filtering; downstream repair is still conservative and not atomic.
- Integration health UI reflects connection/config status.
- Official event rules, FalkorDB query/persistence/client docs and both prior-art papers inspected.

## Verified
- Live Docker Compose stack started; FalkorDB container healthy, API health returns both FalkorDB and Vercel Gateway configured/available, frontend serves HTTP 200 at `http://localhost:5173`.
- Real Vercel AI Gateway Chat Completions call returned HTTP 200 during synthetic source extraction.
- Synthetic source was extracted into one claim; evidence quote was checked against exact submitted text; source/claim/audit write and graph-backed overview counts succeeded.
- Separate real Analyst and Coordinator model calls completed on synthetic workspaces. Analyst found graph claims, retrieved exact source fragments, and Coordinator persisted `draft` decisions linked to actual claim IDs. Real handoff IDs and run records were returned; unsupported evidence stayed `needs_review` and created no action.
- Complete API-level synthetic recovery workflow passed: workspace → live source extraction → agent handoff → correction preview → correction apply → persisted replacement and audit event. Duplicate apply returned `already_applied` with the same replacement; a workspace revision change after preview returned HTTP 409 `stale_correction_preview`. Replacement stayed proposed and linked to original source fragment as correction context; superseded claims were omitted from active claim search.
- FalkorDB Python client returned typed headers as `[type_code, alias]`; row decoder fix was tested live through workspace authorization, ingestion and graph reads.
- `.venv/bin/pytest -q`: 11 passed (unit tests include isolated doubles; separately the live synthetic API workflows above used real services).
- `npm test -- --reporter=verbose`: 1 passed (first-use UI; stubbed health response).
- `npm run build`: TypeScript and Vite production build passed.
- Python bytecode compile passed; Python dependencies pass `pip check`.
- Local Docker Graph version logged by the container: FalkorDB 4.0.0; image tag is `falkordb/falkordb:v4.10.0`.
- Official rules require FalkorDB as primary graph DB, public repository, setup/model/query documentation, demo video and declared track.

## Still blocked / not verified
- Browser-driven create → ingest → agent → correction → repair → fresh-session journey has not been run in a real browser; frontend smoke test is component-level.
- Correction state propagation was tested for claim history and revision/idempotency behavior, but downstream decision/action propagation is still limited to direct dependencies and has not been validated across a multi-hop dependency graph.
- Database restart/recovery/persistence has not yet been explicitly tested, though Compose uses a named volume and AOF settings.
- Application is running locally, not deployed to Vercel/another public host.

## Deferred
- Repair specialist role, run pause/cancel lifecycle, fresh-session retrieval UX, and persisted run listing/detail endpoint.
- Explicit evidence groups, alternative-support evaluation, conflict resolution.
- Durable job worker, SSE replay, serialized mutations and optimistic revision checks.
- Atomic multi-record correction repair and durable idempotent repair jobs.
- Full auth identity management; signed guest mode only.
- Broader browser acceptance tests, evaluations, PDF/public URL ingestion.
- Deployment, demo video, project blog, production security hardening.

## Material limitations
- The local test run created several isolated synthetic workspaces in the persistent FalkorDB volume; these are not preloaded production/sample data.
- Correction checks claim/workspace revisions in the graph write and handles exact duplicate retries, but follow-up decision/action holds and audit event are separate graph writes. The overall recovery is therefore not atomic and may partially apply after a database failure.
- One fragment per source version; no chunking.
- Dependency impact preview currently covers direct `USED_CLAIM` consumers only; alternative support and multi-hop re-evaluation are not complete.
- The configured FalkorDB image tag has not been pinned by digest; verify and pin before submission.
- Real live verification has covered synthetic inputs only; it does not substitute for broader acceptance and restart tests.
