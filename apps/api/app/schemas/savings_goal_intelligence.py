from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class SavingsGoalHealthResponse(BaseModel):
    goal_id: UUID
    name: str
    current_amount: Decimal
    target_amount: Decimal
    target_date: date | None = None
    progress_percentage: Decimal
    monthly_required: Decimal
    pace_status: str
    pace_label: str
    shortfall_amount: Decimal


class SavingsGoalSummaryResponse(BaseModel):
    period_label: str
    active_goal_count: int
    total_saved: Decimal
    total_target: Decimal
    overall_progress: Decimal
    comfortable_monthly_savings: Decimal
    total_monthly_required: Decimal
    goals: list[SavingsGoalHealthResponse]


class SavingsGoalProjectionRequest(BaseModel):
    target_amount: Decimal = Field(gt=0)
    current_amount: Decimal = Field(default=0, ge=0)
    target_date: date
    monthly_contribution: Decimal | None = Field(default=None, gt=0)


class SavingsGoalProjectionResponse(BaseModel):
    monthly_required: Decimal
    income_share_percentage: Decimal | None = None
    feasible_status: str
    feasible_label: str
    comfortable_monthly_savings: Decimal
    projected_completion_date: date | None = None
    will_hit_target_on_time: bool


class SavingsGoalAllocationResponse(BaseModel):
    goal_id: UUID
    name: str
    recommended_monthly_contribution: Decimal
    required_monthly_contribution: Decimal
    pace_status: str


class SavingsGoalRecommendationResponse(BaseModel):
    period_label: str
    comfortable_monthly_savings: Decimal
    total_monthly_required: Decimal
    can_fund_all_goals_on_time: bool
    recommendation_text: str
    allocations: list[SavingsGoalAllocationResponse]
