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
from app.services.savings_goals import (
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
