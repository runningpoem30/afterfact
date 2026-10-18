from itsdangerous import URLSafeTimedSerializer
from fastapi.testclient import TestClient

from app.main import app, sessions, safe_graph_id
from app.auth import hash_password, verify_password


def test_graph_name_is_server_derived_and_rejects_arbitrary_names():
    assert safe_graph_id("9e879714-1f4a-4b2f-bb09-706189c5583f") == "recall_9e8797141f4a4b2fbb09706189c5583f"
    try:
        safe_graph_id("other-workspace")
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 404
    else:
        raise AssertionError("non-UUID workspace names must be rejected")


def test_expiring_workspace_tokens_bind_single_workspace():
    token = sessions.dumps({"workspace_id": "workspace-a"})
    assert sessions.loads(token)["workspace_id"] == "workspace-a"
    assert sessions.loads(token)["workspace_id"] != "workspace-b"


def test_health_endpoint_is_available_without_database_or_model():
    client = TestClient(app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert "falkordb" in response.json()["integrations"]
    assert "model" in response.json()["integrations"]


def test_password_hash_is_salted_and_verifiable():
    first = hash_password("a-long-test-password")
    second = hash_password("a-long-test-password")
    assert first != second
    assert verify_password("a-long-test-password", first)
    assert not verify_password("wrong-password", first)
