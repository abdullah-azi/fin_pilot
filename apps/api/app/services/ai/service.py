from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import AIContextType
from app.models.transaction import Transaction
from app.models.user import User
from app.services.ai.logging import log_ai_advice
from app.services.ai.openai_compatible import build_default_provider
from app.services.ai.provider import AICompletionResult, AIProvider
from app.services.categories import get_category_view
from app.services.dashboard import build_dashboard_summary
from app.services.insights import build_report_summary, build_spending_analysis
from app.services.savings_goals import build_goal_recommendation, build_goal_summary

MONEY_QUANTUM = Decimal("0.01")


@dataclass(slots=True)
class PurchaseCheckInput:
    planned_amount: Decimal
    item_name: str
    question: str
    category_id: UUID | None = None


@dataclass(slots=True)
class GeneralAdviceInput:
    question: str


@dataclass(slots=True)
class GeneralAdviceContext:
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
    top_spending_category: str | None
    savings_rate: Decimal


@dataclass(slots=True)
class GeneralAdviceResult:
    guidance: str
    provider: str
    model_name: str
    context: GeneralAdviceContext


@dataclass(slots=True)
class PurchaseCheckContext:
    currency_code: str
    currency_symbol: str
    month_label: str
    planned_amount: Decimal
    item_name: str
    category_name: str | None
    current_category_spend: Decimal | None
    category_budget_limit: Decimal | None
    current_month_income: Decimal
    current_month_expense: Decimal
    current_month_net: Decimal
    top_spending_category: str | None
    active_goal_count: int
    total_goal_monthly_required: Decimal
    comfortable_monthly_savings: Decimal
    affordability_ratio: Decimal
    verdict: str
    suggested_action: str


@dataclass(slots=True)
class PurchaseCheckResult:
    verdict: str
    affordability_score: int
    context: PurchaseCheckContext
    guidance: str
    provider: str
    model_name: str


@dataclass(slots=True)
class SavingsAdviceInput:
    question: str
    goal_id: UUID | None = None


@dataclass(slots=True)
class SavingsAdviceAllocationContext:
    goal_id: UUID
    name: str
    recommended_monthly_contribution: Decimal
    required_monthly_contribution: Decimal
    pace_status: str


@dataclass(slots=True)
class SavingsAdviceContext:
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
    focus_goal_name: str | None
    focus_goal_progress_percentage: Decimal | None
    focus_goal_monthly_required: Decimal | None
    focus_goal_pace_status: str | None
    allocations: list[SavingsAdviceAllocationContext]


@dataclass(slots=True)
class SavingsAdviceResult:
    guidance: str
    provider: str
    model_name: str
    context: SavingsAdviceContext


@dataclass(slots=True)
class SpendingSummaryInput:
    question: str
    months: int = 4


@dataclass(slots=True)
class SpendingSummaryCategoryContext:
    name: str
    total_amount: Decimal
    percentage: Decimal
    trend_direction: str


@dataclass(slots=True)
class SpendingSummaryContext:
    currency_code: str
    currency_symbol: str
    period_label: str
    total_spent: Decimal
    behavior_label: str
    behavior_score: int
    planned_buys: int
    impulse_buys: int
    overspent_days: int
    strongest_insight_title: str | None
    strongest_insight_description: str | None
    top_categories: list[SpendingSummaryCategoryContext]


@dataclass(slots=True)
class SpendingSummaryResult:
    guidance: str
    provider: str
    model_name: str
    context: SpendingSummaryContext


@dataclass(slots=True)
class ReportSummaryInput:
    question: str
    months: int = 4


@dataclass(slots=True)
class ReportSummaryTransactionContext:
    title: str
    amount: Decimal
    transaction_date: date
    category_name: str | None


@dataclass(slots=True)
class ReportSummaryContext:
    currency_code: str
    currency_symbol: str
    period_label: str
    total_income: Decimal
    total_expense: Decimal
    net_saved: Decimal
    transaction_count: int
    savings_rate: Decimal
    savings_rate_delta: Decimal | None
    top_category_name: str | None
    top_category_total_amount: Decimal | None
    largest_transactions: list[ReportSummaryTransactionContext]


