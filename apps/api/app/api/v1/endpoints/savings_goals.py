from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.savings_goal import (
    SavingsGoalCreate,
    SavingsGoalListResponse,
    SavingsGoalResponse,
    SavingsGoalUpdate,
)
from app.schemas.savings_goal_intelligence import (
    SavingsGoalProjectionRequest,
    SavingsGoalProjectionResponse,
    SavingsGoalRecommendationResponse,
    SavingsGoalSummaryResponse,
)
from app.services.savings_goals import (
    build_goal_recommendation,
    build_goal_summary,
    project_goal_plan,
    create_savings_goal,
    delete_savings_goal,
    get_owned_savings_goal_or_404,
    list_savings_goals,
    update_savings_goal,
)

router = APIRouter()


@router.get("/", response_model=SavingsGoalListResponse)
async def savings_goals_index(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavingsGoalListResponse:
    return SavingsGoalListResponse(items=list_savings_goals(db, current_user.id))


@router.get("/summary", response_model=SavingsGoalSummaryResponse)
async def savings_goals_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavingsGoalSummaryResponse:
    result = build_goal_summary(db, current_user.id)
    return SavingsGoalSummaryResponse(
        period_label=result.period_label,
        active_goal_count=result.active_goal_count,
        total_saved=result.total_saved,
        total_target=result.total_target,
        overall_progress=result.overall_progress,
        comfortable_monthly_savings=result.comfortable_monthly_savings,
        total_monthly_required=result.total_monthly_required,
        goals=[
            {
                "goal_id": goal.goal_id,
                "name": goal.name,
                "current_amount": goal.current_amount,
                "target_amount": goal.target_amount,
                "target_date": goal.target_date,
                "progress_percentage": goal.progress_percentage,
                "monthly_required": goal.monthly_required,
                "pace_status": goal.pace_status,
                "pace_label": goal.pace_label,
                "shortfall_amount": goal.shortfall_amount,
            }
            for goal in result.goals
        ],
    )


@router.post("/projection", response_model=SavingsGoalProjectionResponse)
async def savings_goals_projection(
    payload: SavingsGoalProjectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavingsGoalProjectionResponse:
    result = project_goal_plan(db, current_user.id, payload)
    return SavingsGoalProjectionResponse(
        monthly_required=result.monthly_required,
        income_share_percentage=result.income_share_percentage,
        feasible_status=result.feasible_status,
        feasible_label=result.feasible_label,
        comfortable_monthly_savings=result.comfortable_monthly_savings,
        projected_completion_date=result.projected_completion_date,
        will_hit_target_on_time=result.will_hit_target_on_time,
    )


@router.get("/recommendation", response_model=SavingsGoalRecommendationResponse)
async def savings_goals_recommendation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavingsGoalRecommendationResponse:
    result = build_goal_recommendation(db, current_user.id)
    return SavingsGoalRecommendationResponse(
        period_label=result.period_label,
        comfortable_monthly_savings=result.comfortable_monthly_savings,
        total_monthly_required=result.total_monthly_required,
        can_fund_all_goals_on_time=result.can_fund_all_goals_on_time,
        recommendation_text=result.recommendation_text,
        allocations=[
            {
                "goal_id": allocation.goal_id,
                "name": allocation.name,
                "recommended_monthly_contribution": allocation.recommended_monthly_contribution,
                "required_monthly_contribution": allocation.required_monthly_contribution,
                "pace_status": allocation.pace_status,
            }
            for allocation in result.allocations
        ],
    )


@router.post("/", response_model=SavingsGoalResponse, status_code=status.HTTP_201_CREATED)
async def savings_goals_create(
    payload: SavingsGoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavingsGoalResponse:
    return create_savings_goal(db, current_user.id, payload)


@router.get("/{goal_id}", response_model=SavingsGoalResponse)
async def savings_goals_show(
    goal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavingsGoalResponse:
    return get_owned_savings_goal_or_404(db, current_user.id, goal_id)


@router.patch("/{goal_id}", response_model=SavingsGoalResponse)
async def savings_goals_update(
    goal_id: UUID,
    payload: SavingsGoalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavingsGoalResponse:
    return update_savings_goal(db, current_user.id, goal_id, payload)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def savings_goals_delete(
    goal_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    delete_savings_goal(db, current_user.id, goal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
