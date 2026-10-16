# Demo script and recording checklist

**Do not record the full live demo until the documented prerequisites are connected and the workflow has passed acceptance checks.** No prerecorded or fabricated graph is acceptable.

1. Show system health and explain FalkorDB is the primary store and model calls route through Vercel AI Gateway.
2. Create a new private workspace (separate graph; fresh session token).
3. Paste a newly authored or permitted synthetic document with named facts; ingest and show the model-generated claim quotes and source span.
4. Inspect the persisted graph and open the source-backed claim; explain extraction confidence is not factual truth.
5. After decision/action agents are implemented, show actual run records, tool use, and handoff retrieved from persisted graph state.
6. Preview a correction, show affected paths and uncertainty; apply it, inspect held/review states, and show durable audit events.
7. Start a fresh session, retrieve the corrected state from FalkorDB, and show what was preserved and why.
8. Restart API and FalkorDB containers and verify persistence.

Record the actual commands, database/model versions, model-call status, and remaining limitations. Clearly label any authored example document synthetic. Do not claim the currently deferred agent or atomicity behavior works.
