from fastapi.testclient import TestClient

from app.main import RecallStore, app


class FakeAccountStore:
    def __init__(self):
        self.users = {}
        self.workspaces = {}
        self.user_workspaces = {}

    def find_user_by_email(self, email):
        return self.users.get(email)

    def create_account_user(self, user_id, email, password_hash):
        user = {"id": user_id, "email": email, "password_hash": password_hash}
        self.users[email] = user
        return user

    def create_workspace(self, workspace_id, name, owner_id=None):
        result = {"id": workspace_id, "name": name, "owner_id": owner_id, "created_at": "2026-01-01T00:00:00+00:00", "revision": 0}
        self.workspaces[workspace_id] = result
        return result

    def register_workspace(self, user_id, workspace):
        references = self.user_workspaces.setdefault(user_id, [])
        if not any(existing["id"] == workspace["id"] for existing in references):
            references.append(workspace)

    def workspaces_for_user(self, user_id):
        return list(reversed(self.user_workspaces.get(user_id, [])))

    def get_workspace(self, workspace_id):
        from app.store import GraphUnavailable
        if workspace_id not in self.workspaces:
            raise GraphUnavailable("Workspace not found")
        return self.workspaces[workspace_id]

    def overview(self, workspace_id):
        from app.store import GraphUnavailable
        if workspace_id not in self.workspaces:
            raise GraphUnavailable("Workspace not found")
        workspace = self.workspaces[workspace_id]
        return {"workspace": {"id": workspace_id, "name": workspace["name"], "revision": 0}, "counts": {"sources": 0, "claims": 0, "decisions": 0, "actions": 0, "investigations": 0}, "attention": []}


def test_email_signup_login_and_workspace_ownership():
    repository = FakeAccountStore()
    app.dependency_overrides[RecallStore] = lambda: repository
    client = TestClient(app)
    try:
        signup = client.post("/api/v1/auth/signup", json={"email": " Engineer@Example.com ", "password": "a-long-test-password"})
        assert signup.status_code == 201
        signed_up = signup.json()
        assert signed_up["user"]["email"] == "engineer@example.com"
        assert "password_hash" not in signed_up["user"]
        assert repository.users["engineer@example.com"]["password_hash"] != "a-long-test-password"

        duplicate = client.post("/api/v1/auth/signup", json={"email": "engineer@example.com", "password": "another-long-password"})
        assert duplicate.status_code == 409

        wrong_login = client.post("/api/v1/auth/login", json={"email": "engineer@example.com", "password": "wrong-password"})
        assert wrong_login.status_code == 401

        login = client.post("/api/v1/auth/login", json={"email": "engineer@example.com", "password": "a-long-test-password"})
        assert login.status_code == 200
        token = login.json()["access_token"]

        created = client.post("/api/v1/workspaces", headers={"Authorization": f"Bearer {token}"}, json={"name": "Engineering"})
        assert created.status_code == 201
        workspace = created.json()
        assert workspace["owner_id"] == signed_up["user"]["id"]
        assert workspace["access_token"]

        listed = client.get("/api/v1/workspaces", headers={"Authorization": f"Bearer {token}"})
        assert listed.status_code == 200
        assert len(listed.json()) == 1
        assert listed.json()[0]["id"] == workspace["id"]
        assert listed.json()[0]["access_token"]

        resumed = client.post(f"/api/v1/workspaces/{workspace['id']}/session", headers={"Authorization": f"Bearer {token}"})
        assert resumed.status_code == 200
        assert resumed.json()["access_token"]

        other = client.post("/api/v1/auth/signup", json={"email": "other@example.com", "password": "a-different-long-password"})
        other_token = other.json()["access_token"]
        forbidden = client.get(f"/api/v1/workspaces/{workspace['id']}/overview", headers={"Authorization": f"Bearer {other_token}"})
        assert forbidden.status_code == 403

        allowed = client.get(f"/api/v1/workspaces/{workspace['id']}/overview", headers={"Authorization": f"Bearer {token}"})
        assert allowed.status_code == 200
    finally:
        app.dependency_overrides.clear()
