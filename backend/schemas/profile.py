import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
from datetime import date, datetime, timezone

NAME_RE = re.compile(r"^[^\W\d_]+(?:[ '\-][^\W\d_]+)*$", re.UNICODE)
LOCATION_RE = re.compile(r"^[^\W\d_]+(?:[ .'\-][^\W\d_]+)*$", re.UNICODE)
USERNAME_RE = re.compile(r"^[a-z][a-z0-9._]{2,29}$")
URL_RE = re.compile(r"^https?://[^\s]{3,500}$", re.IGNORECASE)


class ProfileValidationMixin:
    @field_validator("first_name", "last_name", "preferred_name", mode="before", check_fields=False)
    @classmethod
    def validate_name(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = " ".join(str(value).strip().split())
        if not 1 <= len(value) <= 80 or not NAME_RE.fullmatch(value):
            raise ValueError("Use letters, spaces, apostrophes, or hyphens only.")
        return value

    @field_validator("username", mode="before", check_fields=False)
    @classmethod
    def validate_username(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = str(value).strip().lower()
        if not USERNAME_RE.fullmatch(value):
            raise ValueError("Use 3–30 characters, beginning with a letter; only letters, numbers, dots, and underscores.")
        if ".." in value or "__" in value or "._" in value or "_." in value:
            raise ValueError("Username separators cannot be repeated or combined.")
        return value

    @field_validator("phone_country_code", mode="before", check_fields=False)
    @classmethod
    def validate_country_code(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = str(value).strip().replace(" ", "")
        if not re.fullmatch(r"\+[1-9]\d{0,5}", value):
            raise ValueError("Enter a valid calling code such as +91.")
        return value

    @field_validator("phone_number", mode="before", check_fields=False)
    @classmethod
    def validate_phone(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = re.sub(r"[\s()\-]", "", str(value))
        if not re.fullmatch(r"\d{6,14}", value):
            raise ValueError("Enter 6–14 digits without the country code.")
        return value

    @field_validator("country", "state", "city", mode="before", check_fields=False)
    @classmethod
    def validate_location(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = " ".join(str(value).strip().split())
        if not 2 <= len(value) <= 100 or not LOCATION_RE.fullmatch(value):
            raise ValueError("Enter a valid location name.")
        return value

    @field_validator("timezone", mode="before", check_fields=False)
    @classmethod
    def validate_timezone(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = str(value).strip()
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError:
            raise ValueError("Choose a valid IANA timezone, such as Asia/Kolkata.")
        return value

    @field_validator("gender", mode="before", check_fields=False)
    @classmethod
    def validate_gender(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = str(value).strip().lower().replace(" ", "_")
        allowed = {"male", "female", "non_binary", "other", "prefer_not_to_say"}
        if value not in allowed:
            raise ValueError("Choose a valid gender option.")
        return value

    @field_validator("date_of_birth", check_fields=False)
    @classmethod
    def validate_birth_date(cls, value):
        if value is None:
            return None
        today = datetime.now(timezone.utc).date()
        age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        if age < 13:
            raise ValueError("You must be at least 13 years old.")
        if age > 120:
            raise ValueError("Enter a valid date of birth.")
        return value

    @field_validator("years_experience", check_fields=False)
    @classmethod
    def validate_experience(cls, value):
        if value is not None and not 0 <= value <= 80:
            raise ValueError("Years of experience must be between 0 and 80.")
        return value

    @field_validator("linkedin_url", "github_url", "portfolio_url", "website_url", mode="before", check_fields=False)
    @classmethod
    def validate_url(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = str(value).strip()
        if not URL_RE.fullmatch(value):
            raise ValueError("Enter a complete URL beginning with http:// or https://.")
        return value

    @field_validator("preferred_language", mode="before", check_fields=False)
    @classmethod
    def validate_language(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = str(value).strip()
        if len(value) > 50 or not re.fullmatch(r"[A-Za-z]+(?:[ -][A-Za-z]+)*", value):
            raise ValueError("Enter a valid language name.")
        return value

    @field_validator("current_title", mode="before", check_fields=False)
    @classmethod
    def validate_title(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = " ".join(str(value).strip().split())
        if len(value) > 120 or any(ord(character) < 32 for character in value):
            raise ValueError("Current title must be 120 characters or fewer.")
        return value

    @field_validator("profile_image_source", mode="before", check_fields=False)
    @classmethod
    def validate_image_source(cls, value):
        if value is None or str(value).strip() == "":
            return None
        if value not in {"uploaded", "google"}:
            raise ValueError("Choose a valid profile image source.")
        return value

    @field_validator("uploaded_profile_image_url", mode="before", check_fields=False)
    @classmethod
    def validate_uploaded_image(cls, value):
        if value is None or str(value).strip() == "":
            return None
        value = str(value).strip()
        data_image = re.match(r"^data:image/(jpeg|png|webp);base64,", value, re.IGNORECASE)
        if not data_image and not re.match(r"^https://[^\s]{3,2000}$", value, re.IGNORECASE):
            raise ValueError("Upload a JPEG, PNG, or WebP image.")
        if data_image and len(value) > 7_100_000:
            raise ValueError("Profile photos must be 5 MB or smaller.")
        return value

    @model_validator(mode="after")
    def validate_e164_length(self):
        code = getattr(self, "phone_country_code", None)
        number = getattr(self, "phone_number", None)
        if code and number and len(code[1:] + number) > 15:
            raise ValueError("The complete mobile number cannot exceed 15 digits.")
        return self

class ProfileBase(ProfileValidationMixin, BaseModel):
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_name: Optional[str] = None
    username: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    preferred_language: Optional[str] = None
    uploaded_profile_image_url: Optional[str] = None
    google_profile_image_url: Optional[str] = None
    profile_image_source: Optional[str] = None
    current_title: Optional[str] = None
    years_experience: Optional[float] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    website_url: Optional[str] = None
    profile_completed_at: Optional[datetime] = None
    auth_provider: Optional[str] = None
    has_password_credential: bool = False
    email_verified: bool = False

class ProfileUpdate(ProfileValidationMixin, BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_name: Optional[str] = None
    username: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    preferred_language: Optional[str] = None
    uploaded_profile_image_url: Optional[str] = None
    profile_image_source: Optional[str] = None
    current_title: Optional[str] = None
    years_experience: Optional[float] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    website_url: Optional[str] = None

class ProfileResponse(ProfileBase):
    id: str
    subscription_plan: str
    credits_remaining: int
    resume_count: int
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
