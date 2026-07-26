from fastapi import APIRouter, Depends, UploadFile, File, Header, HTTPException, status
from fastapi.responses import Response
from typing import Dict, Any, List
from datetime import datetime, timezone
from pathlib import Path
import re
import hashlib
from core.security import verify_supabase_jwt
from core.constants import MAX_FILE_SIZE_BYTES, SUPPORTED_FILE_EXTENSIONS
from api.dependencies import get_resume_repository, get_storage_service
from repositories.resume_repository import ResumeRepository
from services.storage.file_service import FileService
from services.resume.parser import ResumeParser
from services.resume.source_preservation import restore_source_evidence
from services.ai.groq_service import GroqService
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
from services.resume_intelligence.semantic import GroqSemanticAnalyzer
from services.resume_intelligence.service import SelectedResumeIntelligenceService
from services.workflow.checkpoints import PostgresCheckpointStore
from core.config import settings

router = APIRouter(prefix="/resumes", tags=["resumes"])


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
    conn,
    api_key: str | None,
) -> SelectedResumeIntelligenceService:
    parser_service = GroqService(api_key=api_key) if api_key else None
    semantic_analyzer = GroqSemanticAnalyzer(api_key) if api_key else None
    return SelectedResumeIntelligenceService(
        repository=repo,
        storage=storage,
        checkpoint_store=PostgresCheckpointStore(conn, owner_id=user_id),
        structured_parser=parser_service.parse_resume if parser_service else None,
        semantic_analyzer=semantic_analyzer,
    )


@router.post("/{resume_id}/intelligence", response_model=Phase2Output)
def build_selected_resume_intelligence(
    resume_id: str,
    payload: SelectedResumeIntelligenceRequest,
    x_groq_key: str = Header(None),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
    conn=Depends(get_db_connection),
):
    api_key = x_groq_key or settings.GROQ_API_KEY
    service = _resume_intelligence_service(
        user_id=user["id"],
        repo=repo,
        storage=storage,
        conn=conn,
        api_key=api_key,
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
    x_groq_key: str = Header(None),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
    conn=Depends(get_db_connection),
):
    service = _resume_intelligence_service(
        user_id=user["id"],
        repo=repo,
        storage=storage,
        conn=conn,
        api_key=x_groq_key or settings.GROQ_API_KEY,
    )
    return service.confirm(
        workflow_id=workflow_id,
        selected_resume_id=resume_id,
        confirmed=payload.confirmed,
    )

