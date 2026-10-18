from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from falkordb import FalkorDB

from .settings import settings

log = logging.getLogger("recall.graph")


class GraphUnavailable(RuntimeError):
    pass


class StaleCorrectionPreview(RuntimeError):
    pass


class RecallStore:
    """FalkorDB repository. Workspace IDs are mapped to graph names server-side."""

    def __init__(self) -> None:
        try:
            self.db = FalkorDB(host=settings.falkordb_host, port=settings.falkordb_port, username=settings.falkordb_username, password=settings.falkordb_password, ssl=settings.falkordb_ssl, socket_timeout=3)
        except Exception as exc:
            raise GraphUnavailable("Could not connect to FalkorDB") from exc

    @staticmethod
    def graph_name(workspace_id: str) -> str:
        return f"recall_{workspace_id.replace('-', '')}"

    def _graph(self, workspace_id: str):
        return self.db.select_graph(self.graph_name(workspace_id))

    def ping(self) -> None:
        self.db.connection.ping()

    @staticmethod
    def rows(result: Any) -> list[dict[str, Any]]:
        # FalkorDB's client exposes each header as [type_code, alias], not just alias.
        headers = [item[-1] if isinstance(item, (list, tuple)) else item for item in result.header]
        return [dict(zip(headers, row)) for row in result.result_set]

    def create_workspace(self, workspace_id: str, name: str) -> dict[str, Any]:
        g = self._graph(workspace_id)
        created = datetime.now(timezone.utc).isoformat()
        g.query("CREATE (w:Workspace {id:$id, name:$name, created_at:$created, revision:0})", {"id": workspace_id, "name": name, "created": created})
        self._event(g, "workspace.created", {"workspace_id": workspace_id})
        return {"id": workspace_id, "name": name, "created_at": created, "revision": 0}

    def get_workspace(self, workspace_id: str) -> dict[str, Any]:
        result = self._graph(workspace_id).ro_query("MATCH (w:Workspace {id:$id}) RETURN w.id AS id, w.name AS name, w.created_at AS created_at, w.revision AS revision", {"id": workspace_id})
        if not result.result_set:
            raise GraphUnavailable("Workspace not found")
        return self.rows(result)[0]

    def _event(self, g: Any, event_type: str, payload: dict[str, Any]) -> None:
        g.query("CREATE (e:AuditEvent {id:$id, type:$type, payload:$payload, created_at:$created})", {"id": __import__("uuid").uuid4().hex, "type": event_type, "payload": json.dumps(payload, ensure_ascii=False), "created": datetime.now(timezone.utc).isoformat()})

    def overview(self, workspace_id: str) -> dict[str, Any]:
        g = self._graph(workspace_id)
        result = g.ro_query("MATCH (w:Workspace {id:$id}) RETURN w.name AS name, w.revision AS revision", {"id": workspace_id})
        if not result.result_set:
            raise GraphUnavailable("Workspace not found")
        counts = g.ro_query("MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count").result_set
        data = {row[0]: row[1] for row in counts if row[0]}
        return {"workspace": {"id": workspace_id, "name": result.result_set[0][0], "revision": result.result_set[0][1]}, "counts": {"sources": data.get("Source", 0), "claims": data.get("Claim", 0), "decisions": data.get("Decision", 0), "actions": data.get("Action", 0), "investigations": data.get("Investigation", 0)}, "attention": self.rows(g.ro_query("MATCH (n) WHERE n.status IN ['needs_review','held','contested','unsupported'] RETURN n.id AS id, labels(n)[0] AS type, n.statement AS title, n.status AS status LIMIT 25"))}

    def graph_data(self, workspace_id: str, limit: int) -> dict[str, Any]:
        g = self._graph(workspace_id)
        nodes = self.rows(g.ro_query("MATCH (n) RETURN id(n) AS internal_id, labels(n) AS labels, properties(n) AS properties LIMIT $limit", {"limit": limit}))
        edges = self.rows(g.ro_query("MATCH (a)-[r]->(b) RETURN id(a) AS source_internal, id(b) AS target_internal, type(r) AS type, properties(r) AS properties LIMIT $limit", {"limit": limit * 2}))
        mapped = []
        internal = {}
        for item in nodes:
            props = item["properties"]
            node_id = props.get("id", str(item["internal_id"]))
            internal[item["internal_id"]] = node_id
            mapped.append({"id": node_id, "type": item["labels"][0] if item["labels"] else "Node", "label": props.get("name") or props.get("statement") or props.get("id"), "status": props.get("status", "active"), "properties": props})
        links = [{"source": internal.get(e["source_internal"], str(e["source_internal"])), "target": internal.get(e["target_internal"], str(e["target_internal"])), "type": e["type"], "properties": e["properties"]} for e in edges]
        return {"nodes": mapped, "edges": links}

    def sources(self, workspace_id: str) -> list[dict[str, Any]]:
        return self.rows(self._graph(workspace_id).ro_query("MATCH (s:Source)-[:HAS_VERSION]->(v:SourceVersion) RETURN s.id AS id, s.name AS name, v.id AS version_id, v.created_at AS created_at, v.status AS status ORDER BY v.created_at DESC LIMIT 100"))

    def claims(self, workspace_id: str, q: str | None, limit: int) -> list[dict[str, Any]]:
        active_states = "c.status IN ['proposed','accepted','contested']"
        if q:
            return self.rows(self._graph(workspace_id).ro_query(f"MATCH (c:Claim) WHERE {active_states} AND toLower(c.statement) CONTAINS toLower($q) RETURN c.id AS id, c.statement AS statement, c.subject AS subject, c.predicate AS predicate, c.value AS value, c.status AS status, c.confidence AS confidence, c.evidence_quote AS evidence_quote LIMIT $limit", {"q": q, "limit": limit}))
        return self.rows(self._graph(workspace_id).ro_query(f"MATCH (c:Claim) WHERE {active_states} RETURN c.id AS id, c.statement AS statement, c.subject AS subject, c.predicate AS predicate, c.value AS value, c.status AS status, c.confidence AS confidence, c.evidence_quote AS evidence_quote LIMIT $limit", {"limit": limit}))

    def events(self, workspace_id: str, after: int, limit: int) -> list[dict[str, Any]]:
        return self.rows(self._graph(workspace_id).ro_query("MATCH (e:AuditEvent) RETURN e.id AS id, e.type AS type, e.payload AS payload, e.created_at AS created_at ORDER BY e.created_at DESC SKIP $after LIMIT $limit", {"after": after, "limit": limit}))

    def search_current_claims(self, workspace_id: str, query: str, limit: int) -> list[dict[str, Any]]:
        g = self._graph(workspace_id)
        bounded = min(limit, 20)
        current_query = "MATCH (c:Claim) WHERE c.status IN ['proposed','accepted','contested'] AND toLower(c.statement) CONTAINS toLower($q) RETURN c.id AS id, c.statement AS statement, c.subject AS subject, c.predicate AS predicate, c.value AS value, c.status AS status, c.confidence AS confidence, c.evidence_quote AS evidence_quote LIMIT $limit"
        rows = self.rows(g.ro_query(current_query, {"q": query.strip()[:200], "limit": bounded}))
        if rows:
            return rows
        # Back off to individual non-stopword terms when the model's full phrase does not match.
        terms = [term.lower().strip(".,:;!?()[]{}\"'\\\\") for term in query.split()]
        terms = [term for term in terms if len(term) >= 3 and term not in {"the", "and", "for", "with", "from", "that", "this", "what", "when", "where", "date", "find", "show", "tell", "about"}]
        for term in terms[:8]:
            rows = self.rows(g.ro_query(current_query, {"q": term, "limit": bounded}))
            if rows:
                return rows
        return []

    def source_evidence(self, workspace_id: str, claim_ids: list[str]) -> list[dict[str, Any]]:
        if not claim_ids:
            return []
        return self.rows(self._graph(workspace_id).ro_query("MATCH (c:Claim)-[:SUPPORTED_BY]->(f:SourceFragment) WHERE c.id IN $ids AND c.status IN ['proposed','accepted','contested'] RETURN c.id AS claim_id, c.statement AS statement, c.status AS status, c.evidence_quote AS evidence_quote, f.text AS source_text, c.confidence AS confidence LIMIT 20", {"ids": claim_ids}))

    def decisions(self, workspace_id: str) -> list[dict[str, Any]]:
        return self.rows(self._graph(workspace_id).ro_query("MATCH (d:Decision) OPTIONAL MATCH (d)-[:USED_CLAIM]->(c:Claim) RETURN d.id AS id, d.title AS title, d.statement AS rationale, d.status AS status, d.uncertainty AS uncertainty, collect(c.id) AS claim_ids ORDER BY d.created_at DESC LIMIT 100"))

    def actions(self, workspace_id: str) -> list[dict[str, Any]]:
        return self.rows(self._graph(workspace_id).ro_query("MATCH (a:Action)-[:REQUIRES]->(d:Decision) RETURN a.id AS id, a.title AS title, a.status AS status, a.created_at AS created_at, d.id AS decision_id, d.status AS decision_status LIMIT 100"))

    def ingest_source(self, payload: Any, source_id: str, claims: list[dict[str, Any]]) -> dict[str, Any]:
        g = self._graph(payload.workspace_id)
        version_id = __import__("uuid").uuid4().hex
        now = datetime.now(timezone.utc).isoformat()
        fragment_id = __import__("uuid").uuid4().hex
        # Each source currently has one immutable fragment, keeping extracted quotes addressable.
        g.query("CREATE (s:Source {id:$sid, name:$name, authority:$authority}) CREATE (v:SourceVersion {id:$vid, content:$content, created_at:$created, status:'active'}) CREATE (s)-[:HAS_VERSION]->(v) CREATE (f:SourceFragment {id:$fid, text:$content, start_offset:0, end_offset:$end}) CREATE (v)-[:HAS_FRAGMENT]->(f)", {"sid": source_id, "name": payload.name, "authority": "user_submitted", "vid": version_id, "content": payload.content, "created": now, "fid": fragment_id, "end": len(payload.content)})
        stored = []
        for claim in claims:
            cid = __import__("uuid").uuid4().hex
            statement = claim["statement"]
            quote = claim["evidence_quote"]
            start = payload.content.find(quote)
            g.query("MATCH (f:SourceFragment {id:$fid}) CREATE (c:Claim {id:$cid, statement:$statement, subject:$subject, predicate:$predicate, value:$value, entity_scope:$scope, evidence_quote:$quote, evidence_start:$start, evidence_end:$end, valid_time:$valid_time, recorded_at:$recorded, status:'proposed', confidence:$confidence, revision:1}) CREATE (c)-[:SUPPORTED_BY {role:'primary'}]->(f)", {"fid": fragment_id, "cid": cid, "statement": statement, "subject": claim.get("subject") or "unresolved", "predicate": claim.get("predicate") or "unresolved", "value": claim.get("value") or "unresolved", "scope": claim.get("entity_scope") or "unresolved", "quote": quote, "start": start, "end": start + len(quote), "valid_time": claim.get("valid_time") or "unknown", "recorded": now, "confidence": claim["confidence"]})
            stored.append({"id": cid, "statement": statement, "status": "proposed", "evidence_quote": quote, "confidence": claim["confidence"]})
        g.query("MATCH (w:Workspace {id:$id}) SET w.revision = w.revision + 1", {"id": payload.workspace_id})
        self._event(g, "source.ingested", {"source_id": source_id, "claim_count": len(stored)})
        return {"source": {"id": source_id, "version_id": version_id, "fragment_id": fragment_id, "name": payload.name}, "claims": stored, "created_count": len(stored)}

    def preview_correction(self, payload: Any) -> dict[str, Any]:
        g = self._graph(payload.workspace_id)
        current = self.rows(g.ro_query("MATCH (c:Claim {id:$id}) OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(f:SourceFragment)<-[:HAS_FRAGMENT]-(v:SourceVersion)<-[:HAS_VERSION]-(s:Source) RETURN c.id AS id, c.statement AS statement, c.status AS status, c.revision AS revision, s.name AS source_name, f.text AS source_text", {"id": payload.claim_id}))
        if not current:
            raise GraphUnavailable("Claim not found")
        affected = self.rows(g.ro_query("MATCH (c:Claim {id:$id})<-[:USED_CLAIM]-(d) RETURN DISTINCT d.id AS id, labels(d)[0] AS type, d.statement AS statement, d.status AS status LIMIT 100", {"id": payload.claim_id}))
        revision_rows = self.rows(g.ro_query("MATCH (w:Workspace {id:$id}) RETURN w.revision AS revision", {"id": payload.workspace_id}))
        if not revision_rows:
            raise GraphUnavailable("Workspace not found")
        return {"claim": current[0], "correction": payload.corrected_statement, "affected": affected, "workspace_revision": revision_rows[0]["revision"], "mode": "preview_only", "uncertainty": "Support alternatives and dependency coverage must be reviewed before applying."}

    def apply_correction(self, payload: Any) -> dict[str, Any]:
        g = self._graph(payload.workspace_id)
        old_claim = self.rows(g.ro_query("MATCH (c:Claim {id:$id}) RETURN c.id AS id, c.status AS status, c.revision AS revision", {"id": payload.claim_id}))
        if not old_claim:
            raise GraphUnavailable("Claim not found")
        old = old_claim[0]
        if old["status"] == "superseded":
            existing = self.rows(g.ro_query("MATCH (corr:Correction)-[:CORRECTS]->(old:Claim {id:$id}), (old)-[:SUPERSEDES]->(replacement:Claim) WHERE corr.corrected_statement=$statement RETURN corr.id AS correction_id, replacement.id AS replacement_id, corr.created_at AS created_at", {"id": payload.claim_id, "statement": payload.corrected_statement}))
            if existing:
                return {"correction_id": existing[0]["correction_id"], "superseded_claim_id": payload.claim_id, "replacement_claim_id": existing[0]["replacement_id"], "affected": [], "status": "already_applied", "idempotent": True}
            raise StaleCorrectionPreview("Claim has already changed; preview its current revision again")
        current_revision = self.rows(g.ro_query("MATCH (w:Workspace {id:$id}) RETURN w.revision AS revision", {"id": payload.workspace_id}))
        if not current_revision or current_revision[0]["revision"] != payload.expected_workspace_revision or old["revision"] != payload.expected_claim_revision:
            raise StaleCorrectionPreview("Workspace or claim changed after preview; refresh the impact preview before applying")
        preview = self.preview_correction(payload)
        correction_id = __import__("uuid").uuid4().hex
        replacement_id = __import__("uuid").uuid4().hex
        now = datetime.now(timezone.utc).isoformat()
        g.query("MATCH (w:Workspace {id:$workspace_id}) MATCH (old:Claim {id:$id}) WHERE w.revision=$workspace_revision AND old.status <> 'superseded' AND old.revision=$claim_revision MATCH (old)-[:SUPPORTED_BY]->(f:SourceFragment) CREATE (corr:Correction {id:$correction_id, corrected_statement:$statement, reviewer_note:$reviewer_note, created_at:$created, status:'applied'}) CREATE (replacement:Claim {id:$replacement_id, statement:$statement, subject:old.subject, predicate:old.predicate, value:'unresolved', entity_scope:old.entity_scope, evidence_quote:old.evidence_quote, evidence_start:old.evidence_start, evidence_end:old.evidence_end, valid_time:'unknown', recorded_at:$created, status:'proposed', confidence:1.0, revision:old.revision + 1}) CREATE (old)-[:SUPERSEDES]->(replacement) CREATE (corr)-[:CORRECTS]->(old) CREATE (replacement)-[:DERIVED_FROM]->(corr) CREATE (replacement)-[:SUPPORTED_BY {role:'correction_context'}]->(f) SET old.status='superseded', old.revision=old.revision + 1, w.revision=w.revision + 1 RETURN corr.id AS correction_id", {"workspace_id": payload.workspace_id, "workspace_revision": payload.expected_workspace_revision, "id": payload.claim_id, "claim_revision": payload.expected_claim_revision, "correction_id": correction_id, "replacement_id": replacement_id, "statement": payload.corrected_statement, "reviewer_note": payload.reviewer_note, "created": now})
        committed = self.rows(g.ro_query("MATCH (old:Claim {id:$id})-[:SUPERSEDES]->(replacement:Claim {id:$replacement_id}) RETURN replacement.id AS id", {"id": payload.claim_id, "replacement_id": replacement_id}))
        if not committed:
            raise StaleCorrectionPreview("Claim changed while applying; refresh the impact preview")
        # Conservative propagation: decisions using the superseded claim require review; pending actions are held.
        g.query("MATCH (c:Claim {id:$id})<-[:USED_CLAIM]-(d:Decision) SET d.status='needs_review'", {"id": payload.claim_id})
        g.query("MATCH (c:Claim {id:$id})<-[:USED_CLAIM]-(d:Decision)<-[:REQUIRES]-(a:Action) WHERE a.status IN ['proposed','approved'] SET a.status='held'", {"id": payload.claim_id})
        self._event(g, "correction.applied", {"correction_id": correction_id, "claim_id": payload.claim_id, "replacement_id": replacement_id})
        return {"correction_id": correction_id, "superseded_claim_id": payload.claim_id, "replacement_claim_id": replacement_id, "affected": preview["affected"], "status": "applied", "note": "Replacement remains proposed until evidence and dependencies are reviewed."}
