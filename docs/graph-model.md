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
- Planned but not yet implemented: `EvidenceGroup`, `Decision`, `Action`, `Agent`, `AgentRun`, `Session`, `Handoff`, `Investigation`, `RepairPlan`, `Job`.

## Relationships

- `(Source)-[:HAS_VERSION]->(SourceVersion)`
- `(SourceVersion)-[:HAS_FRAGMENT]->(SourceFragment)`
- `(Claim)-[:SUPPORTED_BY {role}]->(SourceFragment)`
- `(OldClaim)-[:SUPERSEDES]->(ReplacementClaim)` (history is retained; replacement stays proposed)
- `(Correction)-[:CORRECTS]->(OldClaim)`
- `(ReplacementClaim)-[:DERIVED_FROM]->(Correction)`
- Planned: `(Decision)-[:USED_CLAIM]->(Claim)`, `(Action)-[:REQUIRES]->(Decision)`, support-group semantics, and agent handoff relationships.

Relationship direction is intentional: claims point to support; newer claims point forward through `SUPERSEDES`; the correction itself points to the corrected historical claim. Dependency evaluation must inspect support requirements and alternatives—not infer invalidity from reachability alone.

## States

Claim: proposed / accepted / contested / superseded / retracted. Decision and action states are planned in `state-transitions.md`; current backend sets dependent decisions to `needs_review` and pending actions to `held` after correction. Those nodes are not yet produced by agent workflows.
