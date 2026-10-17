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
- Correction preview and conservative state propagation; not atomic and not fully evaluated.
- Integration health UI reflects connection/config status.
- Official event rules, FalkorDB query/persistence/client docs and both prior-art papers inspected.

## Verified
- Live Docker Compose stack started; FalkorDB container healthy, API health returns both FalkorDB and Vercel Gateway configured/available, frontend serves HTTP 200 at `http://localhost:5173`.
- Real Vercel AI Gateway Chat Completions call returned HTTP 200 during synthetic source extraction.
- Synthetic source was extracted into one claim; evidence quote was checked against exact submitted text; source/claim/audit write and graph-backed overview counts succeeded.
- Separate real Analyst and Coordinator model calls completed on a second synthetic workspace. Analyst found a graph claim, retrieved its exact source fragment, and Coordinator persisted a `draft` decision linked to the actual claim ID. Real handoff ID and run records were returned. No action was invented when earlier runs lacked evidence.
- FalkorDB Python client returned typed headers as `[type_code, alias]`; row decoder fix was tested live through workspace authorization, ingestion and graph reads.
- `.venv/bin/pytest -q`: 10 passed (unit tests include isolated doubles; additionally separate live synthetic tests above used real services).
- `npm test -- --reporter=verbose`: 1 passed (first-use UI; stubbed health response).
- `npm run build`: TypeScript and Vite production build passed.
- Python bytecode compile passed; Python dependencies pass `pip check`.
- Local Docker Graph version logged by the container: FalkorDB 4.0.0; image tag is `falkordb/falkordb:v4.10.0`.
- Official rules require FalkorDB as primary graph DB, public repository, setup/model/query documentation, demo video and declared track.

## Still blocked / not verified
- Browser-driven create → ingest → agent → correction → repair → fresh-session journey has not been run in a real browser; frontend smoke test is component-level.
- Correction state propagation remains a limited direct-dependency preview and has not been validated end-to-end against a live dependency graph.
- Database restart/recovery/persistence has not yet been explicitly tested, though Compose uses a named volume and AOF settings.
- Application is running locally, not deployed to Vercel/another public host.

## Deferred
- Repair specialist role, run pause/cancel lifecycle, fresh-session retrieval UX, and persisted run listing/detail endpoint.
- Explicit evidence groups, alternative-support evaluation, conflict resolution.
- Durable job worker, SSE replay, serialized mutations and optimistic revision checks.
- Atomic correction application and idempotent repair jobs.
- Full auth identity management; signed guest mode only.
- Broader browser acceptance tests, evaluations, PDF/public URL ingestion.
- Deployment, demo video, project blog, production security hardening.

## Material limitations
- The local test run created several isolated synthetic workspaces in the persistent FalkorDB volume; these are not preloaded production/sample data.
- Correction currently performs multiple graph queries and can partially apply on failure; do not call it atomic.
- One fragment per source version; no chunking.
- Dependency impact preview currently covers direct `USED_CLAIM` consumers only; alternative support and multi-hop re-evaluation are not complete.
- The configured FalkorDB image tag has not been pinned by digest; verify and pin before submission.
- Real live verification has covered synthetic inputs only; it does not substitute for broader acceptance and restart tests.
