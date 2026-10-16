from __future__ import annotations

import logging
import re
import uuid
from itsdangerous import URLSafeTimedSerializer, BadSignature
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .settings import settings
from .store import GraphUnavailable, RecallStore
from .extractor import ExtractorUnavailable, ModelExtractor

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("recall")
app = FastAPI(title="RECALL API", version="1.0.0", description="Evidence-backed agent memory repair")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
sessions = URLSafeTimedSerializer(settings.session_secret, salt="recall-workspace")


def store() -> RecallStore:
    try:
        return RecallStore()
    except Exception as exc:
        raise HTTPException(status_code=503, detail={"code": "falkordb_unavailable", "message": "FalkorDB is unavailable. Configure and start FalkorDB; RECALL will not substitute in-memory storage."}) from exc


class WorkspaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class SourceIn(BaseModel):
    workspace_id: str
    name: str = Field(min_length=1, max_length=240)
    content: str = Field(min_length=40, max_length=250_000)
    authority: str = Field(default="user_submitted", max_length=80)


class CorrectionIn(BaseModel):
    workspace_id: str
    claim_id: str
    corrected_statement: str = Field(min_length=8, max_length=2000)
    authority: str = Field(default="user_reviewed", max_length=80)


def safe_graph_id(workspace_id: str) -> str:
    # Graph names are derived server-side; a caller cannot choose a graph name.
    if not re.fullmatch(r"[0-9a-f-]{36}", workspace_id):
        raise HTTPException(404, "Workspace not found")
    return f"recall_{workspace_id.replace('-', '')}"


@app.get("/api/v1/health")
def health() -> dict[str, Any]:
    db_ok = False
    db_error = None
    try:
        db = RecallStore()
        db.ping()
        db_ok = True
    except Exception as exc:
        db_error = type(exc).__name__
    model_ok = bool(settings.openai_api_key)
    return {"status": "ok" if db_ok else "degraded", "integrations": {"falkordb": {"configured": bool(settings.falkordb_host), "available": db_ok, "error": db_error}, "model": {"configured": model_ok, "provider": settings.model_provider if model_ok else None, "model": settings.model_name if model_ok else None}}, "capabilities": {"source_ingestion": db_ok and model_ok, "correction_repair": db_ok, "agents": db_ok and model_ok}}


@app.post("/api/v1/workspaces", status_code=201)
def create_workspace(payload: WorkspaceIn) -> dict[str, Any]:
    workspace_id = str(uuid.uuid4())
    result = store().create_workspace(workspace_id, payload.name)
    result["access_token"] = sessions.dumps({"workspace_id": workspace_id})
    return result


def authorize_workspace(workspace_id: str, access_token: str | None = None) -> None:
    # Local isolated guest token. Production deployments should replace this with established auth.
    token = access_token
    if not token:
        raise HTTPException(401, "Workspace session required")
    try:
        claims = sessions.loads(token, max_age=60 * 60 * 24)
    except BadSignature as exc:
        raise HTTPException(401, "Workspace session expired or invalid") from exc
    if claims.get("workspace_id") != workspace_id:
        raise HTTPException(403, "Workspace access denied")
    try:
        store().get_workspace(workspace_id)
    except GraphUnavailable as exc:
        raise HTTPException(404, "Workspace not found") from exc


@app.get("/api/v1/workspaces/{workspace_id}/overview")
def overview(workspace_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    safe_graph_id(workspace_id)
    authorize_workspace(workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    return store().overview(workspace_id)


@app.get("/api/v1/workspaces/{workspace_id}/graph")
def graph(workspace_id: str, limit: int = 120, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    safe_graph_id(workspace_id)
    authorize_workspace(workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    if not 1 <= limit <= 300:
        raise HTTPException(422, "limit must be between 1 and 300")
    return store().graph_data(workspace_id, limit)


@app.get("/api/v1/workspaces/{workspace_id}/sources")
def sources(workspace_id: str, authorization: str | None = Header(default=None)) -> list[dict[str, Any]]:
    safe_graph_id(workspace_id)
    authorize_workspace(workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    return store().sources(workspace_id)


@app.post("/api/v1/sources", status_code=201)
def ingest_source(payload: SourceIn, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    safe_graph_id(payload.workspace_id)
    authorize_workspace(payload.workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    # Do not persist a half-ingested source when the required model is unavailable.
    if not settings.openai_api_key:
        raise HTTPException(503, detail={"code": "model_unconfigured", "message": "Set OPENAI_API_KEY to extract and validate claims. Source ingestion requires a real model call."})
    try:
        claims = ModelExtractor().extract(payload.content)
    except ExtractorUnavailable as exc:
        raise HTTPException(502, detail={"code": "extraction_failed", "message": str(exc)}) from exc
    source_id = str(uuid.uuid4())
    # Validate every evidence quote against submitted content before graph writes.
    for claim in claims:
        quote = claim.get("evidence_quote", "")
        if not quote or quote not in payload.content:
            raise HTTPException(422, detail={"code": "invalid_provenance", "message": "Model returned a claim whose evidence quote is not an exact source substring."})
    try:
        return store().ingest_source(payload, source_id, claims)
    except GraphUnavailable as exc:
        raise HTTPException(503, detail={"code": "falkordb_unavailable", "message": str(exc)}) from exc


@app.post("/api/v1/sources/upload", status_code=201)
async def upload_source(workspace_id: str, file: UploadFile = File(...), authorization: str | None = Header(default=None)) -> dict[str, Any]:
    safe_graph_id(workspace_id)
    authorize_workspace(workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    if not file.filename or not file.filename.lower().endswith((".txt", ".md", ".csv", ".json")):
        raise HTTPException(415, "Upload a .txt, .md, .csv, or .json file")
    raw = await file.read(settings.max_upload_bytes + 1)
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(413, "Upload exceeds configured size limit")
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(415, "File must be UTF-8 text") from exc
    return ingest_source(SourceIn(workspace_id=workspace_id, name=file.filename, content=content))


@app.get("/api/v1/workspaces/{workspace_id}/claims")
def claims(workspace_id: str, q: str | None = None, limit: int = 100, authorization: str | None = Header(default=None)) -> list[dict[str, Any]]:
    safe_graph_id(workspace_id)
    authorize_workspace(workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    return store().claims(workspace_id, q, min(max(limit, 1), 200))


@app.get("/api/v1/workspaces/{workspace_id}/events")
def events(workspace_id: str, after: int = 0, limit: int = 100, authorization: str | None = Header(default=None)) -> list[dict[str, Any]]:
    safe_graph_id(workspace_id)
    authorize_workspace(workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    return store().events(workspace_id, after, min(max(limit, 1), 200))


@app.post("/api/v1/corrections/preview")
def preview_correction(payload: CorrectionIn, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    safe_graph_id(payload.workspace_id)
    authorize_workspace(payload.workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    return store().preview_correction(payload)


@app.post("/api/v1/corrections/apply")
def apply_correction(payload: CorrectionIn, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    safe_graph_id(payload.workspace_id)
    authorize_workspace(payload.workspace_id, authorization.removeprefix("Bearer ") if authorization else None)
    return store().apply_correction(payload)
