from app.store import RecallStore


def test_falkordb_connection_passes_host_auth_and_tls(monkeypatch):
    import app.store as module

    received = {}

    class FakeClient:
        def __init__(self, **kwargs):
            received.update(kwargs)

    monkeypatch.setattr(module.settings, "falkordb_host", "db.example.test")
    monkeypatch.setattr(module.settings, "falkordb_port", 16379)
    monkeypatch.setattr(module.settings, "falkordb_username", "falkordb")
    monkeypatch.setattr(module.settings, "falkordb_password", "local-test-password")
    monkeypatch.setattr(module.settings, "falkordb_ssl", True)
    monkeypatch.setattr(module, "FalkorDB", FakeClient)

    RecallStore()

    assert received["host"] == "db.example.test"
    assert received["port"] == 16379
    assert received["username"] == "falkordb"
    assert received["password"] == "local-test-password"
    assert received["ssl"] is True
