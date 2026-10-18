# Afterhack deployment plan

## Recommended shape

```text
Browser
  ├─ Vercel: static React/Vite frontend
  └─ HTTPS API: FastAPI app (Python)
       ├─ FalkorDB Cloud: persistent graph database
       └─ Vercel AI Gateway: server-side model calls
```

FalkorDB is the source of truth for sources, claims, graph links, decisions, actions, corrections and audit events. It is not an application server: it cannot serve the React UI, authenticate users to Afterhack, validate uploads, call models safely, or run the application business rules. The FastAPI service remains necessary as a trusted server-side boundary for credentials, workspace authorization, extraction validation, orchestration, and writes.

## Frontend: Vercel

The current Vite app can be deployed as a Vercel static site. Configure the project root to `apps/web` and use the Vite build command/output (`npm run build`, `dist`). Set `VITE_API_BASE_URL` to the public HTTPS API origin and update the frontend API helper to use that value. Do not put the Gateway or FalkorDB credentials in any `VITE_*` variable; Vite embeds those values in the browser bundle.

The frontend currently proxies `/api` only in local Vite development. A production deployment needs an API origin or a same-origin Vercel rewrite. Prefer a single public site origin with a Vercel rewrite to the API if the API host supports it, so browser session/auth rules and CORS stay simple.

## API: deploy a persistent Python service

Deploy the existing API container (`apps/api/Dockerfile`) to a long-running container platform that supports Python containers, HTTPS, environment secrets, outbound connections, and health checks. **Northflank is a reasonable first candidate** because it builds/deploys Dockerized services from Git and provides runtime secrets, persistent services, and deployment domains; it is not provisioned or tested here yet. AWS App Runner or ECS Fargate are alternatives if you prefer AWS. A serverless Vercel Python function is possible only after checking runtime, request-duration, multipart, connection reuse, and workload limits; don't assume it will run the current app unchanged.

Set server-only variables in the API deployment:
- `FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USERNAME`, `FALKORDB_PASSWORD`, `FALKORDB_SSL` from the chosen FalkorDB deployment.
- `VERCEL_AI_GATEWAY_API_KEY`, `VERCEL_AI_GATEWAY_BASE_URL`, `MODEL_NAME`.
- A fresh random `SESSION_SECRET`, plus correct allowed frontend origins in `CORS_ORIGINS`.
- Upload limits and timeouts appropriate for the service.

Never copy secrets into Vercel frontend environment variables, source code, build logs, or this repository.

## Graph database: FalkorDB Cloud

For a hackathon/demo, FalkorDB Cloud avoids operating the graph server yourself. Copy host/port from the instance **Connectivity** tab and username/password from **Instance Details**. Confirm TLS for the tier and set `FALKORDB_SSL` accordingly. The Free tier is useful for short testing, but the provider documents limits and inactivity deletion; verify current durability/backup guarantees before relying on it for production. The app has isolated graphs per workspace, but shared database credentials still belong only on the API server.

## Authentication and signup

Do not launch a public “signup” page that only creates an anonymous workspace and describe it as user authentication. Current guest workspaces have signed, expiring tokens stored in browser local storage; this is suitable for a controlled local demo, not public multi-user production. Before public user signup, integrate an established identity provider (for example, Auth0, Clerk, or Amazon Cognito), derive workspace membership from the verified identity on the API, and add quotas, abuse controls, deletion/export, retention, and rate limits. Keep the guest workspace flow clearly labeled for the first live demo.

## Sequence

1. Finish dark Afterhack UI and browser-driven guest journey locally.
2. Verify FalkorDB restart persistence and multi-hop correction tests against the local Compose database.
3. Deploy FalkorDB Cloud and API privately; verify API health and real model calls from the deployed service.
4. Deploy frontend on Vercel with only the public API URL configured.
5. Add production origin/CORS and session configuration; verify isolation between two newly created workspaces.
6. Add OAuth/signup only after authorization is moved to an established identity provider.
7. Run the complete browser workflow against deployed services and record limitations before publishing the demo.

No deployment has been created or claimed by this document. Cloud provider, costs, region, public API URL, and production credentials remain undecided.
