from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, status, Request, Response
from pydantic import BaseModel
from core.security import verify_supabase_jwt, hash_password, verify_password, validate_password
from core.database import get_db_connection
from schemas.auth import (
    RegisterRequest, LoginRequest, GoogleAuthRequest, ForgotPasswordRequest,
    ResetPasswordRequest, ChangePasswordRequest, TokenRequest, ResendVerificationRequest,
    DeleteAccountOtpRequest,
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
from services.notifications import NotificationService
from app.services.device_abuse_service import DeviceAbuseService, AbuseDecision
from app.services.rate_limiter_service import RateLimiterService
from app.services.turnstile_service import verify_turnstile_token
from schemas.auth import TurnstileVerifyRequest

router = APIRouter(prefix="/auth", tags=["auth"])
RESET_CONFIRMATION = "If an account exists for this email, a reset link has been sent."
REFRESH_COOKIE = "tailr4u_refresh"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.REFRESH_TOKEN_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=settings.FRONTEND_URL.startswith("https://"),
        samesite="lax",
        path="/api/v1/auth",
    )

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
        NotificationService(conn).emit(
            str(user["id"]), "security.password_reset_requested", {},
            "user", str(user["id"]), f"password_reset_requested:{user['id']}:{datetime.datetime.utcnow().strftime('%Y%m%d%H')}"
        )
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

