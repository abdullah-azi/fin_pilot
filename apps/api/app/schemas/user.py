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
    notifications_enabled: bool = True
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)


class UserPreferenceCreate(UserPreferenceBase):
    pass


class UserPreferenceUpdate(BaseModel):
    monthly_income_expected: Decimal | None = Field(default=None, ge=0)
    monthly_savings_target: Decimal | None = Field(default=None, ge=0)
    risk_style: RiskStyle | None = None
    preferred_ai_tone: AIAdviceTone | None = None
    notifications_enabled: bool | None = None
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)


class UserPreferenceResponse(TimestampedResponse):
    user_id: UUID
    monthly_income_expected: Decimal | None
    monthly_savings_target: Decimal | None
    risk_style: RiskStyle | None
    preferred_ai_tone: AIAdviceTone | None
    notifications_enabled: bool
    default_currency: str | None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None
    currency: str = Field(default="USD", min_length=3, max_length=3)
    country: str | None = None
    preferences: UserPreferenceCreate | None = None


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    full_name: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    country: str | None = None
    is_active: bool | None = None
    preferences: UserPreferenceUpdate | None = None


class UserResponse(TimestampedResponse):
    email: EmailStr
    full_name: str | None
    currency: str
    country: str | None
    is_active: bool
    preferences: UserPreferenceResponse | None

