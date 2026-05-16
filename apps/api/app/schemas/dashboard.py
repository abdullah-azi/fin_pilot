from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.transaction import TransactionCategorySnapshot, TransactionHistoryItemResponse


class DashboardCategorySummary(BaseModel):
    category_id: UUID | None
    name: str
    color: str | None = None
    icon: str | None = None
    percentage: Decimal
    total_amount: Decimal


class DashboardGoalSummary(BaseModel):
    goal_id: UUID
    name: str
    current_amount: Decimal
    target_amount: Decimal
    progress_percentage: Decimal
    target_date: date | None = None


class DashboardMonthlySummary(BaseModel):
    transaction_count: int
    total_expense: Decimal
    total_income: Decimal
    net: Decimal


class DashboardSummaryResponse(BaseModel):
    active_goal: DashboardGoalSummary | None = None
    insight: str
    month_label: str
    recent_transactions: list[TransactionHistoryItemResponse]
    summary: DashboardMonthlySummary
    top_categories: list[DashboardCategorySummary]
