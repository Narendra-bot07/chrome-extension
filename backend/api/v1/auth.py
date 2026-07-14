from fastapi import APIRouter, Depends, HTTPException, status
from core.security import verify_supabase_jwt, hash_password, verify_password
from core.database import get_db_connection
from schemas.auth import RegisterRequest, LoginRequest
from typing import Dict, Any
from psycopg2.extras import RealDictCursor
import uuid
import json

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register")
async def register_user(
    payload: RegisterRequest,
    conn = Depends(get_db_connection)
):
    user_id = str(uuid.uuid4())
    meta_data = {"full_name": payload.full_name or ""}
    pw_hash = hash_password(payload.password)
    
    query = """
        INSERT INTO auth.users (id, email, raw_user_meta_data, password_hash)
        VALUES (%s, %s, %s, %s)
        RETURNING id, email, raw_user_meta_data
    """
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM auth.users WHERE email = %s", (payload.email,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered."
                )
            
            cur.execute(query, (user_id, payload.email, json.dumps(meta_data), pw_hash))
            conn.commit()
            
            return {
                "status": "success",
                "message": "User registered successfully.",
                "user": {
                    "id": user_id,
                    "email": payload.email,
                    "full_name": payload.full_name
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
    conn = Depends(get_db_connection)
):
    """
    Local login endpoint verifying user email from auth.users table and returning a real JWT token.
    """
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM auth.users WHERE email = %s", (payload.email,))
            user = cur.fetchone()
            print(f"DEBUG: Found user in DB: {user}")
            if user:
                print(f"DEBUG: Input password: {payload.password}")
                print(f"DEBUG: Stored hash: {user.get('password_hash')}")
                is_valid = verify_password(payload.password, user.get("password_hash"))
                print(f"DEBUG: verify_password result: {is_valid}")
            
            if not user or not verify_password(payload.password, user.get("password_hash")):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password."
                )
            
            # Seed profile if not exists (in case trigger was bypassed during seed setup)
            cur.execute("SELECT id FROM public.profiles WHERE id = %s", (user["id"],))
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO public.profiles (id, email, full_name) VALUES (%s, %s, %s)",
                    (user["id"], user["email"], user["raw_user_meta_data"].get("full_name", ""))
                )
                conn.commit()

            import jwt
            import datetime
            from core.config import settings
            
            token_payload = {
                "sub": str(user["id"]),
                "email": user["email"],
                "full_name": user["raw_user_meta_data"].get("full_name", ""),
                "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
            }
            access_token = jwt.encode(token_payload, settings.JWT_SECRET, algorithm="HS256")

            return {
                "status": "success",
                "session": {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "user": {
                        "id": user["id"],
                        "email": user["email"],
                        "full_name": user["raw_user_meta_data"].get("full_name", "")
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

@router.get("/session")
async def verify_session(user: Dict[str, Any] = Depends(verify_supabase_jwt)):
    """
    Validates token and returns user details.
    """
    return {"status": "authenticated", "user": user}