@dataclass(slots=True)
class ReportSummaryResult:
    guidance: str
    provider: str
    model_name: str
    context: ReportSummaryContext


class AIService:
    def __init__(self, provider: AIProvider | None = None) -> None:
        self.provider = provider or build_default_provider()

    async def general_advice(
        self,
        db: Session,
        *,
        user_id: UUID,
        payload: GeneralAdviceInput,
    ) -> GeneralAdviceResult:
        context = self.build_general_advice_context(db, user_id=user_id)
        response = await self.provider.generate_finance_guidance(
            messages=_general_advice_messages(question=payload.question, context=context),
            temperature=0.3,
        )

        log_ai_advice(
            db,
            user_id=user_id,
            question=payload.question,
            context_type=AIContextType.GENERAL_ADVICE,
            result=response,
            request_metadata={
                "behavior_score": context.behavior_score,
                "active_goal_count": context.active_goal_count,
                "current_month_net": str(context.current_month_net),
            },
        )

        return GeneralAdviceResult(
            guidance=response.text,
            provider=response.provider,
            model_name=response.model_name,
            context=context,
        )

    async def purchase_check(
        self,
        db: Session,
        *,
        user_id: UUID,
        payload: PurchaseCheckInput,
    ) -> PurchaseCheckResult:
        if payload.planned_amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="planned_amount must be greater than zero.",
            )

        context = self.build_purchase_check_context(
            db,
            user_id=user_id,
            planned_amount=payload.planned_amount,
            item_name=payload.item_name,
            category_id=payload.category_id,
        )
        response = await self.provider.generate_finance_guidance(
            messages=_purchase_check_messages(question=payload.question, context=context),
            temperature=0.2,
        )

        log_ai_advice(
            db,
            user_id=user_id,
            question=payload.question,
            context_type=AIContextType.PURCHASE_CHECK,
            result=response,
            request_metadata={
                "verdict": context.verdict,
                "affordability_ratio": str(context.affordability_ratio),
                "planned_amount": str(context.planned_amount),
                "item_name": context.item_name,
            },
        )

        return PurchaseCheckResult(
            verdict=context.verdict,
            affordability_score=_affordability_score(context.affordability_ratio, context.verdict),
            context=context,
            guidance=response.text,
            provider=response.provider,
            model_name=response.model_name,
        )

    async def savings_advice(
        self,
        db: Session,
        *,
        user_id: UUID,
        payload: SavingsAdviceInput,
    ) -> SavingsAdviceResult:
        context = self.build_savings_advice_context(
            db,
            user_id=user_id,
            goal_id=payload.goal_id,
        )
        response = await self.provider.generate_finance_guidance(
            messages=_savings_advice_messages(question=payload.question, context=context),
            temperature=0.2,
        )

        log_ai_advice(
            db,
            user_id=user_id,
            question=payload.question,
            context_type=AIContextType.SAVINGS_GOAL,
            result=response,
            request_metadata={
                "goal_id": str(payload.goal_id) if payload.goal_id else None,
                "active_goal_count": context.active_goal_count,
                "can_fund_all_goals_on_time": context.can_fund_all_goals_on_time,
                "comfortable_monthly_savings": str(context.comfortable_monthly_savings),
                "total_goal_monthly_required": str(context.total_goal_monthly_required),
            },
        )

        return SavingsAdviceResult(
            guidance=response.text,
            provider=response.provider,
            model_name=response.model_name,
            context=context,
        )

    async def spending_summary(
        self,
        db: Session,
        *,
        user_id: UUID,
        payload: SpendingSummaryInput,
    ) -> SpendingSummaryResult:
        context = self.build_spending_summary_context(
            db,
            user_id=user_id,
            months=payload.months,
        )
        response = await self.provider.generate_finance_guidance(
            messages=_spending_summary_messages(question=payload.question, context=context),
            temperature=0.2,
        )

        log_ai_advice(
            db,
            user_id=user_id,
            question=payload.question,
            context_type=AIContextType.SPENDING_SUMMARY,
            result=response,
            request_metadata={
                "months": payload.months,
                "total_spent": str(context.total_spent),
                "behavior_score": context.behavior_score,
            },
        )

        return SpendingSummaryResult(
            guidance=response.text,
            provider=response.provider,
            model_name=response.model_name,
            context=context,
        )

    async def report_summary(
        self,
        db: Session,
        *,
        user_id: UUID,
        payload: ReportSummaryInput,
    ) -> ReportSummaryResult:
        context = self.build_report_summary_context(
            db,
            user_id=user_id,
            months=payload.months,
        )
        response = await self.provider.generate_finance_guidance(
            messages=_report_summary_messages(question=payload.question, context=context),
            temperature=0.2,
        )

        log_ai_advice(
            db,
            user_id=user_id,
            question=payload.question,
            context_type=AIContextType.REPORT_SUMMARY,
            result=response,
            request_metadata={
                "months": payload.months,
                "net_saved": str(context.net_saved),
                "savings_rate": str(context.savings_rate),
            },
        )

        return ReportSummaryResult(
            guidance=response.text,
            provider=response.provider,
            model_name=response.model_name,
            context=context,
        )

    def build_purchase_check_context(
        self,
        db: Session,
        *,
        user_id: UUID,
        planned_amount: Decimal,
        item_name: str,
        category_id: UUID | None,
    ) -> PurchaseCheckContext:
        currency_code, currency_symbol = _get_user_currency_profile(db, user_id)
        dashboard = build_dashboard_summary(db, user_id)
        today = date.today()
        goal_summary = build_goal_summary(db, user_id)
        category_name: str | None = None
        current_category_spend: Decimal | None = None
        category_budget_limit: Decimal | None = None

        if category_id is not None:
            category_view = get_category_view(db, user_id=user_id, category_id=category_id)
            category_name = category_view.effective_name
            category_budget_limit = category_view.monthly_budget_limit
            current_category_spend = _current_month_category_spend(
                db,
                user_id=user_id,
                category_id=category_id,
                today=today,
            )

        available_after_purchase = (dashboard.summary.net - planned_amount).quantize(MONEY_QUANTUM)
        affordability_ratio = (
            (dashboard.summary.net / planned_amount).quantize(MONEY_QUANTUM)
            if planned_amount > 0
            else Decimal("1.00")
        )
        budget_pressure = (
            category_budget_limit is not None
            and current_category_spend is not None
            and (current_category_spend + planned_amount) > category_budget_limit
        )
        goal_pressure = goal_summary.comfortable_monthly_savings < goal_summary.total_monthly_required

        verdict = "safe"
        suggested_action = "This purchase fits your current month comfortably."
        if dashboard.summary.net <= 0 or available_after_purchase < 0 or budget_pressure:
            verdict = "not_recommended"
            suggested_action = "Delay this purchase or reduce the amount before proceeding."
        elif affordability_ratio < Decimal("1.50") or goal_pressure:
            verdict = "caution"
            suggested_action = "This is possible, but it puts pressure on your current month or goals."

        return PurchaseCheckContext(
            currency_code=currency_code,
            currency_symbol=currency_symbol,
            month_label=dashboard.month_label,
            planned_amount=planned_amount.quantize(MONEY_QUANTUM),
            item_name=item_name,
            category_name=category_name,
            current_category_spend=current_category_spend.quantize(MONEY_QUANTUM)
            if current_category_spend is not None
            else None,
            category_budget_limit=category_budget_limit.quantize(MONEY_QUANTUM)
            if category_budget_limit is not None
            else None,
            current_month_income=dashboard.summary.total_income,
            current_month_expense=dashboard.summary.total_expense,
            current_month_net=dashboard.summary.net,
            top_spending_category=dashboard.top_categories[0].name if dashboard.top_categories else None,
            active_goal_count=goal_summary.active_goal_count,
            total_goal_monthly_required=goal_summary.total_monthly_required,
            comfortable_monthly_savings=goal_summary.comfortable_monthly_savings,
            affordability_ratio=affordability_ratio,
            verdict=verdict,
            suggested_action=suggested_action,
        )

    def build_general_advice_context(
        self,
        db: Session,
        *,
        user_id: UUID,
    ) -> GeneralAdviceContext:
        currency_code, currency_symbol = _get_user_currency_profile(db, user_id)
        dashboard = build_dashboard_summary(db, user_id)
        goal_summary = build_goal_summary(db, user_id)
        analysis = build_spending_analysis(db, user_id, months=4)
        report = build_report_summary(db, user_id, months=4)

        return GeneralAdviceContext(
            currency_code=currency_code,
            currency_symbol=currency_symbol,
            month_label=dashboard.month_label,
            current_month_income=dashboard.summary.total_income,
            current_month_expense=dashboard.summary.total_expense,
            current_month_net=dashboard.summary.net,
            active_goal_count=goal_summary.active_goal_count,
            comfortable_monthly_savings=goal_summary.comfortable_monthly_savings,
            behavior_label=analysis.behavior.label,
            behavior_score=analysis.behavior.score,
            top_spending_category=dashboard.top_categories[0].name if dashboard.top_categories else None,
            savings_rate=report.savings_rate,
        )

    def build_savings_advice_context(
        self,
        db: Session,
        *,
        user_id: UUID,
        goal_id: UUID | None,
    ) -> SavingsAdviceContext:
        currency_code, currency_symbol = _get_user_currency_profile(db, user_id)
        dashboard = build_dashboard_summary(db, user_id)
        goal_summary = build_goal_summary(db, user_id)
        recommendation = build_goal_recommendation(db, user_id)

        focus_goal = None
        if goal_id is not None:
            focus_goal = next((goal for goal in goal_summary.goals if goal.goal_id == goal_id), None)
            if focus_goal is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Savings goal not found.",
                )

        return SavingsAdviceContext(
            currency_code=currency_code,
            currency_symbol=currency_symbol,
            month_label=goal_summary.period_label,
            current_month_income=dashboard.summary.total_income,
            current_month_expense=dashboard.summary.total_expense,
            current_month_net=dashboard.summary.net,
            active_goal_count=goal_summary.active_goal_count,
            comfortable_monthly_savings=goal_summary.comfortable_monthly_savings,
            total_goal_monthly_required=goal_summary.total_monthly_required,
            overall_goal_progress=goal_summary.overall_progress,
            can_fund_all_goals_on_time=recommendation.can_fund_all_goals_on_time,
            recommendation_text=recommendation.recommendation_text,
            focus_goal_name=focus_goal.name if focus_goal else None,
            focus_goal_progress_percentage=focus_goal.progress_percentage if focus_goal else None,
            focus_goal_monthly_required=focus_goal.monthly_required if focus_goal else None,
            focus_goal_pace_status=focus_goal.pace_status if focus_goal else None,
            allocations=[
                SavingsAdviceAllocationContext(
                    goal_id=allocation.goal_id,
                    name=allocation.name,
                    recommended_monthly_contribution=allocation.recommended_monthly_contribution,
                    required_monthly_contribution=allocation.required_monthly_contribution,
                    pace_status=allocation.pace_status,
                )
                for allocation in recommendation.allocations
            ],
        )

    def build_spending_summary_context(
        self,
        db: Session,
        *,
        user_id: UUID,
        months: int,
    ) -> SpendingSummaryContext:
        currency_code, currency_symbol = _get_user_currency_profile(db, user_id)
        analysis = build_spending_analysis(db, user_id, months=months)
        strongest_insight = analysis.insights[0] if analysis.insights else None
        return SpendingSummaryContext(
            currency_code=currency_code,
            currency_symbol=currency_symbol,
            period_label=analysis.period_label,
            total_spent=analysis.total_spent,
            behavior_label=analysis.behavior.label,
            behavior_score=analysis.behavior.score,
            planned_buys=analysis.behavior.planned_buys,
            impulse_buys=analysis.behavior.impulse_buys,
            overspent_days=analysis.behavior.overspent_days,
            strongest_insight_title=strongest_insight.title if strongest_insight else None,
            strongest_insight_description=strongest_insight.description if strongest_insight else None,
            top_categories=[
                SpendingSummaryCategoryContext(
                    name=item.name,
                    total_amount=item.total_amount,
                    percentage=item.percentage,
                    trend_direction=item.trend_direction,
                )
                for item in analysis.category_breakdown[:3]
            ],
        )

    def build_report_summary_context(
        self,
        db: Session,
        *,
        user_id: UUID,
        months: int,
    ) -> ReportSummaryContext:
        currency_code, currency_symbol = _get_user_currency_profile(db, user_id)
        report = build_report_summary(db, user_id, months=months)
        top_category = report.category_table[0] if report.category_table else None
        return ReportSummaryContext(
            currency_code=currency_code,
            currency_symbol=currency_symbol,
            period_label=report.period_label,
            total_income=report.total_income,
            total_expense=report.total_expense,
            net_saved=report.net_saved,
            transaction_count=report.transaction_count,
            savings_rate=report.savings_rate,
            savings_rate_delta=report.savings_rate_delta,
            top_category_name=top_category.name if top_category else None,
            top_category_total_amount=top_category.total_amount if top_category else None,
            largest_transactions=[
                ReportSummaryTransactionContext(
                    title=item.transaction.title,
                    amount=item.transaction.amount,
                    transaction_date=item.transaction.transaction_date,
                    category_name=item.category_name,
                )
                for item in report.largest_transactions
            ],
        )


