from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, Header, HTTPException, status
from fastapi.responses import RedirectResponse, Response
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from pathlib import Path
import asyncio
import copy
import re
import hashlib
import uuid
import threading

from core.security import verify_supabase_jwt
from core.constants import MAX_FILE_SIZE_BYTES, SUPPORTED_FILE_EXTENSIONS
from api.dependencies import get_resume_repository, get_storage_service, user_scoped_db_context
from repositories.resume_repository import ResumeRepository
from services.storage.file_service import FileService
from services.resume.parser import ResumeParser
from services.resume.source_preservation import (
    achievement_certificate_lines,
    restore_source_evidence,
)
from services.resume.recovery_engine import ResumeRecoveryAgent
from services.ai.ai_service import AIService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from core.database import get_db_connection
from core.logging import logger
from schemas.resume_intelligence import (
    SelectedResumeConfirmationRequest,
    SelectedResumeIntelligenceRequest,
)
from schemas.resume import ResumeLayoutModel
from schemas.layout_intelligence import (
    LayoutIntelligenceRequest,
    LayoutIntelligenceResponse,
)
from services.layout_intelligence import LayoutIntelligenceService
from services.resume_intelligence.models import Phase2Output
from services.resume_intelligence.semantic import DeepSeekSemanticAnalyzer
from services.resume_intelligence.service import SelectedResumeIntelligenceService
from services.subscriptions.usage_service import UsageService
from services.workflow.checkpoints import PostgresCheckpointStore
from core.config import settings

router = APIRouter(prefix="/resumes", tags=["resumes"])
_local_reconciliation_lock = threading.Lock()
_locally_reconciled_users: set[str] = set()


def _extract_resume_source(content: bytes, filename: str) -> tuple[str, dict[str, str]]:
    """CPU-bound source extraction, kept outside the asyncio event loop."""
    return (
        ResumeParser.extract_text(content, filename),
        ResumeParser.extract_links(content, filename),
    )


def _emit_resume_uploaded_event(
    user_id: str,
    resume_id: str,
    file_name: str,
    file_size: int,
) -> None:
    """Persist non-critical analytics after the HTTP response is sent."""
    with user_scoped_db_context(user_id) as analytics_conn:
        AnalyticsService(analytics_conn).emit_event(
            user_id=user_id,
            event_type="RESUME_UPLOADED",
            resource_type="resume",
            resource_id=resume_id,
            metadata={"file_name": file_name, "file_size": file_size},
        )


@router.post(
    "/{resume_id}/layout/recommendation",
    response_model=LayoutIntelligenceResponse,
)
def recommend_resume_layout(
    resume_id: str,
    payload: LayoutIntelligenceRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
):
    """Recommend a renderer-neutral plan without mutating the saved layout."""
    record = repo.get_by_id(resume_id, user["id"])
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")
    resume = record.get("parsed_content") or {}
    if not isinstance(resume, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Stored resume content is invalid.",
        )
    result = LayoutIntelligenceService().build_plan(resume, payload)
    logger.info(
        "[LAYOUT-INTELLIGENCE] recommendation resume_id=%s strategy=%s "
        "confidence=%s overridden=%s sections=%s",
        resume_id,
        result.layout_strategy.recommended_strategy,
        result.layout_strategy.confidence,
        result.layout_strategy.overridden_by_user,
        result.layout_plan.section_order,
    )
    return result


def _resume_intelligence_service(
    *,
    user_id: str,
    repo: ResumeRepository,
    storage: FileService,
) -> SelectedResumeIntelligenceService:
    parser_service = AIService()
    semantic_analyzer = DeepSeekSemanticAnalyzer()
    return SelectedResumeIntelligenceService(
        repository=repo,
        storage=storage,
        # PostgresCheckpointStore takes a connection FACTORY, not one bound
        # connection: this pipeline runs multiple LLM steps and writes a
        # checkpoint after each one, so a single persistent connection here
        # would sit open (and idle) for the entire multi-step, multi-second
        # duration instead of just each individual checkpoint write. See
        # docs/KNOWN_ISSUES.md ISSUE-005.
        checkpoint_store=PostgresCheckpointStore(
            lambda: user_scoped_db_context(user_id), owner_id=user_id
        ),
        structured_parser=parser_service.parse_resume,
        semantic_analyzer=semantic_analyzer,
    )


