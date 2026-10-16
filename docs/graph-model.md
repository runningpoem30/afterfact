# RECALL graph model (initial)

Each workspace owns a separate FalkorDB graph. Graph selection is server-derived from the authenticated UUID workspace identity; clients never send graph names. Nodes use application-generated UUIDs as stable identifiers.

## Node semantics

- `Workspace`: name, created time, business-data revision.
- `Source`: source display name and ingestion/review-assigned authority. Authority is not set by source text or model output.
- `SourceVersion`: immutable submitted content, recorded time, ingestion status.
- `SourceFragment`: source text span plus offsets. Current implementation stores one fragment per version; all model quotes must be exact substrings and carry start/end offsets.
- `Claim`: structured subject/predicate/value/scope, human statement, valid time, recorded time, lifecycle state, extraction confidence, revision. Unresolved entities are marked `unresolved`; confidence is not truth.
- `Correction`: corrected statement, explicit reviewer authority, timestamp, status.
- `AuditEvent`: durable event type, JSON payload and timestamp.
- `Agent`: separate `analyst` and `coordinator` role records.
- `AgentRun`: role, task, completion state, provider/model, elapsed duration, bounded tool calls, and evidence IDs.
- `Handoff`: serialized structured proposal and acknowledgment state.
- `Decision`: draft/needs-review proposal, rationale, uncertainty, and support requirement.
- `Action`: non-executable proposed work requiring a decision; only created when retrieved evidence IDs support the proposal.
- Planned but not yet implemented: `EvidenceGroup`, `Session`, `Investigation`, `RepairPlan`, `Job`.

## Relationships

- `(Source)-[:HAS_VERSION]->(SourceVersion)`
- `(SourceVersion)-[:HAS_FRAGMENT]->(SourceFragment)`
- `(Claim)-[:SUPPORTED_BY {role}]->(SourceFragment)`
- `(OldClaim)-[:SUPERSEDES]->(ReplacementClaim)` (history is retained; replacement stays proposed)
- `(Correction)-[:CORRECTS]->(OldClaim)`
- `(ReplacementClaim)-[:DERIVED_FROM]->(Correction)`
- `(Analyst)-[:PRODUCED]->(AnalystRun)-[:HANDED_OFF_TO]->(Handoff)-[:HANDED_OFF_TO]->(CoordinatorRun)`
- `(Agent)-[:PRODUCED]->(AgentRun)`
- `(CoordinatorRun)-[:PRODUCED]->(Decision)` and optionally `(CoordinatorRun)-[:PRODUCED]->(Action)`
- `(Decision)-[:USED_CLAIM]->(Claim)`; `(Action)-[:REQUIRES]->(Decision)`
- Planned: explicit evidence groups and their alternative/necessary support semantics.

Relationship direction is intentional: claims point to support; newer claims point forward through `SUPERSEDES`; the correction itself points to the corrected historical claim. Dependency evaluation must inspect support requirements and alternatives—not infer invalidity from reachability alone.

## States

Claim: proposed / accepted / contested / superseded / retracted. Agent search excludes superseded/retracted claims. Decision and action state transition rules are documented in `state-transitions.md`; agent output creates draft decisions and proposed actions only. Correction marks direct dependent decisions for review and pending dependent actions held; this remains conservative and incomplete.
