from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import AIAdviceTone, RiskStyle
from app.schemas.common import TimestampedResponse


class UserPreferenceBase(BaseModel):
    monthly_income_expected: Decimal | None = Field(default=None, ge=0)
    monthly_savings_target: Decimal | None = Field(default=None, ge=0)
    risk_style: RiskStyle | None = None
    preferred_ai_tone: AIAdviceTone | None = None
    month_start_day: int = Field(default=1, ge=1, le=31)
    ai_suggestions_enabled: bool = True
    weekly_digest_enabled: bool = True
    savings_reminders_enabled: bool = True
    promotions_enabled: bool = False
    biometric_enabled: bool = False
    appearance: str = Field(default="dark", min_length=3, max_length=20)
    language: str = Field(default="English", min_length=2, max_length=20)
    notifications_enabled: bool = True
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)


class UserPreferenceCreate(UserPreferenceBase):
    pass


class UserPreferenceUpdate(BaseModel):
    monthly_income_expected: Decimal | None = Field(default=None, ge=0)
    monthly_savings_target: Decimal | None = Field(default=None, ge=0)
    risk_style: RiskStyle | None = None
    preferred_ai_tone: AIAdviceTone | None = None
    month_start_day: int | None = Field(default=None, ge=1, le=31)
    ai_suggestions_enabled: bool | None = None
    weekly_digest_enabled: bool | None = None
    savings_reminders_enabled: bool | None = None
    promotions_enabled: bool | None = None
    biometric_enabled: bool | None = None
    appearance: str | None = Field(default=None, min_length=3, max_length=20)
    language: str | None = Field(default=None, min_length=2, max_length=20)
    notifications_enabled: bool | None = None
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)


class UserPreferenceResponse(TimestampedResponse):
    user_id: UUID
    monthly_income_expected: Decimal | None
    monthly_savings_target: Decimal | None
    risk_style: RiskStyle | None
    preferred_ai_tone: AIAdviceTone | None
    month_start_day: int
    ai_suggestions_enabled: bool
    weekly_digest_enabled: bool
    savings_reminders_enabled: bool
    promotions_enabled: bool
    biometric_enabled: bool
    appearance: str
    language: str
    notifications_enabled: bool
    default_currency: str | None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None
    phone: str | None = Field(default=None, min_length=7, max_length=30)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    country: str | None = None
    preferences: UserPreferenceCreate | None = None


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    full_name: str | None = None
    phone: str | None = Field(default=None, min_length=7, max_length=30)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    country: str | None = None
    is_active: bool | None = None
    preferences: UserPreferenceUpdate | None = None


class UserResponse(TimestampedResponse):
    email: EmailStr
    full_name: str | None
    phone: str | None
    profile_image_url: str | None
    currency: str
    country: str | None
    is_active: bool
    preferences: UserPreferenceResponse | None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8)
    new_password: str = Field(min_length=8)


class PasswordChangeResponse(BaseModel):
    status: str


class ProfileImageUploadResponse(BaseModel):
    profile_image_url: str


class ProfileImageDeleteResponse(BaseModel):
    status: str
