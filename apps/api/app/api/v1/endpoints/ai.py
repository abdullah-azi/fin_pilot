import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_ai_service, get_current_user, get_db
from app.models.user import User
from app.schemas.ai import (
    PurchaseCheckContextResponse,
    PurchaseCheckRequest,
    PurchaseCheckResponse,
    SavingsAdviceAllocationResponse,
    SavingsAdviceContextResponse,
    SavingsAdviceRequest,
    SavingsAdviceResponse,
)
from app.services.ai.service import AIService, PurchaseCheckInput, SavingsAdviceInput

router = APIRouter()


@router.post("/purchase-check", response_model=PurchaseCheckResponse)
async def ai_purchase_check(
    payload: PurchaseCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
) -> PurchaseCheckResponse:
    try:
        result = await ai_service.purchase_check(
            db,
            user_id=current_user.id,
            payload=PurchaseCheckInput(
                planned_amount=payload.planned_amount,
                item_name=payload.item_name,
                question=payload.question,
                category_id=payload.category_id,
            ),
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider request failed.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned an invalid response.",
        ) from exc

    return PurchaseCheckResponse(
        verdict=result.verdict,
        affordability_score=result.affordability_score,
        guidance=result.guidance,
        provider=result.provider,
        model_name=result.model_name,
        context=PurchaseCheckContextResponse(
            month_label=result.context.month_label,
            planned_amount=result.context.planned_amount,
            item_name=result.context.item_name,
            category_name=result.context.category_name,
            current_category_spend=result.context.current_category_spend,
            category_budget_limit=result.context.category_budget_limit,
            current_month_income=result.context.current_month_income,
            current_month_expense=result.context.current_month_expense,
            current_month_net=result.context.current_month_net,
            top_spending_category=result.context.top_spending_category,
            active_goal_count=result.context.active_goal_count,
            total_goal_monthly_required=result.context.total_goal_monthly_required,
            comfortable_monthly_savings=result.context.comfortable_monthly_savings,
            affordability_ratio=result.context.affordability_ratio,
            verdict=result.context.verdict,
            suggested_action=result.context.suggested_action,
        ),
    )


@router.post("/savings-advice", response_model=SavingsAdviceResponse)
async def ai_savings_advice(
    payload: SavingsAdviceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
) -> SavingsAdviceResponse:
    try:
        result = await ai_service.savings_advice(
            db,
            user_id=current_user.id,
            payload=SavingsAdviceInput(
                question=payload.question,
                goal_id=payload.goal_id,
            ),
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider request failed.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned an invalid response.",
        ) from exc

    return SavingsAdviceResponse(
        guidance=result.guidance,
        provider=result.provider,
        model_name=result.model_name,
        context=SavingsAdviceContextResponse(
            month_label=result.context.month_label,
            current_month_income=result.context.current_month_income,
            current_month_expense=result.context.current_month_expense,
            current_month_net=result.context.current_month_net,
            active_goal_count=result.context.active_goal_count,
            comfortable_monthly_savings=result.context.comfortable_monthly_savings,
            total_goal_monthly_required=result.context.total_goal_monthly_required,
            overall_goal_progress=result.context.overall_goal_progress,
            can_fund_all_goals_on_time=result.context.can_fund_all_goals_on_time,
            recommendation_text=result.context.recommendation_text,
            focus_goal_name=result.context.focus_goal_name,
            focus_goal_progress_percentage=result.context.focus_goal_progress_percentage,
            focus_goal_monthly_required=result.context.focus_goal_monthly_required,
            focus_goal_pace_status=result.context.focus_goal_pace_status,
            allocations=[
                SavingsAdviceAllocationResponse(
                    goal_id=allocation.goal_id,
                    name=allocation.name,
                    recommended_monthly_contribution=allocation.recommended_monthly_contribution,
                    required_monthly_contribution=allocation.required_monthly_contribution,
                    pace_status=allocation.pace_status,
                )
                for allocation in result.context.allocations
            ],
        ),
    )
