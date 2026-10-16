# Vercel AI Gateway configuration

RECALL uses the official OpenAI Python SDK against Vercel AI Gateway's OpenAI-compatible Chat Completions API. The documented base URL is `https://ai-gateway.vercel.sh/v1`.

## Configure locally

1. Copy the repository's `env.template` to the root `.env` file.
2. Add your key locally (never commit or paste it in chat):

   ```dotenv
   VERCEL_AI_GATEWAY_API_KEY=your-vercel-ai-gateway-key
   MODEL_NAME=openai/gpt-4o-mini
   ```

3. Select an enabled model ID from your Vercel AI Gateway account. RECALL needs a model that supports tool calls and JSON-mode output.
4. Run `docker compose up --build`. Compose passes the root `.env` only to the API container. Check `/api/v1/health`; it reports configuration, provider, and model, never the key.

`VERCEL_AI_GATEWAY_BASE_URL` defaults to the official endpoint. The backend reads only `VERCEL_AI_GATEWAY_API_KEY`; there is no fallback to a different provider or canned responses. Calls use your Vercel AI Gateway account and incur its applicable usage charges. Source text and prompts are sent to the selected Gateway/provider when extraction or agents run; check your Gateway/provider privacy and retention settings.

## FalkorDB username/password are separate

`FALKORDB_USERNAME` and `FALKORDB_PASSWORD` are optional FalkorDB ACL credentials, unrelated to Vercel. The local Compose service does not configure authentication, so leave both empty locally. If your hosted FalkorDB instance has ACL authentication enabled, use the database username/password issued by that service/admin. Don't make up values; the server must be configured with the matching user. The password belongs in the server-side `.env`, not frontend code or Git.
