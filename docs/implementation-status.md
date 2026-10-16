# RECALL implementation status

Updated: 2026-10-17. Initial inspection found an empty directory; a user-owned Git commit and configured origin appeared during implementation and were preserved.

## Implemented (code-level only)
- FalkorDB is the required graph store, with one server-derived graph per UUID workspace; no in-memory fallback.
- Source, version, fragment, claim, correction and audit-event graph records; Compose uses append-only persistence and a named volume.
- Real OpenAI structured extraction with exact-substring quote validation; no canned model fallback.
- Bounded model-driven Analyst tools (`search_claims`, source fragment retrieval) hand a structured proposal to a separate Coordinator model call; separate run records, tool metadata, handoff artifacts, decision/action proposals and events are persisted.
- Signed, expiring guest workspace tokens; routes require workspace authorization.
- Bounded graph endpoint; React Flow consumes backend-returned nodes/edges.
- Text and supported text upload; exact evidence offsets.
- Correction preview and conservative state propagation; not atomic and not fully evaluated.
- Integration health UI reflects connection/config status.
- Official rules, FalkorDB query/persistence/client docs and both prior-art papers inspected.

## Verified
- `apps/api/.venv/bin/pytest -q`: 3 passed before the separate Coordinator model call was added (authorization helper and health behavior; unit tests, no live DB/model). Re-run after the current slice.
- `npm test -- --reporter=verbose`: 1 passed (first-use UI; stubbed health response).
- `npm run build`: TypeScript and Vite production build passed.
- Python bytecode compile passed.
- Python 3.13.4, Node 24.1.0 and npm 11.6.0 available.
- Docker CLI present but daemon socket unavailable; `docker info` denied.
- `OPENAI_API_KEY` not configured.
- Official rules require FalkorDB as primary graph DB, public repository, setup/model/query documentation, demo video and declared track.
- Initial documentation/API/UI commits were pushed successfully to `https://github.com/runningpoem30/afterfact` on `master`.

## Blocked
- Actual FalkorDB query semantics/persistence/restart and live model extraction: DB daemon/model secret not available.
- End-to-end browser workflow: database/model unavailable.
- Agent slice is not yet committed or pushed.

## Deferred
- Repair specialist role, run pause/cancel lifecycle, fresh-session retrieval UX, and persisted run listing/detail endpoint.
- Explicit evidence groups, alternative-support evaluation, conflict resolution.
- Durable job worker, SSE replay, serialized mutations and optimistic revision checks.
- Atomic correction application and idempotent repair jobs.
- Full auth identity management; signed guest mode only.
- Live FalkorDB integration tests, broader browser acceptance tests, evaluations, PDF/public URL ingestion.
- Deployment, video, project blog, production security hardening.

## Material limitations
- Correction currently performs multiple graph queries and can partially apply on failure; do not call it atomic.
- One fragment per source version; no chunking.
- Dependency impact preview currently covers direct `USED_CLAIM` consumers only; alternative support and multi-hop re-evaluation are not complete.
- The configured FalkorDB image tag has not been pulled or digest-pinned; verify before submission.
- The current agent code and query catalog have not been tested against the configured FalkorDB image or a real model response.
