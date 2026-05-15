from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import GoalPriority, SavingsGoalStatus
from app.schemas.common import CalendarDate, TimestampedResponse


class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    target_amount: Decimal = Field(gt=0)
    current_amount: Decimal = Field(default=0, ge=0)
    target_date: CalendarDate | None = None
    priority: GoalPriority = GoalPriority.MEDIUM
    status: SavingsGoalStatus = SavingsGoalStatus.ACTIVE


class SavingsGoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    target_amount: Decimal | None = Field(default=None, gt=0)
    current_amount: Decimal | None = Field(default=None, ge=0)
    target_date: CalendarDate | None = None
    priority: GoalPriority | None = None
    status: SavingsGoalStatus | None = None


class SavingsGoalResponse(TimestampedResponse):
    user_id: UUID
    name: str
    description: str | None
    target_amount: Decimal
    current_amount: Decimal
    target_date: CalendarDate | None
    priority: GoalPriority
    status: SavingsGoalStatus


class SavingsGoalListResponse(BaseModel):
    items: list[SavingsGoalResponse]