@router.post("/{resume_id}/intelligence", response_model=Phase2Output)
def build_selected_resume_intelligence(
    resume_id: str,
    payload: SelectedResumeIntelligenceRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
):
    service = _resume_intelligence_service(
        user_id=user["id"],
        repo=repo,
        storage=storage,
    )
    return service.run(
        request_id=payload.request_id,
        user_id=user["id"],
        selected_resume_id=resume_id,
        user_confirmed=payload.user_confirmed,
        selected_resume_version=payload.selected_resume_version,
        selected_resume_fingerprint=payload.selected_resume_fingerprint,
    )


@router.post(
    "/{resume_id}/intelligence/{workflow_id}/confirm",
    response_model=Phase2Output,
)
def confirm_selected_resume_intelligence(
    resume_id: str,
    workflow_id: str,
    payload: SelectedResumeConfirmationRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
):
    service = _resume_intelligence_service(
        user_id=user["id"],
        repo=repo,
        storage=storage,
    )
    return service.confirm(
        workflow_id=workflow_id,
        selected_resume_id=resume_id,
        confirmed=payload.confirmed,
    )


@router.post("/upload")
async def upload_and_parse(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    resume_repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
    conn = Depends(get_db_connection)
):
    ext = file.filename.split(".")[-1].upper()
    if ext not in SUPPORTED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format. Allowed: {SUPPORTED_FILE_EXTENSIONS}"
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds limits."
        )

    unique_path = f"{user['id']}/{uuid.uuid4()}_{file.filename}"
    usage_request_id = f"resume-upload:{uuid.uuid4()}"
    usage = UsageService(conn)
    await asyncio.to_thread(
        usage.consume_usage,
        user["id"],
        "resume_upload",
        1,
        usage_request_id,
        {"file_name": file.filename},
        False,
    )

    try:
        (raw_text, source_links), stored_path = await asyncio.gather(
            asyncio.to_thread(_extract_resume_source, content, file.filename),
            asyncio.to_thread(
                storage.upload_file,
                "original-resumes",
                unique_path,
                content,
                file.content_type,
            ),
        )
    except Exception:
        # The quota reservation must not charge a failed upload.
        await asyncio.to_thread(
            usage.credit_usage,
            user["id"],
            "resume_upload",
            1,
            {"reason": "resume_upload_failed", "request_id": usage_request_id},
        )
        raise
    logger.info(
        "[RESUME][BACKEND] Resume file stored user_id=%s file_name=%s "
        "size=%s storage_path=%s",
        user["id"],
        file.filename,
        len(content),
        stored_path,
    )

    parsed_res = {
        "raw_text": raw_text,
        "links": source_links,
        "parse_status": "pending",
    }
    try:
        record = await asyncio.to_thread(
            resume_repo.create,
            user_id=user["id"],
            file_path=unique_path,
            file_name=file.filename,
            file_size=len(content),
            file_type=ext,
            parsed_content=parsed_res,
            source_fingerprint=hashlib.sha256(content).hexdigest(),
        )
    except Exception:
        await asyncio.to_thread(
            usage.credit_usage,
            user["id"],
            "resume_upload",
            1,
            {"reason": "resume_record_failed", "request_id": usage_request_id},
        )
        raise
    logger.info(
        "[RESUME][BACKEND] Resume upload completed user_id=%s resume_id=%s "
        "file_name=%s parsing_status=pending",
        user["id"],
        record.get("id"),
        record.get("file_name"),
    )

    record["parsed_content"] = parsed_res
    record["parsing_status"] = "pending"
    
    background_tasks.add_task(
        _emit_resume_uploaded_event,
        user["id"],
        str(record["id"]),
        file.filename,
        len(content),
    )
    
    return record


