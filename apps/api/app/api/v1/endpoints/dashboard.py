from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.dashboard import (
    DashboardCategorySummary,
    DashboardGoalSummary,
    DashboardMonthlySummary,
    DashboardSummaryResponse,
)
from app.schemas.transaction import TransactionCategorySnapshot, TransactionHistoryItemResponse
from app.services.dashboard import build_dashboard_summary

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryResponse)
async def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummaryResponse:
    result = build_dashboard_summary(db, current_user.id)

    return DashboardSummaryResponse(
        month_label=result.month_label,
        insight=result.insight,
        summary=DashboardMonthlySummary(
            transaction_count=result.summary.transaction_count,
            total_income=result.summary.total_income,
            total_expense=result.summary.total_expense,
            net=result.summary.net,
        ),
        top_categories=[
            DashboardCategorySummary(
                category_id=item.category_id,
                name=item.name,
                color=item.color,
                icon=item.icon,
                total_amount=item.total_amount,
                percentage=item.percentage,
            )
            for item in result.top_categories
        ],
        recent_transactions=[
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
            for item in result.recent_transactions
        ],
        active_goal=DashboardGoalSummary(
            goal_id=result.active_goal.goal_id,
            name=result.active_goal.name,
            current_amount=result.active_goal.current_amount,
            target_amount=result.active_goal.target_amount,
            progress_percentage=result.active_goal.progress_percentage,
            target_date=result.active_goal.target_date,
        )
        if result.active_goal
        else None,
    )
