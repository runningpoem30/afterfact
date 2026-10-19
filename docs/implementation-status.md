# Afterhack implementation status

Updated: 2026-10-19. The project directory is `graph-h`; Git history, branch and remote remain intact. Verification below uses synthetic test accounts and content unless stated otherwise.

## Implemented (code-level)
- FalkorDB is the required graph store, with one server-derived graph per UUID workspace; no in-memory fallback. Host, port, ACL username/password, and TLS are environment-configurable.
- Source, version, fragment, claim, correction and audit-event graph records; Compose uses append-only persistence and a named volume.
- Vercel AI Gateway OpenAI-compatible adapter configured via `VERCEL_AI_GATEWAY_API_KEY`; exact-substring quote validation; no provider/canned fallback.
- Bounded model-driven Analyst tools (`search_claims`, source-fragment retrieval) hand a structured proposal to a separate Coordinator model call; separate run records, tool metadata, handoff artifacts, decision/action proposals and events are persisted.
- Email/password signup/login with PBKDF2-hashed passwords, signed expiring account tokens, a server-selected account graph, and owner-checked workspace routes. Live test: signup 201, login 200, wrong password 401, owner workspace read 200, cross-account read 403; hash is not returned.
- Landing no longer displays integration connected/configured claims; it only describes the product and current email/password entry.
- Bounded, user-facing graph projection; Overview and Investigations show Sources → Claims → Decisions → Actions plus Corrections, with human-readable relationship names. Workspace metadata, source versions/fragments, audit events, agent runs, and handoff plumbing remain stored in FalkorDB but are hidden from the Overview graph to avoid presenting storage internals as product concepts. React Flow renders the backend projection.
- Text and supported text upload; exact evidence offsets.
- Correction preview/apply with workspace+claim revision checks, duplicate-request idempotency, and preserved original history. Corrections create a separate reviewer-authored `SourceFragment` and `Claim` with `confidence_kind='human_correction'`; they do not reuse the original source quote as evidence for the corrected statement. Current claim and agent retrieval responses include evidence origin metadata.
- Correction preview reports directly linked decisions and actions. Apply rechecks alternative current claim support through separate FalkorDB-compatible queries, marks unsupported decisions for review, holds proposed actions requiring those decisions, and can reconcile those dependencies on a duplicate retry. A live correction test initially exposed an unsupported FalkorDB `NOT EXISTS` subquery; it was replaced with bounded supported reads and verified live. This is not a single atomic transaction.
- Source ingestion refreshes the source list and navigates to Memory so the user can immediately inspect extracted claims. Agent results return and display the exact retrieved evidence quotes and their origin labels.
- Standalone dark Afterhack landing page is separated from workspace navigation. First visit shows the landing; saved guest workspaces require an explicit Continue action. Google OAuth/signup remains intentionally unimplemented until a provider redirect URI and server-side credentials are configured.
- Integration health UI reflects connection/config status.
- Official event rules, FalkorDB query/persistence/client docs and both prior-art papers inspected.