@router.get("/")
def list_resumes(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    from services.cache.redis_cache import redis_cache
    import json

    cache_key = f"resumes_list:{user['id']}"
    cached = redis_cache.get(cache_key)
    if cached:
        try:
            return json.loads(cached) if isinstance(cached, str) else cached
        except Exception:
            pass

    resumes = repo.list_by_user(user["id"])
    redis_cache.set(cache_key, resumes, ttl_seconds=300)
    return resumes


def _scan_and_recover_local_resumes(user_id: str, user_dir: Path) -> Dict[str, Any]:
    """Runs off the event loop via asyncio.to_thread (see the route below).

    Scanning/hashing/parsing every local file is real disk + CPU work, and
    the original version of this route did it directly inside `async def`
    with no `await` anywhere -- blocking the single asyncio event loop for
    its full duration on every call. Combined with resolving `repo` through
    FastAPI's Depends() chain (which holds one pooled DB connection for the
    entire request), and this endpoint being fired on nearly every
    `fetchResumesList()` call from the frontend, concurrent hits serialized
    behind each other (visible as stacked ~5s increments in production
    logs, matching this route's own 5s pool-checkout-retry ceiling) while
    holding connections the whole time -- exhausting the pool. Only the
    fast DB reads/writes below use a connection now, opened and released
    around just those calls (see user_scoped_db_context), never held across
    the file I/O/hashing/parsing.
    """
    with user_scoped_db_context(user_id) as conn:
        known_paths = ResumeRepository(conn).all_file_paths(user_id)

    local_files = sorted(
        (path for path in user_dir.iterdir() if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    known_content_hashes = {
        hashlib.sha256(path.read_bytes()).hexdigest()
        for path in local_files
        if f"{user_id}/{path.name}" in known_paths
    }
    pending: list[Dict[str, Any]] = []
    logged_duplicate_hashes: set[str] = set()
    for local_file in local_files:
        relative_path = f"{user_id}/{local_file.name}"
        if relative_path in known_paths:
            continue

        display_name = re.sub(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
            r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_",
            "",
            local_file.name,
        )
        data = local_file.read_bytes()
        content_hash = hashlib.sha256(data).hexdigest()
        if content_hash in known_content_hashes:
            if content_hash not in logged_duplicate_hashes:
                logger.info(
                    "[RESUME][BACKEND] Duplicate orphan file skipped "
                    "user_id=%s file_name=%s",
                    user_id,
                    display_name,
                )
                logged_duplicate_hashes.add(content_hash)
            continue
        try:
            raw_text = ResumeParser.extract_text(data, display_name)
        except Exception as exc:
            logger.warning(
                "[RESUME][BACKEND] Recovered file text extraction skipped "
                "user_id=%s file_name=%s error=%s",
                user_id,
                display_name,
                str(exc),
            )
            raw_text = ""

        known_content_hashes.add(content_hash)
        pending.append({
            "relative_path": relative_path,
            "display_name": display_name,
            "file_size": len(data),
            "file_type": local_file.suffix.lstrip(".").upper() or "PDF",
            "raw_text": raw_text,
            "uploaded_at": datetime.fromtimestamp(local_file.stat().st_mtime, tz=timezone.utc),
            "content_hash": content_hash,
        })

    recovered: list[Dict[str, Any]] = []
    active = None
    if pending:
        with user_scoped_db_context(user_id) as conn:
            repo = ResumeRepository(conn)
            for item in pending:
                record = repo.recover_local_file(
                    user_id=user_id,
                    file_path=item["relative_path"],
                    file_name=item["display_name"],
                    file_size=item["file_size"],
                    file_type=item["file_type"],
                    parsed_content={"raw_text": item["raw_text"], "parse_status": "pending"},
                    uploaded_at=item["uploaded_at"],
                    source_fingerprint=item["content_hash"],
                )
                if record:
                    recovered.append(record)
            if recovered:
                active = repo.activate(str(recovered[0]["id"]), user_id)

    return {
        "recovered": len(recovered),
        "active_resume_id": active.get("id") if active else None,
    }


@router.post("/reconcile-local")
async def reconcile_local_resumes(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    storage: FileService = Depends(get_storage_service),
):
    base_dir = getattr(storage, "base_dir", None)
    if not base_dir:
        return {"recovered": 0, "active_resume_id": None}

    user_dir = Path(base_dir) / "original-resumes" / user["id"]
    if not user_dir.exists():
        return {"recovered": 0, "active_resume_id": None}

    with _local_reconciliation_lock:
        if user["id"] in _locally_reconciled_users:
            return {"recovered": 0, "active_resume_id": None}
        # Reserve the scan before starting it so concurrent frontend views do
        # not launch duplicate disk/hash/database recovery work.
        _locally_reconciled_users.add(user["id"])

    try:
        result = await asyncio.to_thread(_scan_and_recover_local_resumes, user["id"], user_dir)
    except Exception:
        with _local_reconciliation_lock:
            _locally_reconciled_users.discard(user["id"])
        raise

    logger.info(
        "[RESUME][BACKEND] Local resume reconciliation completed "
        "user_id=%s recovered=%s active_resume_id=%s",
        user["id"],
        result["recovered"],
        result["active_resume_id"],
    )
    return result


def _recover_active_resume_content(resume_id: str, user_id: str, file_path: str, file_name: Optional[str]) -> None:
    """Runs off the request path (see get_active_resume below) -- re-parses a
    resume file via LLM to backfill parsed_content.experience when it's
    missing. This used to run inline on every GET /resumes/active for any
    affected record, turning what should be a fast read into a multi-second
    (or, on repeat visits, repeatedly multi-second) LLM call. Opens its own
    connection since the request's connection is long gone by the time a
    background task runs after the response is sent."""
    try:
        storage = get_storage_service()
        logger.info("[RESUME][BUCKET] Active resume parsed_content incomplete. Loading file from storage bucket path=%s", file_path)
        file_bytes = storage.download_file("original-resumes", file_path)
        raw_text = ResumeParser.extract_text(file_bytes, file_name or "resume.pdf")
        source_links = ResumeParser.extract_links(file_bytes, file_name or "resume.pdf")
        if not raw_text:
            return

        ai = AIService()
        parsed_res = ai.parse_resume(raw_text)
        updated_content = parsed_res.dict()
        updated_content = restore_source_evidence(updated_content, raw_text, source_links)
        updated_content["raw_text"] = raw_text
        updated_content["parse_status"] = "parsed"

        with user_scoped_db_context(user_id) as conn:
            ResumeRepository(conn).update_parsed_content(resume_id, user_id, updated_content)
    except Exception as exc:
        logger.warning("[RESUME][BUCKET] Failed to auto-recover resume from storage bucket: %s", exc)


@router.get("/active")
async def get_active_resume(
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
):
    record = repo.get_active(user["id"])
    if not record:
        return None

    parsed_content = record.get("parsed_content") or {}
    has_experience = isinstance(parsed_content, dict) and bool(parsed_content.get("experience"))
    file_path = record.get("file_path")

    if not has_experience and file_path:
        # Return the record as-is now; the recovered content lands on the
        # NEXT read once the background task finishes, instead of blocking
        # this one behind a multi-second LLM re-parse.
        background_tasks.add_task(
            _recover_active_resume_content,
            record["id"], user["id"], file_path, record.get("file_name"),
        )

    return record


@router.get("/{resume_id}/file")
def get_resume_file(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service)
):
    record = repo.get_by_id(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )
    signed_url = storage.create_signed_download_url(
        "original-resumes", record["file_path"], expires_in=60
    )
    if signed_url:
        return RedirectResponse(
            url=signed_url,
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
            headers={"Cache-Control": "private, max-age=45"},
        )
    try:
        file_bytes = storage.download_file("original-resumes", record["file_path"])
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This resume's original file is no longer available in storage. Please re-upload it."
        )
    media_type = "application/pdf" if (record.get("file_type") or "").lower() == "pdf" else "application/octet-stream"
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{record.get("file_name") or "resume"}"'}
    )


