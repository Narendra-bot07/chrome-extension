from fastapi import APIRouter, Depends, HTTPException, status, Request
from core.security import forget_verified_session, verify_supabase_jwt
from core.database import get_db_connection
from app.services.session_service import SessionService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from typing import Dict, Any

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.get("/")
def get_sessions(
    request: Request,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    session_service = SessionService(conn)
    sessions = session_service.get_active_sessions(user["id"])
    
    # We need to identify the current session based on the jti in the token
    auth_header = request.headers.get("Authorization")
    current_jti = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            import jwt
            from core.config import settings
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            current_jti = payload.get("jti")
        except Exception:
            pass

    for s in sessions:
        if str(s["session_id"]) == current_jti:
            s["is_current"] = True
        else:
            s["is_current"] = False

    return {"status": "success", "sessions": sessions}

@router.delete("/{session_id}")
def revoke_session(
    session_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    session_service = SessionService(conn)
    success = session_service.revoke_session(session_id, user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Session not found or already revoked.")
    forget_verified_session(session_id)
        
    AnalyticsService(conn).emit_event(
        user_id=user["id"],
        event_type="USER_LOGOUT",
        metadata={"revoked_session_id": session_id}
    )
    
    return {"status": "success", "message": "Session revoked successfully."}

@router.delete("/all/others")
def revoke_all_other_sessions(
    request: Request,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    auth_header = request.headers.get("Authorization")
    current_jti = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            import jwt
            from core.config import settings
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            current_jti = payload.get("jti")
        except Exception:
            pass

    if not current_jti:
        raise HTTPException(status_code=400, detail="Cannot identify current session.")

    session_service = SessionService(conn)
    session_service.revoke_other_sessions(current_jti, user["id"])
    
    AnalyticsService(conn).emit_event(
        user_id=user["id"],
        event_type="USER_LOGOUT",
        metadata={"action": "revoke_all_others"}
    )
    
    return {"status": "success", "message": "All other sessions revoked successfully."}
