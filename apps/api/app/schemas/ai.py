from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class GeneralAdviceRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class GeneralAdviceContextResponse(BaseModel):
    currency_code: str
    currency_symbol: str
    month_label: str
    current_month_income: Decimal
    current_month_expense: Decimal
    current_month_net: Decimal
    active_goal_count: int
    comfortable_monthly_savings: Decimal
    behavior_label: str
    behavior_score: int
    top_spending_category: str | None = None
    savings_rate: Decimal


class GeneralAdviceResponse(BaseModel):
    guidance: str
    provider: str
    model_name: str
    context: GeneralAdviceContextResponse


class PurchaseCheckRequest(BaseModel):
    planned_amount: Decimal = Field(gt=0)
    item_name: str = Field(min_length=1, max_length=120)
    question: str = Field(min_length=1, max_length=500)
    category_id: UUID | None = None


class PurchaseCheckContextResponse(BaseModel):
    currency_code: str
    currency_symbol: str
    month_label: str
    planned_amount: Decimal
    item_name: str
    category_name: str | None = None
    current_category_spend: Decimal | None = None
    category_budget_limit: Decimal | None = None
    current_month_income: Decimal
    current_month_expense: Decimal
    current_month_net: Decimal
    top_spending_category: str | None = None
    active_goal_count: int
    total_goal_monthly_required: Decimal
    comfortable_monthly_savings: Decimal
    affordability_ratio: Decimal
    verdict: str
    suggested_action: str


class PurchaseCheckResponse(BaseModel):
    verdict: str
    affordability_score: int
    guidance: str
    provider: str
    model_name: str
    context: PurchaseCheckContextResponse


class SavingsAdviceRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    goal_id: UUID | None = None


class SavingsAdviceAllocationResponse(BaseModel):
    goal_id: UUID
    name: str
    recommended_monthly_contribution: Decimal
    required_monthly_contribution: Decimal
    pace_status: str


class SavingsAdviceContextResponse(BaseModel):
    currency_code: str
    currency_symbol: str
    month_label: str
    current_month_income: Decimal
    current_month_expense: Decimal
    current_month_net: Decimal
    active_goal_count: int
    comfortable_monthly_savings: Decimal
    total_goal_monthly_required: Decimal
    overall_goal_progress: Decimal
    can_fund_all_goals_on_time: bool
    recommendation_text: str
    focus_goal_name: str | None = None
    focus_goal_progress_percentage: Decimal | None = None
    focus_goal_monthly_required: Decimal | None = None
    focus_goal_pace_status: str | None = None
    allocations: list[SavingsAdviceAllocationResponse]


class SavingsAdviceResponse(BaseModel):
    guidance: str
    provider: str
    model_name: str
    context: SavingsAdviceContextResponse


class SpendingSummaryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    months: int = Field(default=4, ge=2, le=12)


class SpendingSummaryCategoryResponse(BaseModel):
    name: str
    total_amount: Decimal
    percentage: Decimal
    trend_direction: str


class SpendingSummaryContextResponse(BaseModel):
    currency_code: str
    currency_symbol: str
    period_label: str
    total_spent: Decimal
    behavior_label: str
    behavior_score: int
    planned_buys: int
    impulse_buys: int
    overspent_days: int
    strongest_insight_title: str | None = None
    strongest_insight_description: str | None = None
    top_categories: list[SpendingSummaryCategoryResponse]


class SpendingSummaryResponse(BaseModel):
    guidance: str
    provider: str
    model_name: str
    context: SpendingSummaryContextResponse


class ReportSummaryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    months: int = Field(default=4, ge=2, le=12)


class ReportSummaryTransactionResponse(BaseModel):
    title: str
    amount: Decimal
    transaction_date: str
    category_name: str | None = None


class AIReportSummaryContextResponse(BaseModel):
    currency_code: str
    currency_symbol: str
    period_label: str
    total_income: Decimal
    total_expense: Decimal
    net_saved: Decimal
    transaction_count: int
    savings_rate: Decimal
    savings_rate_delta: Decimal | None = None
    top_category_name: str | None = None
    top_category_total_amount: Decimal | None = None
    largest_transactions: list[ReportSummaryTransactionResponse]


class AIReportSummaryResponse(BaseModel):
    guidance: str
    provider: str
    model_name: str
    context: AIReportSummaryContextResponse