@router.get("/{resume_id}/preview")
def preview_resume_file(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service)
):
    return get_resume_file(resume_id, user, repo, storage)


@router.post("/{resume_id}/activate")
async def activate_resume(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    record = repo.activate(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )
    return record


@router.post("/{resume_id}/mark-used")
async def mark_resume_used(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    record = repo.mark_used(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resume not found, not active, or not owned by current user."
        )
    return record


@router.put("/{resume_id}/layout")
async def save_resume_layout(
    resume_id: str,
    layout: ResumeLayoutModel,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
):
    record = repo.update_layout(resume_id, user["id"], layout.model_dump(mode="json"))
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")
    return {
        "resume_id": record["id"],
        "template_id": layout.template_id,
        "layout_version": layout.layout_version,
        "header_config": layout.header.model_dump(mode="json"),
        "main_column_order": layout.main_column,
        "sidebar_order": layout.sidebar,
        "hidden_sections": getattr(layout, "hidden_sections", []),
        "updated_at": record.get("updated_at"),
    }


@router.delete("/{resume_id}")
async def delete_resume(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    success = repo.soft_delete(resume_id, user["id"])
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found or already deleted."
        )
    return {"status": "success", "message": "Resume soft-deleted."}


@router.put("/{resume_id}/rename")
async def rename_resume(
    resume_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    new_name = payload.get("file_name") or payload.get("name")
    if not new_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_name is required.")
    with repo.conn.cursor() as cur:
        cur.execute(
            "UPDATE public.resumes SET file_name = %s, updated_at = NOW() WHERE id = %s AND user_id = %s AND deleted_at IS NULL RETURNING id",
            (new_name, resume_id, user["id"])
        )
        if not cur.fetchone():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")
        repo.conn.commit()
    return {"status": "success", "message": "Resume renamed successfully.", "file_name": new_name}


@router.post("/{resume_id}/parse")
async def parse_existing_resume(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    storage: FileService = Depends(get_storage_service),
):
    # Deliberately not using Depends(get_resume_repository)/Depends(get_db_connection)
    # -- those resolve to ONE pooled connection held for this entire request, but
    # this handler makes an LLM call (ai.parse_resume, several seconds) in between
    # the read and the write. Confirmed this was on the hot path for
    # handleCompareActiveResumeToJob (frontend/src/context/AppContext.jsx), which
    # blocks on this endpoint before it can even start the tailoring LLM call in
    # /api/compare, and /api/compare itself already documents and avoids this
    # exact anti-pattern (see docs/KNOWN_ISSUES.md ISSUE-005) -- this endpoint
    # just hadn't been fixed to match. Each DB phase opens its own short-lived
    # connection instead, so nothing sits idle in the pool across the LLM call.
    with user_scoped_db_context(user["id"]) as read_conn:
        record = ResumeRepository(read_conn).get_by_id(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )

    parsed_content = record.get("parsed_content") or {}
    raw_text = parsed_content.get("raw_text")

    if not raw_text and record.get("file_path"):
        try:
            logger.info("[RESUME][BUCKET] Downloading resume file from storage bucket path=%s", record["file_path"])
            file_bytes = storage.download_file("original-resumes", record["file_path"])
            file_name = record.get("file_name") or "resume.pdf"
            raw_text = ResumeParser.extract_text(file_bytes, file_name)
            source_links = ResumeParser.extract_links(file_bytes, file_name)
            parsed_content["raw_text"] = raw_text
            parsed_content["links"] = source_links
        except Exception as exc:
            logger.error("[RESUME][BUCKET] Failed to download resume from storage bucket path=%s error=%s", record.get("file_path"), exc)

    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No raw text could be extracted from resume file in storage bucket."
        )

    from fastapi.concurrency import run_in_threadpool
    ai = AIService()
    parsed_res = await run_in_threadpool(ai.parse_resume, raw_text)

    updated_content = parsed_res.dict()
    source_links = dict(parsed_content.get("links") or {})
    if record.get("file_path") and str(record.get("file_type") or "").lower() == "pdf":
        try:
            source_bytes = storage.download_file("original-resumes", record["file_path"])
            source_links.update(ResumeParser.extract_links_from_pdf(source_bytes))
        except Exception as exc:
            logger.warning(
                "[RESUME][BACKEND] Source link recovery unavailable resume_id=%s error=%s",
                resume_id,
                exc,
            )
    updated_content = restore_source_evidence(updated_content, raw_text, source_links)
    updated_content["raw_text"] = raw_text
    updated_content["parse_status"] = "parsed"

    with user_scoped_db_context(user["id"]) as write_conn:
        success = ResumeRepository(write_conn).update_parsed_content(resume_id, user["id"], updated_content)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update parsed resume content in database."
            )
        AnalyticsService(write_conn).emit_event(
            user_id=user["id"],
            event_type="RESUME_PARSED",
            resource_type="resume",
            resource_id=resume_id,
            metadata={"source": "on-demand"}
        )

    record["parsed_content"] = updated_content
    return record


@router.post("/{resume_id}/recover-source")
async def recover_resume_source_details(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
):
    """Recover a lossless canonical structure from stored source evidence."""
    record = repo.get_by_id(resume_id, user["id"])
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")
    parsed_content = record.get("parsed_content") or {}
    if not isinstance(parsed_content, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Stored resume content is invalid.",
        )
    raw_text = str(parsed_content.get("raw_text") or "")
    source_links = dict(parsed_content.get("links") or {})
    if record.get("file_path") and str(record.get("file_type") or "").lower() == "pdf":
        try:
            source_bytes = storage.download_file("original-resumes", record["file_path"])
            source_links.update(ResumeParser.extract_links_from_pdf(source_bytes))
        except Exception as exc:
            logger.warning(
                "[RESUME][BACKEND] Source link recovery unavailable resume_id=%s error=%s",
                resume_id,
                exc,
            )
    recovery = ResumeRecoveryAgent().recover(
        parsed_content,
        raw_text,
        source_metadata={
            "resume_id": resume_id,
            "parser_status": record.get("parsing_status"),
            "file_type": record.get("file_type"),
        },
    )
    recovered = recovery.recovered_resume
    recovered["links"] = {**(recovered.get("links") or {}), **source_links}
    if not repo.update_parsed_content(resume_id, user["id"], recovered):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist recovered resume source details.",
        )
    record["parsed_content"] = recovered
    record["parsing_status"] = record.get("parsing_status") or recovered.get("parse_status")
    logger.info(
        "[RESUME-RECOVERY] completed resume_id=%s links=%s sections=%s "
        "warnings=%s confidence=%.2f",
        resume_id,
        len(source_links),
        len(recovery.canonical_resume.get("sections") or []),
        len(recovery.recovery_warnings),
        recovery.confidence,
    )
    return record


