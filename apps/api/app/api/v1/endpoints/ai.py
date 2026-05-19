import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_ai_service, get_current_user, get_db
from app.models.user import User
from app.schemas.ai import (
    AIReportSummaryContextResponse,
    AIReportSummaryResponse,
    GeneralAdviceContextResponse,
    GeneralAdviceRequest,
    GeneralAdviceResponse,
    PurchaseCheckContextResponse,
    PurchaseCheckRequest,
    PurchaseCheckResponse,
    ReportSummaryRequest,
    SavingsAdviceAllocationResponse,
    SavingsAdviceContextResponse,
    SavingsAdviceRequest,
    SavingsAdviceResponse,
    ReportSummaryTransactionResponse,
    SpendingSummaryCategoryResponse,
    SpendingSummaryContextResponse,
    SpendingSummaryRequest,
    SpendingSummaryResponse,
)
from app.services.ai.service import (
    AIService,
    GeneralAdviceInput,
    PurchaseCheckInput,
    ReportSummaryInput,
    SavingsAdviceInput,
    SpendingSummaryInput,
)

router = APIRouter()


@router.post("/chat", response_model=GeneralAdviceResponse)
async def ai_general_chat(
    payload: GeneralAdviceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
) -> GeneralAdviceResponse:
    try:
        result = await ai_service.general_advice(
            db,
            user_id=current_user.id,
            payload=GeneralAdviceInput(question=payload.question),
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

    return GeneralAdviceResponse(
        guidance=result.guidance,
        provider=result.provider,
        model_name=result.model_name,
        context=GeneralAdviceContextResponse(
            currency_code=result.context.currency_code,
            currency_symbol=result.context.currency_symbol,
            month_label=result.context.month_label,
            current_month_income=result.context.current_month_income,
            current_month_expense=result.context.current_month_expense,
            current_month_net=result.context.current_month_net,
            active_goal_count=result.context.active_goal_count,
            comfortable_monthly_savings=result.context.comfortable_monthly_savings,
            behavior_label=result.context.behavior_label,
            behavior_score=result.context.behavior_score,
            top_spending_category=result.context.top_spending_category,
            savings_rate=result.context.savings_rate,
        ),
    )


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
            currency_code=result.context.currency_code,
            currency_symbol=result.context.currency_symbol,
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
            currency_code=result.context.currency_code,
            currency_symbol=result.context.currency_symbol,
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


@router.post("/spending-summary", response_model=SpendingSummaryResponse)
async def ai_spending_summary(
    payload: SpendingSummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
) -> SpendingSummaryResponse:
    try:
        result = await ai_service.spending_summary(
            db,
            user_id=current_user.id,
            payload=SpendingSummaryInput(
                question=payload.question,
                months=payload.months,
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

    return SpendingSummaryResponse(
        guidance=result.guidance,
        provider=result.provider,
        model_name=result.model_name,
        context=SpendingSummaryContextResponse(
            currency_code=result.context.currency_code,
            currency_symbol=result.context.currency_symbol,
            period_label=result.context.period_label,
            total_spent=result.context.total_spent,
            behavior_label=result.context.behavior_label,
            behavior_score=result.context.behavior_score,
            planned_buys=result.context.planned_buys,
            impulse_buys=result.context.impulse_buys,
            overspent_days=result.context.overspent_days,
            strongest_insight_title=result.context.strongest_insight_title,
            strongest_insight_description=result.context.strongest_insight_description,
            top_categories=[
                SpendingSummaryCategoryResponse(
                    name=category.name,
                    total_amount=category.total_amount,
                    percentage=category.percentage,
                    trend_direction=category.trend_direction,
                )
                for category in result.context.top_categories
            ],
        ),
    )


@router.post("/report-summary", response_model=AIReportSummaryResponse)
async def ai_report_summary(
    payload: ReportSummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ai_service: AIService = Depends(get_ai_service),
) -> AIReportSummaryResponse:
    try:
        result = await ai_service.report_summary(
            db,
            user_id=current_user.id,
            payload=ReportSummaryInput(
                question=payload.question,
                months=payload.months,
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

    return AIReportSummaryResponse(
        guidance=result.guidance,
        provider=result.provider,
        model_name=result.model_name,
        context=AIReportSummaryContextResponse(
            currency_code=result.context.currency_code,
            currency_symbol=result.context.currency_symbol,
            period_label=result.context.period_label,
            total_income=result.context.total_income,
            total_expense=result.context.total_expense,
            net_saved=result.context.net_saved,
            transaction_count=result.context.transaction_count,
            savings_rate=result.context.savings_rate,
            savings_rate_delta=result.context.savings_rate_delta,
            top_category_name=result.context.top_category_name,
            top_category_total_amount=result.context.top_category_total_amount,
            largest_transactions=[
                ReportSummaryTransactionResponse(
                    title=item.title,
                    amount=item.amount,
                    transaction_date=item.transaction_date.isoformat(),
                    category_name=item.category_name,
                )
                for item in result.context.largest_transactions
            ],
        ),
    )