def _purchase_check_messages(*, question: str, context: PurchaseCheckContext) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are FinPilot, an AI finance assistant. "
                "Use the provided financial facts as ground truth. "
                "Do not recalculate balances beyond the provided context. "
                "Be concise, practical, and non-judgmental. "
                f"Always express money using {context.currency_code} and the {context.currency_symbol} notation. "
                "Never switch to dollars unless the provided currency is USD. "
                "Explain whether the purchase is safe, requires caution, or is not recommended."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {question}\n"
                f"Context: {render_purchase_check_context(context)}\n"
                "Respond in a short paragraph followed by 2-4 brief bullet reasons."
            ),
        },
    ]


def _general_advice_messages(*, question: str, context: GeneralAdviceContext) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are FinPilot, an AI finance assistant. "
                "Answer like a practical chat assistant, but use the provided financial facts as ground truth. "
                "Do not invent balances, rates, or spending totals. "
                f"Always express money using {context.currency_code} and the {context.currency_symbol} notation. "
                "Never switch to dollars unless the provided currency is USD. "
                "Be concise, useful, and conversational. "
                "If the user asks something broad, prioritize the next best action."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {question}\n"
                f"Context: {render_general_advice_context(context)}\n"
                "Respond in a short paragraph followed by 2-4 brief bullet points when helpful."
            ),
        },
    ]


