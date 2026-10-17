from types import SimpleNamespace

from app.agents import RecallAgents


class FakeGraph:
    def __init__(self):
        self.writes = []

    def query(self, query, params=None):
        self.writes.append((query, params or {}))


class FakeStore:
    def __init__(self, with_evidence=True):
        self.graph = FakeGraph()
        self.with_evidence = with_evidence
        self.events = []

    def _graph(self, workspace_id):
        return self.graph

    def search_current_claims(self, workspace_id, query, limit):
        return [{"id": "claim-1", "statement": "The synthetic launch is in June", "status": "proposed"}] if self.with_evidence else []

    def source_evidence(self, workspace_id, claim_ids):
        if not self.with_evidence or "claim-1" not in claim_ids:
            return []
        return [{"claim_id": "claim-1", "evidence_quote": "The synthetic launch is in June", "source_text": "Synthetic planning note."}]

    def _event(self, graph, event_type, payload):
        self.events.append((event_type, payload))


class FakeCall:
    def __init__(self, name, arguments, call_id="tool-1"):
        self.id = call_id
        self.function = SimpleNamespace(name=name, arguments=arguments)

    def model_dump(self, exclude_none=True):
        return {"id": self.id, "type": "function", "function": {"name": self.function.name, "arguments": self.function.arguments}}


class FakeCompletions:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return next(self.responses)


def response(content=None, tool_calls=None):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=tool_calls))])



def test_analyst_retrieves_graph_evidence_then_coordinator_writes_proposals(monkeypatch):
    import app.agents as module

    monkeypatch.setattr(module.settings, "vercel_ai_gateway_api_key", "test-only")
    monkeypatch.setattr(module.settings, "model_name", "unit-test-model")
    store = FakeStore()
    agent = RecallAgents.__new__(RecallAgents)
    agent.store = store
    completions = FakeCompletions([
        response(tool_calls=[FakeCall("search_claims", '{"query":"launch"}', "search-1")]),
        response('{"title":"Review launch timing","rationale":"The source says June.","claim_ids":["claim-1"],"action_title":"Confirm launch readiness","uncertainty":"Source is proposed."}'),
        response('{"title":"Review launch timing","rationale":"Evidence supports a review, not approval.","claim_ids":["claim-1"],"action_title":"Confirm launch readiness","uncertainty":"Source claim is still proposed."}'),
    ])
    agent.client = SimpleNamespace(chat=SimpleNamespace(completions=completions))

    result = agent.run_task("workspace-1", "Review the launch timing")

    assert len(completions.calls) == 3
    assert len(result["tool_calls"]) == 2
    assert result["tool_calls"][1]["tool"] == "retrieve_source_fragments"
    assert result["claim_ids"] == ["claim-1"]
    assert result["action_id"]
    assert result["status"] == "draft"
    assert any("HANDED_OFF_TO" in query for query, _ in store.graph.writes)
    assert any("USED_CLAIM" in query for query, _ in store.graph.writes)
    assert any("REQUIRES" in query for query, _ in store.graph.writes)
    assert store.events[0][0] == "agents.handoff.completed"


def test_coordinator_cannot_create_action_without_retrieved_support(monkeypatch):
    import app.agents as module

    monkeypatch.setattr(module.settings, "vercel_ai_gateway_api_key", "test-only")
    monkeypatch.setattr(module.settings, "model_name", "unit-test-model")
    store = FakeStore(with_evidence=False)
    agent = RecallAgents.__new__(RecallAgents)
    agent.store = store
    completions = FakeCompletions([
        response(tool_calls=[FakeCall("search_claims", '{"query":"unrelated"}', "search-1")]),
        response('{"title":"Unverified","rationale":"No evidence.","claim_ids":["fake-id"],"action_title":"Do something","uncertainty":"No source found."}'),
        response('{"title":"Unverified","rationale":"No source evidence supports this.","claim_ids":["fake-id"],"action_title":"Do something","uncertainty":"No source found."}'),
    ])
    agent.client = SimpleNamespace(chat=SimpleNamespace(completions=completions))

    result = agent.run_task("workspace-1", "Find unrelated information")

    assert result["claim_ids"] == []
    assert result["action_id"] is None
    assert result["status"] == "needs_review"
    assert not any("REQUIRES" in query for query, _ in store.graph.writes)
