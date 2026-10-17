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