@router.post("/verify-turnstile")
async def verify_turnstile(payload: TurnstileVerifyRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    valid = verify_turnstile_token(payload.token, ip)
    if not valid:
        raise HTTPException(status_code=400, detail="Turnstile challenge verification failed.")
    return {"status": "success", "valid": True}

@router.post("/verify-email")
async def verify_email(payload: TokenRequest, conn=Depends(get_db_connection)):
    try:
        user_id, email = AccountSecurityService(conn).verify_email(payload.token)
        trial_granted = DeviceAbuseService(conn).grant_trial_if_eligible(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")
    return {
        "status": "success",
        "message": "Your email has been verified.",
        "trial_granted": trial_granted
    }

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
    NotificationService(conn).emit(
        user["id"], "security.password_changed", {}, "user", user["id"],
        f"password_changed:{user['id']}:{datetime.datetime.utcnow().isoformat()}"
    )
    return {"status": "success", "message": "Password changed. Other devices have been signed out."}

@router.post("/register")
async def register_user(
    payload: RegisterRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    conn = Depends(get_db_connection)
):
    ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")
    installation_id = payload.installation_id or request.headers.get("x-installation-id")

    # 1. Rate Limiting (Upstash / DB)
    rate_limiter = RateLimiterService(conn)
    if rate_limiter.is_rate_limited("signup_ip", ip, max_requests=10, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many account signups from this network. Please try again later.")
    if installation_id and rate_limiter.is_rate_limited("signup_device", installation_id, max_requests=5, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many account signups from this device. Please try again later.")

    # 2. Device Abuse Policy Evaluation
    abuse_service = DeviceAbuseService(conn)
    abuse_eval = abuse_service.evaluate_signup_attempt(
        installation_id=installation_id,
        ip=ip,
        user_agent=user_agent,
        email=payload.email,
        turnstile_token=payload.turnstile_token
    )

    if abuse_eval["decision"] == AbuseDecision.TEMPORARILY_BLOCK:
        raise HTTPException(status_code=403, detail=abuse_eval["reason"])

    if abuse_eval["decision"] == AbuseDecision.REQUIRE_CHALLENGE:
        if not payload.turnstile_token or not verify_turnstile_token(payload.turnstile_token, ip):
            raise HTTPException(
                status_code=400,
                detail={"code": "REQUIRE_CHALLENGE", "message": abuse_eval["reason"]}
            )

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

            # Record device registration
            abuse_service.record_device_registration(
                user_id=str(user[0]),
                device_hash=abuse_eval["device_hash"],
                signup_ip_hash=abuse_eval["signup_ip_hash"],
                user_agent_hash=abuse_eval["user_agent_hash"],
                risk_score=abuse_eval["risk_score"],
                grant_trial_now=False  # Requirement #7: Email verification required first
            )

            # Seed public.profiles
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
                metadata={"provider": "email", "decision": abuse_eval["decision"], "trial_eligible": abuse_eval["trial_eligible"]}
            )

            return {
                "status": "success",
                "message": "User registered successfully.",
                "user": {
                    "id": user[0],
                    "email": user[1],
                    "full_name": user[2]
                },
                "abuse_decision": abuse_eval["decision"],
                "trial_eligible": abuse_eval["trial_eligible"]
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
    response: Response,
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
            refresh_token = session_service.issue_refresh_token(session_id)
            _set_refresh_cookie(response, refresh_token)
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
                    "refresh_token": refresh_token,
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
    response: Response,
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
            profile_details=idinfo.get("tailr4u_profile") or {}
        )
        
        session_service = SessionService(conn)
        session_id = session_service.create_session(user["id"], request, "google")
        refresh_token = session_service.issue_refresh_token(session_id)
        _set_refresh_cookie(response, refresh_token)
        
        access_token = auth_service.generate_custom_jwt(user, session_id)
        has_completed_preferences = JobPreferencesRepository(conn).has_completed(user["id"])
        profile_import = idinfo.get("tailr4u_profile") or {}
        
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
                "refresh_token": refresh_token,
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


class RefreshTokenPayload(BaseModel):
    refresh_token: str | None = None

@router.post("/refresh")
async def refresh_session(
    response: Response,
    request: Request,
    payload: RefreshTokenPayload | None = None,
    refresh_token_cookie: str = Cookie(default=None, alias=REFRESH_COOKIE),
    conn=Depends(get_db_connection),
):
    token = (payload.refresh_token if (payload and payload.refresh_token) else None) or refresh_token_cookie
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    rotated = SessionService(conn).rotate_refresh_token(token) if token else None
    if not rotated:
        try:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                old_access_token = auth_header.split(" ")[1]
                # rotate_refresh_token() matches on a single refresh_token_hash
                # column per session, replaced atomically on each rotation. The
                # extension side panel and any tab opened from it share the
                # SAME session (same access/refresh tokens via localStorage),
                # so both independently notice the access token is expiring
                # around the same moment and can both call this endpoint
                # concurrently. Whichever request the DB processes first wins
                # the rotation; the loser's refresh_token is, by definition,
                # already stale by the time it's looked up above -- that is
                # NOT the same thing as the session being genuinely invalid.
                # The loser's OLD access token is still cryptographically
                # ours (valid signature) even though its `exp` has passed --
                # that's exactly why a refresh was triggered. Verify the
                # signature but ignore expiry, then confirm the underlying
                # session is still live via a real, current DB check before
                # trusting it. This is not a weaker check than a normal
                # refresh-token lookup, just a different route to the same
                # live session record -- it specifically recovers the losing
                # side of the race instead of forcing a full logout for it.
                payload = jwt.decode(
                    old_access_token,
                    settings.JWT_SECRET,
                    algorithms=[settings.JWT_ALGORITHM],
                    options={"verify_exp": False},
                )
                session_id = payload.get("jti")
                user_id = payload.get("sub")
                session_service = SessionService(conn)
                if session_id and user_id and session_service.is_session_refreshable(session_id):
                    user = {
                        "id": user_id,
                        "session_id": session_id,
                        "email": payload.get("email"),
                        "metadata": {
                            "full_name": payload.get("full_name", ""),
                            "provider": payload.get("provider", "email"),
                        },
                    }
                    new_refresh_token = session_service.issue_refresh_token(session_id)
                    access_token = AuthService(conn).generate_custom_jwt(user, str(session_id))
                    _set_refresh_cookie(response, new_refresh_token)
                    return {"access_token": access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}
        except Exception:
            pass
        response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
        raise HTTPException(status_code=401, detail="Refresh session expired or revoked.")

    user, new_refresh_token = rotated
    access_token = AuthService(conn).generate_custom_jwt(user, str(user["session_id"]))
    _set_refresh_cookie(response, new_refresh_token)
    return {"access_token": access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}


@router.post("/activity", status_code=204)
async def record_session_activity(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection),
):
    if user.get("session_id"):
        SessionService(conn).record_activity(user["session_id"])
    return None


@router.post("/logout", status_code=204)
async def logout_session(
    response: Response,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection),
):
    if user.get("session_id"):
        SessionService(conn).revoke_session(user["session_id"], user["id"])
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return None


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


@router.post("/delete-account/request-otp")
async def request_delete_account_otp(
    request: Request,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection)
):
    service = AccountSecurityService(conn)
    if service.rate_limited("delete-account-otp", user["id"], 5, 15):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait a few minutes before trying again.")
    
    otp_code = service.issue_deletion_otp(user["id"])
    background_tasks.add_task(EmailService().send_account_deletion_otp, user["email"], otp_code)
    return {
        "status": "success",
        "message": f"Verification OTP code sent to {user['email']}.",
        "email": user["email"]
    }


@router.post("/delete-account/confirm")
async def confirm_delete_account(
    payload: DeleteAccountOtpRequest,
    response: Response,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection)
):
    service = AccountSecurityService(conn)
    verified = service.verify_deletion_otp(user["id"], payload.otp_code)
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code. Please check your email or request a new code."
        )
    
    service.delete_account(user["id"])
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return {
        "status": "success",
        "message": "Your account and all associated data have been permanently deleted."
    }
