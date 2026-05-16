from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.insights import (
    InsightCard,
    InsightCategoryAnalytics,
    InsightMonthlyCashflowPoint,
    InsightMonthlySpendPoint,
    ReportSummaryResponse,
    SpendingAnalysisResponse,
    SpendingBehaviorSummary,
)
from app.schemas.transaction import TransactionCategorySnapshot, TransactionHistoryItemResponse
from app.services.insights import build_report_summary, build_spending_analysis

router = APIRouter()


@router.get("/summary", response_model=SpendingAnalysisResponse)
async def insights_summary(
    months: int = Query(default=4, ge=2, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SpendingAnalysisResponse:
    result = build_spending_analysis(db, current_user.id, months=months)
    return _map_spending_analysis_response(result)


@router.get("/spending-analysis", response_model=SpendingAnalysisResponse)
async def insights_spending_analysis(
    months: int = Query(default=4, ge=2, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SpendingAnalysisResponse:
    result = build_spending_analysis(db, current_user.id, months=months)
    return _map_spending_analysis_response(result)


@router.get("/reports", response_model=ReportSummaryResponse)
async def insights_reports(
    months: int = Query(default=4, ge=2, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportSummaryResponse:
    result = build_report_summary(db, current_user.id, months=months)
    return ReportSummaryResponse(
        period_label=result.period_label,
        net_saved=result.net_saved,
        total_income=result.total_income,
        total_expense=result.total_expense,
        transaction_count=result.transaction_count,
        savings_rate=result.savings_rate,
        savings_rate_delta=result.savings_rate_delta,
        monthly_overview=[
            InsightMonthlyCashflowPoint(
                month_key=item.month_key,
                month_label=item.month_label,
                total_income=item.total_income,
                total_expense=item.total_expense,
                net=item.net,
                is_current=item.is_current,
            )
            for item in result.monthly_overview
        ],
        category_table=[
            InsightCategoryAnalytics(
                category_id=item.category_id,
                name=item.name,
                color=item.color,
                icon=item.icon,
                total_amount=item.total_amount,
                percentage=item.percentage,
                delta_percentage=item.delta_percentage,
                trend_direction=item.trend_direction,
            )
            for item in result.category_table
        ],
        largest_transactions=[
            TransactionHistoryItemResponse(
                **item.transaction.__dict__,
                category=TransactionCategorySnapshot(
                    name=item.category_name,
                    color=item.category_color,
                    icon=item.category_icon,
                )
                if item.category_name or item.category_color or item.category_icon
                else None,
            )
            for item in result.largest_transactions
        ],
    )


def _map_spending_analysis_response(result) -> SpendingAnalysisResponse:
    return SpendingAnalysisResponse(
        period_label=result.period_label,
        total_spent=result.total_spent,
        category_breakdown=[
            InsightCategoryAnalytics(
                category_id=item.category_id,
                name=item.name,
                color=item.color,
                icon=item.icon,
                total_amount=item.total_amount,
                percentage=item.percentage,
                delta_percentage=item.delta_percentage,
                trend_direction=item.trend_direction,
            )
            for item in result.category_breakdown
        ],
        monthly_trend=[
            InsightMonthlySpendPoint(
                month_key=item.month_key,
                month_label=item.month_label,
                total_amount=item.total_amount,
                is_current=item.is_current,
            )
            for item in result.monthly_trend
        ],
        behavior=SpendingBehaviorSummary(
            label=result.behavior.label,
            score=result.behavior.score,
            planned_buys=result.behavior.planned_buys,
            impulse_buys=result.behavior.impulse_buys,
            overspent_days=result.behavior.overspent_days,
        ),
        insights=[
            InsightCard(
                severity=item.severity,
                title=item.title,
                description=item.description,
            )
            for item in result.insights
        ],
    )