def _savings_advice_messages(*, question: str, context: SavingsAdviceContext) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are FinPilot, an AI finance assistant. "
                "Use the provided savings and cash-flow facts as ground truth. "
                "Do not invent balances or contribution numbers. "
                f"Always express money using {context.currency_code} and the {context.currency_symbol} notation. "
                "Never switch to dollars unless the provided currency is USD. "
                "Be practical, concise, and action-oriented. "
                "Explain how the user should approach savings this month and what to prioritize first."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {question}\n"
                f"Context: {render_savings_advice_context(context)}\n"
                "Respond in one short paragraph followed by 2-4 brief bullet actions."
            ),
        },
    ]


def _spending_summary_messages(*, question: str, context: SpendingSummaryContext) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are FinPilot, an AI finance assistant. "
                "Use the provided spending analytics as ground truth. "
                "Do not invent categories, scores, or totals. "
                f"Always express money using {context.currency_code} and the {context.currency_symbol} notation. "
                "Never switch to dollars unless the provided currency is USD. "
                "Be concise, practical, and slightly analytical. "
                "Summarize the user's spending pattern and what to improve next."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {question}\n"
                f"Context: {render_spending_summary_context(context)}\n"
                "Respond in one short paragraph followed by 2-4 brief bullet actions."
            ),
        },
    ]


