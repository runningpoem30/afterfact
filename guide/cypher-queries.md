# Cypher queries the product depends on

[← Back to README](../README.md)

All queries go through the official [`falkordb`](https://github.com/FalkorDB/falkordb-py) Python client (`graph.query` for writes, `graph.ro_query` for reads). They are all parameterised, and the graph name always comes from a server-validated workspace UUID. Source: `apps/api/app/store.py` and `apps/api/app/agents.py`.

### 1. Ingest a source and its evidence fragment

```cypher
CREATE (s:Source {id:$sid, name:$name, authority:$authority})
CREATE (v:SourceVersion {id:$vid, content:$content, created_at:$created, status:'active'})
CREATE (s)-[:HAS_VERSION]->(v)
CREATE (f:SourceFragment {id:$fid, text:$content, start_offset:0, end_offset:$end,
                          origin_type:'source', origin_name:$name})
CREATE (v)-[:HAS_FRAGMENT]->(f)
```

### 2. Store a claim linked to its exact quote

Written only after the API checks that `evidence_quote` is an exact substring of the source. The offsets are taken from where the quote is found.

```cypher
MATCH (f:SourceFragment {id:$fid})
CREATE (c:Claim {id:$cid, statement:$statement, subject:$subject, predicate:$predicate,
                 value:$value, entity_scope:$scope, evidence_quote:$quote,
                 evidence_start:$start, evidence_end:$end, valid_time:$valid_time,
                 recorded_at:$recorded, status:'proposed', confidence:$confidence,
                 confidence_kind:'model_extraction', revision:1})
CREATE (c)-[:SUPPORTED_BY {role:'primary'}]->(f)
```

### 3. Agent tool: `search_claims`

Only current claims are searched. If the model's full phrase doesn't match, the server retries with individual meaningful words.

```cypher
MATCH (c:Claim)-[:SUPPORTED_BY]->(f:SourceFragment)
WHERE c.status IN ['proposed','accepted','contested']
  AND toLower(c.statement) CONTAINS toLower($q)
RETURN c.id AS id, c.statement AS statement, c.status AS status,
       c.confidence AS confidence, c.confidence_kind AS confidence_kind,
       c.evidence_quote AS evidence_quote,
       f.origin_type AS evidence_type, f.origin_name AS evidence_label
LIMIT $limit
```

### 4. Agent tool: `retrieve_source_fragments`

```cypher
MATCH (c:Claim)-[:SUPPORTED_BY]->(f:SourceFragment)
WHERE c.id IN $ids AND c.status IN ['proposed','accepted','contested']
RETURN c.id AS claim_id, c.statement AS statement, c.status AS status,
       c.evidence_quote AS evidence_quote, f.text AS source_text,
       f.origin_type AS evidence_type, f.origin_name AS evidence_label,
       c.confidence AS confidence, c.confidence_kind AS confidence_kind
LIMIT 20
```

The server enforces that a decision may only cite claims in **`searched ∩ retrieved`** for that run. A search hit alone isn't evidence.

### 5. Record the agent handoff and decision

```cypher
MERGE (analyst:Agent {id:'analyst'}) MERGE (coordinator:Agent {id:'coordinator'})
CREATE (ar:AgentRun {id:$analyst_id, role:'analyst', ...})
CREATE (cr:AgentRun {id:$coordinator_id, role:'coordinator', ...})
CREATE (h:Handoff {id:$handoff_id, status:'acknowledged', artifact:$artifact})
CREATE (analyst)-[:PRODUCED]->(ar) CREATE (coordinator)-[:PRODUCED]->(cr)
CREATE (ar)-[:HANDED_OFF_TO]->(h) CREATE (h)-[:HANDED_OFF_TO]->(cr)
CREATE (d:Decision {id:$decision_id, title:$title, status:$decision_status,
                    support_requirement:'at_least_one_valid_claim', ...})
CREATE (cr)-[:PRODUCED]->(d)
```

```cypher
// one per allowed claim
MATCH (d:Decision {id:$decision_id}), (c:Claim {id:$claim_id})
CREATE (d)-[:USED_CLAIM]->(c)

// only if the decision is supported and an action was proposed
MATCH (d:Decision {id:$decision_id}), (cr:AgentRun {id:$coordinator_id})
CREATE (a:Action {id:$action_id, title:$title, status:'proposed', idempotency_key:$key})
CREATE (a)-[:REQUIRES]->(d) CREATE (cr)-[:PRODUCED]->(a)
```

### 6. Correction impact preview (dependency traversal)

```cypher
MATCH (c:Claim {id:$id})<-[:USED_CLAIM]-(d:Decision)
RETURN DISTINCT d.id AS id, d.title AS title, d.status AS status LIMIT 100
```

```cypher
MATCH (c:Claim {id:$id})<-[:USED_CLAIM]-(d:Decision)<-[:REQUIRES]-(a:Action)
RETURN DISTINCT a.id AS id, a.title AS title, a.status AS status, d.id AS decision_id
LIMIT 100
```

The preview also returns the current `Workspace.revision`, which the client must send back to apply.

### 7. Apply a correction (conditional write)

This write only matches if neither the workspace nor the claim has changed since the preview. The correction gets its **own** `SourceFragment`, so the replacement claim never inherits the original document's quote.

```cypher
MATCH (w:Workspace {id:$workspace_id}) MATCH (old:Claim {id:$id})
WHERE w.revision = $workspace_revision
  AND old.status <> 'superseded'
  AND old.revision = $claim_revision
CREATE (corr:Correction {id:$correction_id, corrected_statement:$statement,
                         reviewer_note:$reviewer_note, created_at:$created, status:'applied'})
CREATE (f:SourceFragment {id:$fragment_id, text:$statement, start_offset:0,
                          end_offset:$statement_end, origin_type:'human_correction',
                          origin_name:'Workspace reviewer correction'})
CREATE (corr)-[:HAS_FRAGMENT]->(f)
CREATE (replacement:Claim {id:$replacement_id, statement:$statement,
                           evidence_quote:$statement, status:'proposed',
                           confidence:0.0, confidence_kind:'human_correction',
                           revision:old.revision + 1, ...})
CREATE (old)-[:SUPERSEDES]->(replacement)
CREATE (corr)-[:CORRECTS]->(old)
CREATE (replacement)-[:DERIVED_FROM]->(corr)
CREATE (replacement)-[:SUPPORTED_BY {role:'reviewer_correction'}]->(f)
SET old.status = 'superseded', old.revision = old.revision + 1, w.revision = w.revision + 1
RETURN corr.id AS correction_id
```

The API then confirms the `SUPERSEDES` edge exists. If it doesn't, the preview was stale and the request returns **409**.

### 8. Dependency repair ("reachable isn't wrong")

Being connected to a corrected claim doesn't make a decision invalid. Each dependent decision is checked for **other** current support, and only decisions with none are flagged.

```cypher
// decisions that used the corrected claim
MATCH (c:Claim {id:$claim_id})<-[:USED_CLAIM]-(d:Decision)
RETURN DISTINCT d.id AS id, d.status AS status LIMIT 100

// for each decision: is there any other current supporting claim?
MATCH (d:Decision {id:$decision_id})-[:USED_CLAIM]->(other:Claim)
WHERE other.id <> $claim_id AND other.status IN ['proposed','accepted']
RETURN other.id AS id LIMIT 1

// no alternative support -> flag it
MATCH (d:Decision {id:$decision_id}) SET d.status = 'needs_review'

// hold pending actions that require flagged decisions
MATCH (a:Action)-[:REQUIRES]->(d:Decision)
WHERE d.id IN $decision_ids AND a.status IN ['proposed','approved']
SET a.status = 'held'
```

This is written as small bounded reads instead of a single `NOT EXISTS { ... }` subquery on purpose: the subquery form failed against FalkorDB during live testing.

### 9. Idempotent retry

If a claim is already superseded by the same corrected statement, apply returns the existing result (`status: "already_applied"`) and re-runs the repair, so a retry after a partial failure can finish the job.

```cypher
MATCH (corr:Correction)-[:CORRECTS]->(old:Claim {id:$id}),
      (old)-[:SUPERSEDES]->(replacement:Claim)
WHERE corr.corrected_statement = $statement
RETURN corr.id AS correction_id, replacement.id AS replacement_id
```

### 10. Product graph view for the UI

```cypher
MATCH (n) WHERE labels(n)[0] IN ['Source','Claim','Decision','Action','Correction']
RETURN properties(n) AS properties, labels(n) AS labels LIMIT $limit
```

```cypher
// SUPPORTS is computed through the provenance chain
MATCH (s:Source)-[:HAS_VERSION]->(:SourceVersion)-[:HAS_FRAGMENT]->(:SourceFragment)<-[:SUPPORTED_BY]-(c:Claim)
RETURN DISTINCT s.id AS source, c.id AS target, 'SUPPORTS' AS type LIMIT $limit

MATCH (d:Decision)-[:USED_CLAIM]->(c:Claim)        RETURN DISTINCT c.id AS source, d.id AS target, 'USED_CLAIM' AS type LIMIT $limit
MATCH (a:Action)-[:REQUIRES]->(d:Decision)         RETURN DISTINCT d.id AS source, a.id AS target, 'REQUIRES'   AS type LIMIT $limit
MATCH (old:Claim)-[:SUPERSEDES]->(r:Claim)         RETURN DISTINCT old.id AS source, r.id AS target, 'SUPERSEDES' AS type LIMIT $limit
MATCH (corr:Correction)-[:CORRECTS]->(old:Claim)   RETURN DISTINCT corr.id AS source, old.id AS target, 'CORRECTS' AS type LIMIT $limit
```

### 11. Overview and attention queue

```cypher
MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count

MATCH (n) WHERE n.status IN ['needs_review','held','contested','unsupported']
RETURN n.id AS id, labels(n)[0] AS type, n.statement AS title, n.status AS status LIMIT 25
```

### 12. Accounts and workspace ownership

```cypher
MERGE (:AccountCatalog {id:'afterhack-account-catalog'})

MATCH (u:User {email:$email})
RETURN u.id AS id, u.email AS email, u.password_hash AS password_hash LIMIT 1

MERGE (u:User {id:$owner_id}) MERGE (w:WorkspaceReference {id:$id})
SET w.name=$name, w.owner_id=$owner_id, w.created_at=$created_at
MERGE (u)-[:OWNS_WORKSPACE]->(w)

MATCH (u:User {id:$owner_id})-[:OWNS_WORKSPACE]->(w:WorkspaceReference)
RETURN w.id AS id, w.name AS name ORDER BY w.created_at DESC LIMIT 100
```