## Verified
- Frontend first-use and saved-workspace tests verify the landing appears before navigation and that continuing is explicit. Auth forms call the real signup/login routes.
- Live email/password signup and login against FalkorDB account graph; duplicate signup, wrong password, owner workspace access and cross-account 403 verified using synthetic test identities. Password hash is not returned by API.
- Authenticated landing flow rebuilt into Docker: account signup/login, account-owned workspace creation and workspace entry are covered by a frontend component test; real API signup/login/ownership smoke test passed.
- Live Docker Compose stack rebuilt and started after the product graph projection changes; FalkorDB container healthy, API health returns FalkorDB available and Vercel Gateway configured, frontend serves HTTP 200 at `http://localhost:5173`.
- Real Vercel AI Gateway Chat Completions call returned HTTP 200 during synthetic source extraction.
- Synthetic source was extracted into one claim; evidence quote was checked against exact submitted text; source/claim/audit write and graph-backed overview counts succeeded.
- Separate real Analyst and Coordinator model calls completed on synthetic workspaces. Analyst found graph claims, retrieved exact source fragments, and Coordinator persisted `draft` decisions linked to actual claim IDs. Real handoff IDs and run records were returned; unsupported evidence stayed `needs_review` and created no action.
- Live synthetic user journey passed against Vercel AI Gateway and FalkorDB: source extraction → original evidence quote → Analyst/Coordinator decision → correction preview/apply → replacement claim with reviewer-correction provenance → fresh agent task. The fresh task retrieved the replacement claim ID and quoted the reviewer correction, not the superseded source quote. Duplicate Apply returned `already_applied`; a stale preview returned HTTP 409 in the prior live test. A correction initially returned HTTP 500 because FalkorDB rejected a `NOT EXISTS` subquery; the query was replaced and the full live apply/retrieval journey then passed.
- Live vague prompt with no workspace evidence completed as `needs_review`, persisted an explicit “No source-backed answer yet” decision and handoff event, and created no action instead of returning a 503.
- Live graph projection on a synthetic source+agent workspace returned only user-facing `Source`, `Claim`, and `Decision` node types and the `SUPPORTS`/`USED_CLAIM` relationships; internal `Workspace`, `SourceVersion`, `SourceFragment`, `AuditEvent`, `AgentRun`, and `Handoff` records were excluded.
- In a live synthetic run the Coordinator did not propose an action, so action hold on an actually generated action remains unverified live. FalkorDB query/store regression tests cover direct decision/action dependency reconciliation and alternative support.
- FalkorDB Python client returned typed headers as `[type_code, alias]`; row decoder fix was tested live through workspace authorization, ingestion and graph reads.
- Latest full suite: `apps/api/.venv/bin/python -m pytest -q`: 17 passed, including account, provider, agent-output repair, correction evidence provenance, product-graph projection, alternative support and dependent-action reconciliation tests; one existing Starlette deprecation warning.
- Latest full suite: `npm --prefix apps/web test -- --reporter=dot`: 7 passed. Covers landing/auth/workspace navigation, graph node/edge inspection, saved-workspace recovery, and visible source-load errors. Source→claim→correction preview has passed a focused component test in isolation; a stable full browser acceptance test for the journey is still outstanding.
- `npm --prefix apps/web run build`: TypeScript and Vite production build passed.
- Python bytecode compile passed; Python dependencies pass `pip check`.
- Local Docker Graph version logged by the container: FalkorDB 4.0.0; image tag is `falkordb/falkordb:v4.10.0`.
- Official rules require FalkorDB as primary graph DB, public repository, setup/model/query documentation, demo video and declared track.

## Still blocked / not verified
- No Playwright/browser automation is installed. Frontend component tests use an HTTP stub; live backend workflows use synthetic accounts and actual FalkorDB/Gateway. A complete real-browser walkthrough is still needed.
- No hosted deployment is configured. Local Compose is running; Vercel/Northflank/FalkorDB Cloud domains and secrets are not provisioned here.
- Live correction verification proved the replacement quote and a fresh agent retrieval. Live action-hold propagation was not observed because the real Coordinator did not propose an action in the test; this path is covered by store tests only.
- Database restart/recovery has not yet been explicitly re-tested after these latest changes, though Compose uses a named volume and AOF settings.

## Deferred / product gaps
- Source version replacement/retraction, PDF/public URL ingestion, multi-chunk parsing, and a source-review UI.
- Claim accept/contest workflows and explicit alternative evidence groups.
- Repair specialist role, multi-hop dependency traversal, richer correction investigation report and before/after graph comparison.
- Action approval/resume/execution UI; actions are proposals only.
- Fresh-session agent retrieval workflow UI, persisted run listing/detail, and agent pause/cancel.
- Atomic serialized correction+repair mutation, durable repair jobs, worker leases/checkpoints, SSE run progress.
- Broader browser acceptance tests and systematic evaluations.
- Hosted deployment, demo video, final submission materials.


## Material limitations
- Synthetic test accounts/workspaces remain in the persistent local FalkorDB volume; there is no workspace delete/reset UI. They are not product-preloaded examples.
- Correction graph writes and follow-up support re-evaluation, action holds, and audit writes are multiple FalkorDB calls, not an atomic transaction. A crash can leave partial repair state; duplicate apply attempts reconciliation but does not guarantee transactional recovery.
- Alternative support currently means “at least one other proposed/accepted claim”; source independence, explicit evidence groups, and multi-hop dependency traversal are not modeled yet.
- One fragment per source version; no chunking.
- The configured FalkorDB image tag has not been pinned by digest; verify and pin before submission.
- Live checks used synthetic content only; the action execution branch, restart recovery, and a full real-browser workflow still need verification.