def _report_summary_messages(*, question: str, context: ReportSummaryContext) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are FinPilot, an AI finance assistant. "
                "Use the provided report summary as ground truth. "
                "Do not invent balances or trends beyond the provided data. "
                f"Always express money using {context.currency_code} and the {context.currency_symbol} notation. "
                "Never switch to dollars unless the provided currency is USD. "
                "Be concise and executive-style, highlighting the strongest positive and negative signal."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {question}\n"
                f"Context: {render_report_summary_context(context)}\n"
                "Respond in one short paragraph followed by 2-4 brief bullet takeaways."
            ),
        },
    ]


def render_purchase_check_context(context: PurchaseCheckContext) -> str:
    parts = {
        "currency_code": context.currency_code,
        "currency_symbol": context.currency_symbol,
        "month_label": context.month_label,
        "item_name": context.item_name,
        "planned_amount": _format_money_for_ai(context.planned_amount, context.currency_code, context.currency_symbol),
        "category_name": context.category_name,
        "current_category_spend": (
            _format_money_for_ai(context.current_category_spend, context.currency_code, context.currency_symbol)
            if context.current_category_spend is not None
            else None
        ),
        "category_budget_limit": (
            _format_money_for_ai(context.category_budget_limit, context.currency_code, context.currency_symbol)
            if context.category_budget_limit is not None
            else None
        ),
        "current_month_income": _format_money_for_ai(context.current_month_income, context.currency_code, context.currency_symbol),
        "current_month_expense": _format_money_for_ai(context.current_month_expense, context.currency_code, context.currency_symbol),
        "current_month_net": _format_money_for_ai(context.current_month_net, context.currency_code, context.currency_symbol),
        "top_spending_category": context.top_spending_category,
        "active_goal_count": str(context.active_goal_count),
        "total_goal_monthly_required": _format_money_for_ai(
            context.total_goal_monthly_required,
            context.currency_code,
            context.currency_symbol,
        ),
        "comfortable_monthly_savings": _format_money_for_ai(
            context.comfortable_monthly_savings,
            context.currency_code,
            context.currency_symbol,
        ),
        "affordability_ratio": str(context.affordability_ratio),
        "verdict": context.verdict,
        "suggested_action": context.suggested_action,
    }
    return ", ".join(f"{key}={value}" for key, value in parts.items() if value is not None)