@router.post("/upload")
async def upload_and_parse(
    file: UploadFile = File(...),
    x_groq_key: str = Header(None),
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

    # Text extraction
    raw_text = ResumeParser.extract_text(content, file.filename)
    source_links = ResumeParser.extract_links(content, file.filename)

    # Save to storage
    import uuid
    unique_path = f"{user['id']}/{uuid.uuid4()}_{file.filename}"
    stored_path = storage.upload_file("original-resumes", unique_path, content, file.content_type)
    logger.info(
        "[RESUME][BACKEND] Resume file stored user_id=%s file_name=%s "
        "size=%s storage_path=%s",
        user["id"],
        file.filename,
        len(content),
        stored_path,
    )

    # Save to database before AI parsing so uploaded files are never lost from the Resume Manager.
    parsed_res = {
        "raw_text": raw_text,
        "links": source_links,
        "parse_status": "pending",
    }
    record = resume_repo.create(
        user_id=user["id"],
        file_path=unique_path,
        file_name=file.filename,
        file_size=len(content),
        file_type=ext,
        parsed_content=parsed_res,
        source_fingerprint=hashlib.sha256(content).hexdigest(),
    )
    logger.info(
        "[RESUME][BACKEND] Resume upload completed user_id=%s resume_id=%s "
        "file_name=%s parsing_status=pending",
        user["id"],
        record.get("id"),
        record.get("file_name"),
    )

    # Return immediately after durable upload. AI parsing is intentionally
    # deferred to /{resume_id}/parse so rate limits cannot prevent the Resume
    # Manager from displaying and activating the newly uploaded file.
    record["parsed_content"] = parsed_res
    record["parsing_status"] = "pending"
    
    AnalyticsService(conn).emit_event(
        user_id=user["id"],
        event_type="RESUME_UPLOADED",
        resource_type="resume",
        resource_id=record["id"],
        metadata={"file_name": file.filename, "file_size": len(content)}
    )
    
    return record

@router.get("/")
async def list_resumes(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    return repo.list_by_user(user["id"])


@router.post("/reconcile-local")
async def reconcile_local_resumes(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
):
    """Recover this user's locally stored files whose DB insert was rolled back."""
    base_dir = getattr(storage, "base_dir", None)
    if not base_dir:
        return {"recovered": 0, "active_resume_id": None}

    user_dir = Path(base_dir) / "original-resumes" / user["id"]
    if not user_dir.exists():
        return {"recovered": 0, "active_resume_id": None}

    known_paths = repo.all_file_paths(user["id"])
    local_files = sorted(
        (path for path in user_dir.iterdir() if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    known_content_hashes = {
        hashlib.sha256(path.read_bytes()).hexdigest()
        for path in local_files
        if f"{user['id']}/{path.name}" in known_paths
    }
    recovered: list[Dict[str, Any]] = []
    for local_file in local_files:
        relative_path = f"{user['id']}/{local_file.name}"
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
            logger.info(
                "[RESUME][BACKEND] Duplicate orphan file skipped "
                "user_id=%s file_name=%s",
                user["id"],
                display_name,
            )
            continue
        try:
            raw_text = ResumeParser.extract_text(data, display_name)
        except Exception as exc:
            logger.warning(
                "[RESUME][BACKEND] Recovered file text extraction skipped "
                "user_id=%s file_name=%s error=%s",
                user["id"],
                display_name,
                str(exc),
            )
            raw_text = ""

        uploaded_at = datetime.fromtimestamp(
            local_file.stat().st_mtime,
            tz=timezone.utc,
        )
        record = repo.recover_local_file(
            user_id=user["id"],
            file_path=relative_path,
            file_name=display_name,
            file_size=len(data),
            file_type=local_file.suffix.lstrip(".").upper() or "PDF",
            parsed_content={"raw_text": raw_text, "parse_status": "pending"},
            uploaded_at=uploaded_at,
            source_fingerprint=content_hash,
        )
        if record:
            recovered.append(record)
            known_paths.add(relative_path)
            known_content_hashes.add(content_hash)

    active = None
    if recovered:
        newest = recovered[0]
        active = repo.activate(str(newest["id"]), user["id"])

    logger.info(
        "[RESUME][BACKEND] Local resume reconciliation completed "
        "user_id=%s recovered=%s active_resume_id=%s",
        user["id"],
        len(recovered),
        active.get("id") if active else None,
    )
    return {
        "recovered": len(recovered),
        "active_resume_id": active.get("id") if active else None,
    }

@router.get("/active")
async def get_active_resume(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    return repo.get_active(user["id"]) or None

@router.get("/{resume_id}/file")
async def get_resume_file(
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
    file_bytes = storage.download_file("original-resumes", record["file_path"])
    media_type = "application/pdf" if (record.get("file_type") or "").lower() == "pdf" else "application/octet-stream"
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{record.get("file_name") or "resume"}"'}
    )

@router.get("/{resume_id}/preview")
async def preview_resume_file(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service)
):
    return await get_resume_file(resume_id, user, repo, storage)

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
        "hidden_sections": layout.hidden_sections,
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

@router.post("/{resume_id}/parse")
async def parse_existing_resume(
    resume_id: str,
    x_groq_key: str = Header(None),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    conn = Depends(get_db_connection),
    storage: FileService = Depends(get_storage_service),
):
    record = repo.get_by_id(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )
    
    parsed_content = record.get("parsed_content") or {}
    raw_text = parsed_content.get("raw_text")
    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No raw text found in this resume to parse."
        )
        
    # Run Groq AI parse on-demand
    ai = GroqService(api_key=x_groq_key)
    parsed_res = ai.parse_resume(raw_text)
    
    # Save back to database
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
    
    success = repo.update_parsed_content(resume_id, user["id"], updated_content)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update parsed resume content in database."
        )
    # Emit Analytics Event
    AnalyticsService(conn).emit_event(
        user_id=user["id"],
        event_type="RESUME_PARSED",
        resource_type="resume",
        resource_id=resume_id,
        metadata={"source": "on-demand"}
    )
        
    # Return updated record format
    record["parsed_content"] = updated_content
    return record


@router.post("/{resume_id}/recover-source")
async def recover_resume_source_details(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
):
    """Backfill lossless descriptions and PDF annotation URLs without an LLM."""
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
        source_bytes = storage.download_file("original-resumes", record["file_path"])
        source_links.update(ResumeParser.extract_links_from_pdf(source_bytes))
    recovered = restore_source_evidence(parsed_content, raw_text, source_links)
    recovered["source_preservation_version"] = "7.3"
    if not repo.update_parsed_content(resume_id, user["id"], recovered):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist recovered resume source details.",
        )
    record["parsed_content"] = recovered
    record["parsing_status"] = record.get("parsing_status") or recovered.get("parse_status")
    logger.info(
        "[RESUME-PRESERVATION] Source recovery completed resume_id=%s links=%s "
        "achievements=%s certifications=%s",
        resume_id,
        len(source_links),
        len(recovered.get("achievements") or []),
        len(recovered.get("certifications") or []),
    )
    return record


# =============================================================================
# RESUME VERSIONING & USAGE INTELLIGENCE ENDPOINTS
# =============================================================================

@router.get("/{resume_id}/versions")
async def list_resume_versions(
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

