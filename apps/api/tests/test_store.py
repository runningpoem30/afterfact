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
