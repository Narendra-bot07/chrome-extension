from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Request
from core.security import verify_supabase_jwt, hash_password, verify_password, validate_password
from core.database import get_db_connection
from schemas.auth import (
    RegisterRequest, LoginRequest, GoogleAuthRequest, ForgotPasswordRequest,
    ResetPasswordRequest, ChangePasswordRequest, TokenRequest, ResendVerificationRequest,
)
from app.services.auth_service import AuthService
from app.services.session_service import SessionService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from typing import Dict, Any
from psycopg2.extras import RealDictCursor
import datetime
from datetime import timedelta
import jwt
from repositories.job_preferences_repository import JobPreferencesRepository
from app.services.account_security_service import AccountSecurityService, normalize_email
from app.services.email_service import EmailService
from core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])
RESET_CONFIRMATION = "If an account exists for this email, a reset link has been sent."

@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db_connection)):
    service = AccountSecurityService(conn)
    ip = request.client.host if request.client else "unknown"
    if service.rate_limited("forgot-ip", ip, 15, 60) or service.rate_limited("forgot-email", normalize_email(payload.email), 5, 15):
        return {"status": "success", "message": RESET_CONFIRMATION}
    user = service.get_user_by_email(payload.email)
    if user:
        token = service.issue_token("password_reset_tokens", user["id"], timedelta(minutes=settings.PASSWORD_RESET_MINUTES), request)
        service.audit("password_reset_requested", user["id"], ip=ip, user_agent=request.headers.get("user-agent", ""))
        conn.commit()
        background_tasks.add_task(EmailService().send_password_reset, user["email"], token)
    return {"status": "success", "message": RESET_CONFIRMATION}

@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request, background_tasks: BackgroundTasks, conn=Depends(get_db_connection)):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    service = AccountSecurityService(conn)
    ip = request.client.host if request.client else "unknown"
    if service.rate_limited("reset-ip", ip, 10, 60):
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired.")
    try:
        email = service.reset_password(payload.token, payload.new_password)
    except ValueError as exc:
        message = str(exc) if str(exc) != "invalid_token" else "This password reset link is invalid or has expired."
        raise HTTPException(status_code=400, detail=message)
    background_tasks.add_task(EmailService().send_password_changed, email)
    return {"status": "success", "message": "Your password has been reset. Sign in with your new password."}

@router.post("/reset-password/validate")
async def validate_reset_token(payload: TokenRequest, conn=Depends(get_db_connection)):
    with conn.cursor() as cur:
        from core.security import hash_action_token
        cur.execute("""SELECT 1 FROM public.password_reset_tokens
                       WHERE token_hash=%s AND used_at IS NULL AND expires_at>NOW()""", (hash_action_token(payload.token),))
        valid = cur.fetchone() is not None
    return {"valid": valid}

@router.post("/verify-email")
async def verify_email(payload: TokenRequest, conn=Depends(get_db_connection)):
    try:
        AccountSecurityService(conn).verify_email(payload.token)
    except ValueError:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")
    return {"status": "success", "message": "Your email has been verified."}

