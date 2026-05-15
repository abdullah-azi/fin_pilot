from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import CategoryType
from app.schemas.common import TimestampedResponse


class CategoryResponse(TimestampedResponse):
    user_id: UUID | None
    name: str
    type: CategoryType
    color: str | None
    icon: str | None
    is_default: bool


class CategorySeedResponse(BaseModel):
    created_count: int = Field(ge=0)
    skipped_count: int = Field(ge=0)
    scope: Literal["default"]

