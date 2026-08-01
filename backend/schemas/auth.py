from pydantic import BaseModel, EmailStr
from typing import Optional

class RegisterRequest(BaseModel):
    email: str
    password: str
    installation_id: Optional[str] = None
    turnstile_token: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str
    installation_id: Optional[str] = None
    turnstile_token: Optional[str] = None

class GoogleAuthRequest(BaseModel):
    credential: str
    installation_id: Optional[str] = None
    turnstile_token: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: str
    installation_id: Optional[str] = None
    turnstile_token: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    confirm_password: str
    turnstile_token: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

class TokenRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: Optional[str] = None

class DeleteAccountOtpRequest(BaseModel):
    otp_code: str

class TurnstileVerifyRequest(BaseModel):
    token: str
