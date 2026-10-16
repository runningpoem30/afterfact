from app.model_client import ModelNotConfigured, create_model_client


def test_vercel_gateway_client_uses_configured_key_and_base_url(monkeypatch):
    import app.model_client as module

    monkeypatch.setattr(module.settings, "vercel_ai_gateway_api_key", "unit-test-secret")
    monkeypatch.setattr(module.settings, "vercel_ai_gateway_base_url", "https://ai-gateway.example.test/v1")
    client = create_model_client(timeout=7, max_retries=0)
    assert client.api_key == "unit-test-secret"
    assert str(client.base_url) == "https://ai-gateway.example.test/v1/"
    assert client.timeout == 7


def test_model_client_fails_clearly_without_gateway_key(monkeypatch):
    import app.model_client as module

    monkeypatch.setattr(module.settings, "vercel_ai_gateway_api_key", None)
    try:
        create_model_client()
    except ModelNotConfigured as exc:
        assert "VERCEL_AI_GATEWAY_API_KEY" in str(exc)
    else:
        raise AssertionError("missing gateway credentials must not fall back to another provider")
