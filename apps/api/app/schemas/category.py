from typing import Literal
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import CategoryType
from app.schemas.common import TimestampedResponse


class CategoryResponse(TimestampedResponse):
    user_id: UUID | None
    name: str
    display_name: str | None = None
    effective_name: str
    type: CategoryType
    color: str | None
    icon: str | None
    is_default: bool
    is_hidden: bool = False
    monthly_budget_limit: Decimal | None = None
    is_custom: bool


class CategorySeedResponse(BaseModel):
    created_count: int = Field(ge=0)
    skipped_count: int = Field(ge=0)
    scope: Literal["default"]


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: CategoryType
    color: str | None = Field(default=None, max_length=20)
    icon: str | None = Field(default=None, max_length=100)


class CategorySettingsUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    is_hidden: bool | None = None
    monthly_budget_limit: Decimal | None = Field(default=None, gt=0)