@router.post("/resend-verification")
async def resend_verification(payload: ResendVerificationRequest, request: Request, background_tasks: BackgroundTasks, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    service = AccountSecurityService(conn)
    if not service.rate_limited("verification-user", user["id"], 3, 60):
        account = service.get_user_by_email(user["email"])
        if account and not account["email_verified_at"]:
            token = service.issue_token("email_verification_tokens", account["id"], timedelta(hours=settings.EMAIL_VERIFICATION_HOURS))
            service.audit("verification_email_sent", account["id"])
            conn.commit()
            background_tasks.add_task(EmailService().send_verification, account["email"], token)
    return {"status": "success", "message": "If verification is needed, a new email has been sent."}

@router.post("/change-password")
async def change_password(payload: ChangePasswordRequest, request: Request, background_tasks: BackgroundTasks, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    current_jti = None
    authorization = request.headers.get("authorization", "")
    if authorization.startswith("Bearer "):
        try:
            current_jti = jwt.decode(authorization[7:], settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]).get("jti")
        except Exception:
            pass
    try:
        email = AccountSecurityService(conn).change_password(user["id"], payload.current_password, payload.new_password, current_jti)
    except PermissionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    background_tasks.add_task(EmailService().send_password_changed, email)
    return {"status": "success", "message": "Password changed. Other devices have been signed out."}

@router.post("/register")
async def register_user(
    payload: RegisterRequest,
    background_tasks: BackgroundTasks,
    conn = Depends(get_db_connection)
):
    try:
        validate_password(payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    pw_hash = hash_password(payload.password)
    
    query = """
        INSERT INTO public.users (
            email, full_name, password_hash, provider, auth_provider,
            has_password_credential
        )
        VALUES (%s, '', %s, 'email', 'password', TRUE)
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
            
            cur.execute(query, (payload.email, pw_hash))
            user = cur.fetchone()

            # Seed public.profiles for compatibility
            cur.execute(
                "INSERT INTO public.profiles (id, email, full_name) VALUES (%s, %s, %s)",
                (user[0], user[1], "")
            )
            conn.commit()
            verification_token = AccountSecurityService(conn).issue_token(
                "email_verification_tokens", user[0],
                timedelta(hours=settings.EMAIL_VERIFICATION_HOURS)
            )
            AccountSecurityService(conn).audit("verification_email_sent", user[0])
            conn.commit()
            background_tasks.add_task(EmailService().send_verification, user[1], verification_token)
            
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
            detail="Registration failed. Please try again."
        )

@router.post("/login")
async def login_user(
    payload: LoginRequest,
    request: Request,
    conn = Depends(get_db_connection)
):
    try:
        limiter = AccountSecurityService(conn)
        client_ip = request.client.host if request.client else "unknown"
        if limiter.rate_limited("login-ip", client_ip, 20, 15) or limiter.rate_limited("login-email", normalize_email(payload.email), 10, 15):
            raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM public.users WHERE email = %s", (payload.email,))
            user = cur.fetchone()
            
            if not user or not verify_password(payload.password, user.get("password_hash")):
                limiter.audit("login_failed", user["id"] if user else None, ip=client_ip, user_agent=request.headers.get("user-agent", ""))
                conn.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password."
                )
            
            # Update last_login
            cur.execute("UPDATE public.users SET last_login = NOW() WHERE id = %s", (user["id"],))
            if user.get("password_hash") and not user["password_hash"].startswith(("$2a$", "$2b$", "$2y$")):
                cur.execute("UPDATE public.users SET password_hash=%s WHERE id=%s", (hash_password(payload.password), user["id"]))
            conn.commit()

            auth_service = AuthService(conn)
            session_service = SessionService(conn)
            
            session_id = session_service.create_session(user["id"], request, "email")
            access_token = auth_service.generate_custom_jwt(user, session_id)
            has_completed_preferences = JobPreferencesRepository(conn).has_completed(user["id"])

            # Emit Analytics Event
            analytics_service = AnalyticsService(conn)
            analytics_service.emit_event(
                user_id=user["id"],
                event_type="USER_LOGIN",
                metadata={"provider": "email"},
                session_id=session_id
            )
            limiter.audit("login_succeeded", user["id"], ip=client_ip, user_agent=request.headers.get("user-agent", ""))
            conn.commit()

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
                        "created_at": user.get("created_at", datetime.datetime.utcnow()).isoformat() if isinstance(user.get("created_at"), datetime.datetime) else str(user.get("created_at", "")),
                        "has_completed_preferences": has_completed_preferences
                    },
                    "has_completed_preferences": has_completed_preferences
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please try again."
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
            email_verified=idinfo.get("email_verified", False),
            first_name=idinfo.get("given_name", ""),
            last_name=idinfo.get("family_name", ""),
            locale=idinfo.get("locale", ""),
            profile_details=idinfo.get("tailorflow_profile") or {}
        )
        
        session_service = SessionService(conn)
        session_id = session_service.create_session(user["id"], request, "google")
        
        access_token = auth_service.generate_custom_jwt(user, session_id)
        has_completed_preferences = JobPreferencesRepository(conn).has_completed(user["id"])
        profile_import = idinfo.get("tailorflow_profile") or {}
        
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
                        "created_at": user.get("created_at", datetime.datetime.utcnow()).isoformat() if isinstance(user.get("created_at"), datetime.datetime) else str(user.get("created_at", "")),
                        "has_completed_preferences": has_completed_preferences
                    },
                    "has_completed_preferences": has_completed_preferences
                },
                "google_profile_import": {
                    "status": profile_import.get("_import_status", "basic_profile_only"),
                    "http_status": profile_import.get("_import_http_status"),
                    "error": profile_import.get("_import_error"),
                    "populated_fields": profile_import.get("_populated_fields", [])
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
async def verify_session(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    has_completed_preferences = JobPreferencesRepository(conn).has_completed(user["id"])
    return {
        "status": "authenticated",
        "user": {**user, "has_completed_preferences": has_completed_preferences},
        "has_completed_preferences": has_completed_preferences
    }
