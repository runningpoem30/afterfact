# FalkorDB query catalog (initial)

All calls use the official FalkorDB Python client: `graph.query(cypher, params)` for writes and `graph.ro_query(cypher, params)` for reads. Values are parameterized. The graph name is derived from the authorized workspace UUID.

## Workspace creation

```cypher
CREATE (w:Workspace {id:$id, name:$name, created_at:$created, revision:0})
```

## Source, version, fragment

```cypher
CREATE (s:Source {id:$sid, name:$name, authority:'user_submitted'})
CREATE (v:SourceVersion {id:$vid, content:$content, created_at:$created, status:'active'})
CREATE (s)-[:HAS_VERSION]->(v)
CREATE (f:SourceFragment {id:$fid, text:$content, start_offset:0, end_offset:$end})
CREATE (v)-[:HAS_FRAGMENT]->(f)
```

## Claim with validated source span

```cypher
MATCH (f:SourceFragment {id:$fid})
CREATE (c:Claim {id:$cid, statement:$statement, subject:$subject,
 predicate:$predicate, value:$value, entity_scope:$scope,
 evidence_quote:$quote, evidence_start:$start, evidence_end:$end,
 valid_time:$valid_time, recorded_at:$recorded, status:'proposed',
 confidence:$confidence, revision:1})
CREATE (c)-[:SUPPORTED_BY {role:'primary'}]->(f)
```

## Bounded graph read

```cypher
MATCH (n) RETURN id(n) AS internal_id, labels(n) AS labels,
 properties(n) AS properties LIMIT $limit
MATCH (a)-[r]->(b) RETURN id(a) AS source_internal,
 id(b) AS target_internal, type(r) AS type, properties(r) AS properties
LIMIT $edge_limit
```

## Claim search

```cypher
MATCH (c:Claim) WHERE toLower(c.statement) CONTAINS toLower($q)
RETURN c.id AS id, c.statement AS statement, c.status AS status,
 c.confidence AS confidence, c.evidence_quote AS evidence_quote LIMIT $limit
```

## Direct impact preview

```cypher
MATCH (c:Claim {id:$id})<-[:USED_CLAIM]-(d)
RETURN DISTINCT d.id AS id, labels(d)[0] AS type,
 d.statement AS statement, d.status AS status LIMIT 100
```

## Conservative direct state propagation

```cypher
MATCH (c:Claim {id:$id})<-[:USED_CLAIM]-(d:Decision)
SET d.status='needs_review'
```

```cypher
MATCH (c:Claim {id:$id})<-[:USED_CLAIM]-(d:Decision)<-[:REQUIRES]-(a:Action)
WHERE a.status IN ['proposed','approved'] SET a.status='held'
```

Correction writes are multiple client calls, so atomicity is **not claimed**. The catalog describes implemented code; actual query success against the configured image is **not verified** because Docker is unavailable. Alternative-support and multi-hop evaluation are deferred.
