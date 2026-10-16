from openai import OpenAI

from .settings import settings


class ModelNotConfigured(RuntimeError):
    pass


def create_model_client(*, timeout: float = 30.0, max_retries: int = 1) -> OpenAI:
    """Build a server-side OpenAI-compatible client for Vercel AI Gateway."""
    if not settings.vercel_ai_gateway_api_key:
        raise ModelNotConfigured("VERCEL_AI_GATEWAY_API_KEY is not configured")
    return OpenAI(
        api_key=settings.vercel_ai_gateway_api_key,
        base_url=settings.vercel_ai_gateway_base_url,
        timeout=timeout,
        max_retries=max_retries,
    )
