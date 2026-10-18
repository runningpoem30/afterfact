from types import SimpleNamespace

from app.store import RecallStore


def test_result_rows_decode_falkordb_typed_headers():
    result = SimpleNamespace(
        header=[[1, "id"], [1, "name"]],
        result_set=[["workspace-1", "Synthetic workspace"]],
    )
    assert RecallStore.rows(result) == [{"id": "workspace-1", "name": "Synthetic workspace"}]


def test_result_rows_accept_plain_header_names():
    result = SimpleNamespace(header=["id", "count"], result_set=[["claim-1", 2]])
    assert RecallStore.rows(result) == [{"id": "claim-1", "count": 2}]


def test_human_correction_fragment_is_new_current_evidence_not_old_source(monkeypatch):
    from app.store import StaleCorrectionPreview

    statements = []

    class Result:
        def __init__(self, header, rows):
            self.header = [[1, item] for item in header]
            self.result_set = rows

    class Graph:
        def ro_query(self, query, params=None):
            if "RETURN other.id AS id LIMIT 1" in query:
                return Result(["id"], [])
            if "RETURN d.id AS id, d.status AS status LIMIT 100" in query:
                return Result(["id", "status"], [["decision-1", "draft"]])
            if "RETURN c.id AS id, c.status AS status, c.revision AS revision" in query:
                return Result(["id", "status", "revision"], [["claim-1", "proposed", 1]])
            if "RETURN w.revision AS revision" in query:
                return Result(["revision"], [[2]])
            if "RETURN c.id AS id, c.statement AS statement, c.status AS status, c.revision AS revision" in query:
                return Result(["id", "statement", "status", "revision", "source_name", "source_text"], [["claim-1", "Original date is June 4", "proposed", 1, "Original notes", "The date is June 4."]])
            if "RETURN DISTINCT d.id AS id" in query:
                return Result(["id", "type", "statement", "status"], [])
            if "RETURN w.revision AS revision" in query:
                return Result(["revision"], [[2]])
            if "RETURN replacement.id AS id" in query:
                return Result(["id"], [[params["replacement_id"]]])
            return Result([], [])

        def query(self, query, params=None):
            statements.append((query, params or {}))
            if "CREATE (corr:Correction" in query:
                assert "old)-[:SUPPORTED_BY]" not in query
                assert "evidence_quote:$statement" in query
                assert "origin_type:'human_correction'" in query
                assert "confidence_kind:'human_correction'" in query

    store = RecallStore.__new__(RecallStore)
    graph = Graph()
    store._graph = lambda workspace_id: graph
    store._event = lambda graph, event_type, payload: None
    payload = SimpleNamespace(workspace_id="workspace-1", claim_id="claim-1", corrected_statement="The date is June 5.", reviewer_note=None, expected_workspace_revision=2, expected_claim_revision=1)

    result = store.apply_correction(payload)

    assert result["status"] == "applied"
    create = next(query for query, _ in statements if "CREATE (corr:Correction" in query)
    assert "CREATE (corr)-[:HAS_FRAGMENT]->(f)" in create
    assert "CREATE (replacement)-[:SUPPORTED_BY {role:'reviewer_correction'}]->(f)" in create


def test_correction_rechecks_alternative_support_and_holds_only_dependent_actions(monkeypatch):
    statements = []
    reads = []

    class Result:
        def __init__(self, headers, rows):
            self.header = [[1, name] for name in headers]
            self.result_set = rows

    class Graph:
        def ro_query(self, query, params=None):
            reads.append((query, params or {}))
            if "RETURN c.id AS id, c.status AS status, c.revision AS revision" in query:
                return Result(["id", "status", "revision"], [["claim-1", "proposed", 1]])
            if "RETURN w.revision AS revision" in query:
                return Result(["revision"], [[3]])
            if "RETURN other.id AS id LIMIT 1" in query:
                return Result(["id"], [])
            if "RETURN d.id AS id, d.status AS status LIMIT 100" in query:
                return Result(["id", "status"], [["decision-1", "draft"]])
            if "RETURN c.id AS id, c.statement AS statement, c.status AS status, c.revision AS revision" in query:
                return Result(["id", "statement", "status", "revision", "source_name", "source_text"], [["claim-1", "Old claim", "proposed", 1, "Source", "Old quote"]])
            if "RETURN DISTINCT d.id AS id" in query:
                return Result(["id", "type", "title", "statement", "status"], [["decision-1", "Decision", "Review", "Review the change", "draft"]])
            if "RETURN DISTINCT a.id AS id" in query:
                return Result(["id", "type", "title", "status", "decision_id"], [["action-1", "Action", "Follow up", "proposed", "decision-1"]])
            if "RETURN replacement.id AS id" in query:
                return Result(["id"], [[params["replacement_id"]]])
            return Result([], [])

        def query(self, query, params=None):
            statements.append(query)

    store = RecallStore.__new__(RecallStore)
    graph = Graph()
    store._graph = lambda workspace_id: graph
    store._event = lambda graph, event_type, payload: None
    payload = SimpleNamespace(workspace_id="workspace-1", claim_id="claim-1", corrected_statement="Corrected claim", reviewer_note=None, expected_workspace_revision=3, expected_claim_revision=1)

    result = store.apply_correction(payload)

    assert result["status"] == "applied"
    assert {record["type"] for record in result["affected"]} == {"Decision", "Action"}
    alternative_check = next(query for query, _ in reads if "RETURN other.id AS id LIMIT 1" in query)
    decision_review = next(query for query in statements if "SET d.status='needs_review'" in query)
    action_hold = next(query for query in statements if "SET a.status='held'" in query)
    assert "other.id <> $claim_id" in alternative_check and "other.status IN ['proposed','accepted']" in alternative_check
    assert "WHERE NOT EXISTS" not in decision_review
    assert "d.id IN $decision_ids" in action_hold


def test_claim_search_excludes_terminal_history(monkeypatch):
    import app.store as module

    class Result:
        header = [[1, "id"], [1, "status"]]
        result_set = []

    class Graph:
        def ro_query(self, query, params):
            assert "c.status IN ['proposed','accepted','contested']" in query
            return Result()

    store = RecallStore.__new__(RecallStore)
    monkeypatch.setattr(store, "_graph", lambda workspace_id: Graph())
    assert store.claims("workspace", None, 10) == []