def render_general_advice_context(context: GeneralAdviceContext) -> str:
    parts = {
        "currency_code": context.currency_code,
        "currency_symbol": context.currency_symbol,
        "month_label": context.month_label,
        "current_month_income": _format_money_for_ai(context.current_month_income, context.currency_code, context.currency_symbol),
        "current_month_expense": _format_money_for_ai(context.current_month_expense, context.currency_code, context.currency_symbol),
        "current_month_net": _format_money_for_ai(context.current_month_net, context.currency_code, context.currency_symbol),
        "active_goal_count": str(context.active_goal_count),
        "comfortable_monthly_savings": _format_money_for_ai(
            context.comfortable_monthly_savings,
            context.currency_code,
            context.currency_symbol,
        ),
        "behavior_label": context.behavior_label,
        "behavior_score": str(context.behavior_score),
        "top_spending_category": context.top_spending_category,
        "savings_rate": str(context.savings_rate),
    }
    return ", ".join(f"{key}={value}" for key, value in parts.items() if value is not None)


def render_savings_advice_context(context: SavingsAdviceContext) -> str:
    parts = {
        "currency_code": context.currency_code,
        "currency_symbol": context.currency_symbol,
        "month_label": context.month_label,
        "current_month_income": _format_money_for_ai(context.current_month_income, context.currency_code, context.currency_symbol),
        "current_month_expense": _format_money_for_ai(context.current_month_expense, context.currency_code, context.currency_symbol),
        "current_month_net": _format_money_for_ai(context.current_month_net, context.currency_code, context.currency_symbol),
        "active_goal_count": str(context.active_goal_count),
        "comfortable_monthly_savings": _format_money_for_ai(
            context.comfortable_monthly_savings,
            context.currency_code,
            context.currency_symbol,
        ),
        "total_goal_monthly_required": _format_money_for_ai(
            context.total_goal_monthly_required,
            context.currency_code,
            context.currency_symbol,
        ),
        "overall_goal_progress": str(context.overall_goal_progress),
        "can_fund_all_goals_on_time": str(context.can_fund_all_goals_on_time),
        "recommendation_text": context.recommendation_text,
        "focus_goal_name": context.focus_goal_name,
        "focus_goal_progress_percentage": (
            str(context.focus_goal_progress_percentage)
            if context.focus_goal_progress_percentage is not None
            else None
        ),
        "focus_goal_monthly_required": (
            _format_money_for_ai(context.focus_goal_monthly_required, context.currency_code, context.currency_symbol)
            if context.focus_goal_monthly_required is not None
            else None
        ),
        "focus_goal_pace_status": context.focus_goal_pace_status,
        "allocations": "; ".join(
            (
                f"{allocation.name}: recommended="
                f"{_format_money_for_ai(allocation.recommended_monthly_contribution, context.currency_code, context.currency_symbol)}, "
                f"required={_format_money_for_ai(allocation.required_monthly_contribution, context.currency_code, context.currency_symbol)}, "
                f"pace={allocation.pace_status}"
            )
            for allocation in context.allocations
        ),
    }
    return ", ".join(f"{key}={value}" for key, value in parts.items() if value not in {None, ""})


