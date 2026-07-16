from fastapi import APIRouter, Depends, HTTPException, status, Request
from core.security import verify_supabase_jwt, hash_password, verify_password
from core.database import get_db_connection
from schemas.auth import RegisterRequest, LoginRequest, GoogleAuthRequest
from app.services.auth_service import AuthService
from app.services.session_service import SessionService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from typing import Dict, Any
from psycopg2.extras import RealDictCursor
import datetime

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
async def register_user(
    payload: RegisterRequest,
    conn = Depends(get_db_connection)
):
    pw_hash = hash_password(payload.password)
    
    query = """
        INSERT INTO public.users (email, full_name, password_hash, provider)
        VALUES (%s, %s, %s, 'email')
        RETURNING id, email, full_name
    """
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM public.users WHERE email = %s", (payload.email,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered."
                )
            
            cur.execute(query, (payload.email, payload.full_name or "", pw_hash))
            user = cur.fetchone()

            # Seed public.profiles for compatibility
            cur.execute(
                "INSERT INTO public.profiles (id, email, full_name) VALUES (%s, %s, %s)",
                (user[0], user[1], user[2])
            )
            conn.commit()
            
            # Emit Analytics Event
            analytics_service = AnalyticsService(conn)
            analytics_service.emit_event(
                user_id=user[0],
                event_type="USER_REGISTERED",
                metadata={"provider": "email"}
            )
            
            return {
                "status": "success",
                "message": "User registered successfully.",
                "user": {
                    "id": user[0],
                    "email": user[1],
                    "full_name": user[2]
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

@router.post("/login")
async def login_user(
    payload: LoginRequest,
    request: Request,
    conn = Depends(get_db_connection)
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM public.users WHERE email = %s", (payload.email,))
            user = cur.fetchone()
            
            if not user or not verify_password(payload.password, user.get("password_hash")):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password."
                )
            
            # Update last_login
            cur.execute("UPDATE public.users SET last_login = NOW() WHERE id = %s", (user["id"],))
            conn.commit()

            auth_service = AuthService(conn)
            session_service = SessionService(conn)
            
            session_id = session_service.create_session(user["id"], request, "email")
            access_token = auth_service.generate_custom_jwt(user, session_id)

            # Emit Analytics Event
            analytics_service = AnalyticsService(conn)
            analytics_service.emit_event(
                user_id=user["id"],
                event_type="USER_LOGIN",
                metadata={"provider": "email"},
                session_id=session_id
            )

            return {
                "status": "success",
                "session": {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "user": {
                        "id": user["id"],
                        "email": user["email"],
                        "full_name": user.get("full_name", ""),
                        "provider": user.get("provider", "email"),
                        "created_at": user.get("created_at", datetime.datetime.utcnow()).isoformat() if isinstance(user.get("created_at"), datetime.datetime) else str(user.get("created_at", ""))
                    }
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )

@router.post("/google")
async def google_login(
    payload: GoogleAuthRequest,
    request: Request,
    conn = Depends(get_db_connection)
):
    if not payload.credential:
        raise HTTPException(status_code=400, detail="Missing credential.")

    auth_service = AuthService(conn)
    try:
        idinfo = auth_service.verify_google_token(payload.credential)
        
        user = auth_service.sync_oauth_user(
            provider="google",
            provider_user_id=idinfo.get("sub"),
            email=idinfo.get("email"),
            full_name=idinfo.get("name", ""),
            avatar_url=idinfo.get("picture", ""),
            email_verified=idinfo.get("email_verified", False)
        )
        
        session_service = SessionService(conn)
        session_id = session_service.create_session(user["id"], request, "google")
        
        access_token = auth_service.generate_custom_jwt(user, session_id)
        
        # Emit Analytics Event
        analytics_service = AnalyticsService(conn)
        analytics_service.emit_event(
            user_id=user["id"],
            event_type="USER_LOGIN",
            metadata={"provider": "google"},
            session_id=session_id
        )

        return {
            "status": "success",
            "session": {
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "id": user["id"],
                    "email": user["email"],
                    "full_name": user.get("full_name", ""),
                    "provider": user.get("provider", "google"),
                    "avatar_url": user.get("avatar_url", ""),
                    "created_at": user.get("created_at", datetime.datetime.utcnow()).isoformat() if isinstance(user.get("created_at"), datetime.datetime) else str(user.get("created_at", ""))
                }
            }
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google login failed: {str(e)}"
        )


@router.get("/session")
async def verify_session(user: Dict[str, Any] = Depends(verify_supabase_jwt)):
    return {"status": "authenticated", "user": user}
