from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.transaction import TransactionHistoryItemResponse


class InsightCategoryAnalytics(BaseModel):
    category_id: UUID | None
    name: str
    color: str | None = None
    icon: str | None = None
    total_amount: Decimal
    percentage: Decimal
    delta_percentage: Decimal | None = None
    trend_direction: str


class InsightMonthlySpendPoint(BaseModel):
    month_key: str
    month_label: str
    total_amount: Decimal
    is_current: bool


class InsightMonthlyCashflowPoint(BaseModel):
    month_key: str
    month_label: str
    total_income: Decimal
    total_expense: Decimal
    net: Decimal
    is_current: bool


class SpendingBehaviorSummary(BaseModel):
    label: str
    score: int
    planned_buys: int
    impulse_buys: int
    overspent_days: int


class InsightCard(BaseModel):
    severity: str
    title: str
    description: str


class SpendingAnalysisResponse(BaseModel):
    period_label: str
    total_spent: Decimal
    category_breakdown: list[InsightCategoryAnalytics]
    monthly_trend: list[InsightMonthlySpendPoint]
    behavior: SpendingBehaviorSummary
    insights: list[InsightCard]


class ReportSummaryResponse(BaseModel):
    period_label: str
    net_saved: Decimal
    total_income: Decimal
    total_expense: Decimal
    transaction_count: int
    savings_rate: Decimal
    savings_rate_delta: Decimal | None = None
    monthly_overview: list[InsightMonthlyCashflowPoint]
    category_table: list[InsightCategoryAnalytics]
    largest_transactions: list[TransactionHistoryItemResponse]
