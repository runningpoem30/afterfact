# Architecture overview

The initial implementation is a deliberately direct vertical slice: React/TypeScript UI → FastAPI HTTP API → FalkorDB workspace graph. The API calls the configured model through Vercel AI Gateway's OpenAI-compatible API for structured source extraction and agent reasoning; credentials remain server-side. React Flow only renders nodes and relationships returned by graph queries. Workspace identity comes from an expiring signed guest token and graph selection is derived server-side.

Writes currently preserve graph records and audit events, but multi-query correction writes are not atomic. No durable worker, SSE, multi-agent handoffs, or execution gateway exists yet; these are explicit limitations rather than simulated capabilities. API endpoints return truthful service errors when FalkorDB/model integration is unavailable.
