from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.savings_goal import SavingsGoal
from app.schemas.savings_goal import SavingsGoalCreate, SavingsGoalUpdate


def list_savings_goals(db: Session, user_id: UUID) -> list[SavingsGoal]:
    return list(
        db.scalars(
            select(SavingsGoal)
            .where(SavingsGoal.user_id == user_id)
            .order_by(SavingsGoal.created_at.desc())
        )
    )


def get_savings_goal_or_404(db: Session, goal_id: UUID) -> SavingsGoal:
    goal = db.scalar(select(SavingsGoal).where(SavingsGoal.id == goal_id))
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )
    return goal


def get_owned_savings_goal_or_404(db: Session, user_id: UUID, goal_id: UUID) -> SavingsGoal:
    goal = get_savings_goal_or_404(db, goal_id)
    if goal.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Savings goal not found.",
        )
    return goal


def create_savings_goal(db: Session, user_id: UUID, payload: SavingsGoalCreate) -> SavingsGoal:
    goal = SavingsGoal(user_id=user_id, **payload.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def update_savings_goal(
    db: Session,
    user_id: UUID,
    goal_id: UUID,
    payload: SavingsGoalUpdate,
) -> SavingsGoal:
    goal = get_owned_savings_goal_or_404(db, user_id, goal_id)
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(goal, field_name, value)
    db.commit()
    db.refresh(goal)
    return goal


def delete_savings_goal(db: Session, user_id: UUID, goal_id: UUID) -> None:
    goal = get_owned_savings_goal_or_404(db, user_id, goal_id)
    db.delete(goal)
    db.commit()