def render_spending_summary_context(context: SpendingSummaryContext) -> str:
    parts = {
        "currency_code": context.currency_code,
        "currency_symbol": context.currency_symbol,
        "period_label": context.period_label,
        "total_spent": _format_money_for_ai(context.total_spent, context.currency_code, context.currency_symbol),
        "behavior_label": context.behavior_label,
        "behavior_score": str(context.behavior_score),
        "planned_buys": str(context.planned_buys),
        "impulse_buys": str(context.impulse_buys),
        "overspent_days": str(context.overspent_days),
        "strongest_insight_title": context.strongest_insight_title,
        "strongest_insight_description": context.strongest_insight_description,
        "top_categories": "; ".join(
            (
                f"{category.name}: amount={_format_money_for_ai(category.total_amount, context.currency_code, context.currency_symbol)}, "
                f"share={category.percentage}%, trend={category.trend_direction}"
            )
            for category in context.top_categories
        ),
    }
    return ", ".join(f"{key}={value}" for key, value in parts.items() if value not in {None, ""})


def render_report_summary_context(context: ReportSummaryContext) -> str:
    parts = {
        "currency_code": context.currency_code,
        "currency_symbol": context.currency_symbol,
        "period_label": context.period_label,
        "total_income": _format_money_for_ai(context.total_income, context.currency_code, context.currency_symbol),
        "total_expense": _format_money_for_ai(context.total_expense, context.currency_code, context.currency_symbol),
        "net_saved": _format_money_for_ai(context.net_saved, context.currency_code, context.currency_symbol),
        "transaction_count": str(context.transaction_count),
        "savings_rate": str(context.savings_rate),
        "savings_rate_delta": str(context.savings_rate_delta) if context.savings_rate_delta is not None else None,
        "top_category_name": context.top_category_name,
        "top_category_total_amount": (
            _format_money_for_ai(context.top_category_total_amount, context.currency_code, context.currency_symbol)
            if context.top_category_total_amount is not None
            else None
        ),
        "largest_transactions": "; ".join(
            (
                f"{item.title}: amount={_format_money_for_ai(item.amount, context.currency_code, context.currency_symbol)}, "
                f"date={item.transaction_date.isoformat()}, "
                f"category={item.category_name}"
            )
            for item in context.largest_transactions
        ),
    }
    return ", ".join(f"{key}={value}" for key, value in parts.items() if value not in {None, ""})