# =============================================================================
# RESUME VERSIONING & USAGE INTELLIGENCE ENDPOINTS
# =============================================================================

@router.get("/{resume_id}/versions")
def list_resume_versions(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    return repo.list_versions(resume_id, user["id"])


@router.post("/{resume_id}/versions")
async def create_resume_version(
    resume_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    try:
        ver = repo.create_version(
            user_id=user["id"],
            resume_id=resume_id,
            version_name=payload.get("version_name"),
            version_type=payload.get("version_type", "tailored"),
            content=payload.get("content"),
            parent_version_id=payload.get("parent_version_id"),
            jd_id=payload.get("jd_id"),
            job_id=payload.get("job_id"),
            ats_score=payload.get("ats_score"),
            resume_match_score=payload.get("resume_match_score"),
            change_summary_json=payload.get("change_summary_json"),
            changes_summary=payload.get("changes_summary"),
            file_url=payload.get("file_url"),
            is_current=payload.get("is_current", True),
            is_final=payload.get("is_final", False),
            ats_engine_version=payload.get("ats_engine_version", "v2.4"),
            match_engine_version=payload.get("match_engine_version", "v2.4"),
            resume_content_hash=payload.get("resume_content_hash"),
            jd_content_hash=payload.get("jd_content_hash"),
        )
        return ver
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create version: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create version.")


@router.post("/{resume_id}/versions/{version_id}/set-current")
async def set_current_resume_version(
    resume_id: str,
    version_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    ver = repo.set_current_version(resume_id, version_id, user["id"])
    if not ver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
    return ver


@router.put("/{resume_id}/versions/{version_id}")
async def update_resume_version(
    resume_id: str,
    version_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    ver = repo.update_version(
        resume_id=resume_id,
        version_id=version_id,
        user_id=user["id"],
        version_name=payload.get("version_name"),
        version_type=payload.get("version_type")
    )
    if not ver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")
    return ver


@router.post("/{resume_id}/versions/{version_id}/duplicate")
async def duplicate_resume_version(
    resume_id: str,
    version_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    ver = repo.duplicate_version(resume_id, version_id, user["id"])
    if not ver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source version not found.")
    return ver


@router.post("/{resume_id}/versions/{version_id}/restore")
async def restore_resume_version(
    resume_id: str,
    version_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    ver = repo.restore_version(resume_id, version_id, user["id"])
    if not ver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source version not found.")
    return ver


@router.delete("/{resume_id}/versions/{version_id}")
async def delete_resume_version(
    resume_id: str,
    version_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    result = repo.delete_version(resume_id, version_id, user["id"])
    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.get("error", "Deletion failed."))
    return result


@router.post("/{resume_id}/versions/compare")
async def compare_resume_versions(
    resume_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    version_a_id = payload.get("version_a_id")
    version_b_id = payload.get("version_b_id")
    if not version_a_id or not version_b_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Both version_a_id and version_b_id are required.")
    try:
        diff = repo.compare_versions(version_a_id, version_b_id, user["id"])
        return diff
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Version comparison failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to compare versions.")


@router.post("/{resume_id}/usage-event")
async def record_resume_usage_event(
    resume_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    try:
        event = repo.record_usage_event(
            user_id=user["id"],
            resume_id=resume_id,
            version_id=payload.get("version_id"),
            event_type=payload.get("event_type", "jd_comparison"),
            jd_id=payload.get("jd_id"),
            job_id=payload.get("job_id"),
            ats_score=payload.get("ats_score"),
            resume_match_score=payload.get("resume_match_score"),
            ats_engine_version=payload.get("ats_engine_version", "v2.4"),
            match_engine_version=payload.get("match_engine_version", "v2.4"),
            resume_content_hash=payload.get("resume_content_hash"),
            jd_content_hash=payload.get("jd_content_hash"),
        )
        return event
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Usage event recording failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to record usage event.")