def serialize_purchase_check_result(result: PurchaseCheckResult) -> dict[str, Any]:
    return {
        "verdict": result.verdict,
        "affordability_score": result.affordability_score,
        "guidance": result.guidance,
        "provider": result.provider,
        "model_name": result.model_name,
        "context": {
            key: str(value) if isinstance(value, Decimal) else value
            for key, value in asdict(result.context).items()
        },
    }


def serialize_general_advice_result(result: GeneralAdviceResult) -> dict[str, Any]:
    return {
        "guidance": result.guidance,
        "provider": result.provider,
        "model_name": result.model_name,
        "context": {
            key: str(value) if isinstance(value, Decimal) else value
            for key, value in asdict(result.context).items()
        },
    }


def serialize_savings_advice_result(result: SavingsAdviceResult) -> dict[str, Any]:
    return {
        "guidance": result.guidance,
        "provider": result.provider,
        "model_name": result.model_name,
        "context": {
            key: [
                {
                    nested_key: str(nested_value) if isinstance(nested_value, Decimal) else nested_value
                    for nested_key, nested_value in asdict(item).items()
                }
                for item in value
            ]
            if isinstance(value, list)
            else (str(value) if isinstance(value, Decimal) else value)
            for key, value in asdict(result.context).items()
        },
    }


def serialize_spending_summary_result(result: SpendingSummaryResult) -> dict[str, Any]:
    return {
        "guidance": result.guidance,
        "provider": result.provider,
        "model_name": result.model_name,
        "context": {
            key: [
                {
                    nested_key: str(nested_value) if isinstance(nested_value, Decimal) else nested_value
                    for nested_key, nested_value in asdict(item).items()
                }
                for item in value
            ]
            if isinstance(value, list)
            else (str(value) if isinstance(value, Decimal) else value)
            for key, value in asdict(result.context).items()
        },
    }


def serialize_report_summary_result(result: ReportSummaryResult) -> dict[str, Any]:
    return {
        "guidance": result.guidance,
        "provider": result.provider,
        "model_name": result.model_name,
        "context": {
            key: [
                {
                    nested_key: nested_value.isoformat()
                    if isinstance(nested_value, date)
                    else (str(nested_value) if isinstance(nested_value, Decimal) else nested_value)
                    for nested_key, nested_value in asdict(item).items()
                }
                for item in value
            ]
            if isinstance(value, list)
            else (str(value) if isinstance(value, Decimal) else value)
            for key, value in asdict(result.context).items()
        },
    }


def _affordability_score(affordability_ratio: Decimal, verdict: str) -> int:
    raw_score = min(100, max(0, int((affordability_ratio * Decimal("40")).to_integral_value())))
    if verdict == "safe":
        return max(70, raw_score)
    if verdict == "caution":
        return min(69, max(40, raw_score))
    return min(39, raw_score)


def _current_month_category_spend(
    db: Session,
    *,
    user_id: UUID,
    category_id: UUID,
    today: date,
) -> Decimal:
    month_start = today.replace(day=1)
    total = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user_id,
            Transaction.category_id == category_id,
            Transaction.transaction_date >= month_start,
            Transaction.transaction_date <= today,
        )
    )
    return Decimal(total).quantize(MONEY_QUANTUM)


def _get_user_currency_profile(db: Session, user_id: UUID) -> tuple[str, str]:
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    currency_code = (user.currency or "USD").upper()
    return currency_code, _currency_symbol(currency_code)


def _currency_symbol(currency_code: str) -> str:
    symbols = {
        "PKR": "Rs",
        "USD": "$",
        "EUR": "EUR",
        "QAR": "QAR",
    }
    return symbols.get(currency_code.upper(), currency_code.upper())


def _format_money_for_ai(value: Decimal, currency_code: str, currency_symbol: str) -> str:
    numeric = value.quantize(MONEY_QUANTUM)
    amount = f"{numeric:,.2f}"
    if currency_code == "USD":
        return f"{currency_symbol}{amount}"
    return f"{currency_symbol} {amount}"
