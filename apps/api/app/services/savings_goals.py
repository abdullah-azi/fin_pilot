from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_CEILING
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.enums import GoalPriority, SavingsGoalStatus, TransactionType
from app.models.savings_goal import SavingsGoal
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.savings_goal import SavingsGoalCreate, SavingsGoalUpdate
from app.schemas.savings_goal_intelligence import SavingsGoalProjectionRequest

MONEY_QUANTUM = Decimal("0.01")
PERCENT_QUANTUM = Decimal("0.1")
ZERO_MONEY = Decimal("0.00")
ZERO_PERCENT = Decimal("0.0")
RECENT_BASELINE_MONTHS = 3
PRIORITY_WEIGHTS = {
    GoalPriority.HIGH: Decimal("1.30"),
    GoalPriority.MEDIUM: Decimal("1.00"),
    GoalPriority.LOW: Decimal("0.80"),
}


@dataclass(slots=True)
class GoalHealth:
    goal_id: UUID
    name: str
    current_amount: Decimal
    target_amount: Decimal
    target_date: date | None
    progress_percentage: Decimal
    monthly_required: Decimal
    pace_status: str
    pace_label: str
    shortfall_amount: Decimal


@dataclass(slots=True)
class GoalSummary:
    period_label: str
    active_goal_count: int
    total_saved: Decimal
    total_target: Decimal
    overall_progress: Decimal
    comfortable_monthly_savings: Decimal
    total_monthly_required: Decimal
    goals: list[GoalHealth]


@dataclass(slots=True)
class GoalProjection:
    monthly_required: Decimal
    income_share_percentage: Decimal | None
    feasible_status: str
    feasible_label: str
    comfortable_monthly_savings: Decimal
    projected_completion_date: date | None
    will_hit_target_on_time: bool


@dataclass(slots=True)
class GoalAllocation:
    goal_id: UUID
    name: str
    recommended_monthly_contribution: Decimal
    required_monthly_contribution: Decimal
    pace_status: str


@dataclass(slots=True)
class GoalRecommendation:
    period_label: str
    comfortable_monthly_savings: Decimal
    total_monthly_required: Decimal
    can_fund_all_goals_on_time: bool
    recommendation_text: str
    allocations: list[GoalAllocation]


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


def build_goal_summary(db: Session, user_id: UUID, *, today: date | None = None) -> GoalSummary:
    today = today or date.today()
    active_goals = _list_active_goals(db, user_id)
    comfortable_monthly_savings = _estimate_comfortable_monthly_savings(db, user_id=user_id, today=today)
    goal_health = [
        _build_goal_health(goal, today=today, comfortable_monthly_savings=comfortable_monthly_savings)
        for goal in active_goals
    ]

    total_saved = sum((goal.current_amount for goal in active_goals), ZERO_MONEY).quantize(MONEY_QUANTUM)
    total_target = sum((goal.target_amount for goal in active_goals), ZERO_MONEY).quantize(MONEY_QUANTUM)
    total_monthly_required = sum((goal.monthly_required for goal in goal_health), ZERO_MONEY).quantize(MONEY_QUANTUM)

    return GoalSummary(
        period_label=today.strftime("%B %Y"),
        active_goal_count=len(active_goals),
        total_saved=total_saved,
        total_target=total_target,
        overall_progress=_safe_percentage(total_saved, total_target),
        comfortable_monthly_savings=comfortable_monthly_savings,
        total_monthly_required=total_monthly_required,
        goals=goal_health,
    )


def project_goal_plan(
    db: Session,
    user_id: UUID,
    payload: SavingsGoalProjectionRequest,
    *,
    today: date | None = None,
) -> GoalProjection:
    today = today or date.today()
    comfortable_monthly_savings = _estimate_comfortable_monthly_savings(db, user_id=user_id, today=today)
    income_baseline = _estimate_monthly_income_baseline(db, user_id=user_id, today=today)

    monthly_required = _calculate_monthly_required(
        current_amount=payload.current_amount,
        target_amount=payload.target_amount,
        target_date=payload.target_date,
        today=today,
    )
    contribution_basis = payload.monthly_contribution or comfortable_monthly_savings
    projected_completion_date = _estimate_completion_date(
        current_amount=payload.current_amount,
        target_amount=payload.target_amount,
        monthly_contribution=contribution_basis,
        today=today,
    )

    feasible_status, feasible_label = _classify_goal_feasibility(
        monthly_required=monthly_required,
        comfortable_monthly_savings=comfortable_monthly_savings,
    )

    return GoalProjection(
        monthly_required=monthly_required,
        income_share_percentage=(
            _safe_percentage(monthly_required, income_baseline) if income_baseline > ZERO_MONEY else None
        ),
        feasible_status=feasible_status,
        feasible_label=feasible_label,
        comfortable_monthly_savings=comfortable_monthly_savings,
        projected_completion_date=projected_completion_date,
        will_hit_target_on_time=(
            projected_completion_date is not None and projected_completion_date <= payload.target_date
        ),
    )


def build_goal_recommendation(db: Session, user_id: UUID, *, today: date | None = None) -> GoalRecommendation:
    today = today or date.today()
    summary = build_goal_summary(db, user_id, today=today)

    if not summary.goals:
        return GoalRecommendation(
            period_label=summary.period_label,
            comfortable_monthly_savings=summary.comfortable_monthly_savings,
            total_monthly_required=ZERO_MONEY,
            can_fund_all_goals_on_time=True,
            recommendation_text="Add your first active savings goal to get a monthly allocation plan.",
            allocations=[],
        )

    if summary.comfortable_monthly_savings >= summary.total_monthly_required:
        allocations = [
            GoalAllocation(
                goal_id=goal.goal_id,
                name=goal.name,
                recommended_monthly_contribution=goal.monthly_required,
                required_monthly_contribution=goal.monthly_required,
                pace_status=goal.pace_status,
            )
            for goal in summary.goals
        ]
        recommendation_text = (
            f"Based on your income and spending, you can save {summary.comfortable_monthly_savings}/month "
            f"comfortably. Allocating it across your goals should keep them on time."
        )
        return GoalRecommendation(
            period_label=summary.period_label,
            comfortable_monthly_savings=summary.comfortable_monthly_savings,
            total_monthly_required=summary.total_monthly_required,
            can_fund_all_goals_on_time=True,
            recommendation_text=recommendation_text,
            allocations=allocations,
        )

    weighted_goals = []
    for goal in summary.goals:
        priority = db.scalar(select(SavingsGoal.priority).where(SavingsGoal.id == goal.goal_id))
        weighted_goals.append((goal, PRIORITY_WEIGHTS[priority], goal.monthly_required * PRIORITY_WEIGHTS[priority]))

    total_weighted_need = sum((item[2] for item in weighted_goals), ZERO_MONEY)
    allocations: list[GoalAllocation] = []
    remaining = summary.comfortable_monthly_savings

    for index, (goal, _, weighted_need) in enumerate(weighted_goals):
        if index == len(weighted_goals) - 1:
            recommended = max(ZERO_MONEY, remaining).quantize(MONEY_QUANTUM)
        elif total_weighted_need > ZERO_MONEY:
            recommended = (
                (summary.comfortable_monthly_savings * (weighted_need / total_weighted_need))
            ).quantize(MONEY_QUANTUM)
            remaining = (remaining - recommended).quantize(MONEY_QUANTUM)
        else:
            recommended = ZERO_MONEY

        recommended_status = goal.pace_status if recommended >= goal.monthly_required else "behind"
        allocations.append(
            GoalAllocation(
                goal_id=goal.goal_id,
                name=goal.name,
                recommended_monthly_contribution=recommended,
                required_monthly_contribution=goal.monthly_required,
                pace_status=recommended_status,
            )
        )

    recommendation_text = (
        f"You can save about {summary.comfortable_monthly_savings}/month comfortably, but your active goals "
        f"need {summary.total_monthly_required}/month. Prioritize urgent goals or extend at least one deadline."
    )
    return GoalRecommendation(
        period_label=summary.period_label,
        comfortable_monthly_savings=summary.comfortable_monthly_savings,
        total_monthly_required=summary.total_monthly_required,
        can_fund_all_goals_on_time=False,
        recommendation_text=recommendation_text,
        allocations=allocations,
    )


def _list_active_goals(db: Session, user_id: UUID) -> list[SavingsGoal]:
    return list(
        db.scalars(
            select(SavingsGoal)
            .where(
                SavingsGoal.user_id == user_id,
                SavingsGoal.status == SavingsGoalStatus.ACTIVE,
            )
            .order_by(SavingsGoal.target_date.is_(None), SavingsGoal.target_date.asc(), SavingsGoal.created_at.asc())
        )
    )


def _build_goal_health(
    goal: SavingsGoal,
    *,
    today: date,
    comfortable_monthly_savings: Decimal,
) -> GoalHealth:
    progress_percentage = _safe_percentage(goal.current_amount, goal.target_amount)
    monthly_required = _calculate_monthly_required(
        current_amount=goal.current_amount,
        target_amount=goal.target_amount,
        target_date=goal.target_date,
        today=today,
    )
    pace_status, pace_label = _classify_goal_feasibility(
        monthly_required=monthly_required,
        comfortable_monthly_savings=comfortable_monthly_savings,
    )
    shortfall_amount = max(ZERO_MONEY, (monthly_required - comfortable_monthly_savings)).quantize(MONEY_QUANTUM)

    return GoalHealth(
        goal_id=goal.id,
        name=goal.name,
        current_amount=goal.current_amount.quantize(MONEY_QUANTUM),
        target_amount=goal.target_amount.quantize(MONEY_QUANTUM),
        target_date=goal.target_date,
        progress_percentage=progress_percentage,
        monthly_required=monthly_required,
        pace_status=pace_status,
        pace_label=pace_label,
        shortfall_amount=shortfall_amount,
    )


def _estimate_comfortable_monthly_savings(db: Session, *, user_id: UUID, today: date) -> Decimal:
    income_baseline = _estimate_monthly_income_baseline(db, user_id=user_id, today=today)
    expense_baseline = _estimate_monthly_expense_baseline(db, user_id=user_id, today=today)
    return max(ZERO_MONEY, (income_baseline - expense_baseline)).quantize(MONEY_QUANTUM)


def _estimate_monthly_income_baseline(db: Session, *, user_id: UUID, today: date) -> Decimal:
    user = db.scalar(select(User).where(User.id == user_id))
    if user and user.preferences and user.preferences.monthly_income_expected and user.preferences.monthly_income_expected > 0:
        return Decimal(user.preferences.monthly_income_expected).quantize(MONEY_QUANTUM)

    start_date = _month_start(today, offset=-(RECENT_BASELINE_MONTHS - 1))
    total_income = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    case((Transaction.type == TransactionType.INCOME, Transaction.amount), else_=0)
                ),
                0,
            )
        ).where(
            Transaction.user_id == user_id,
            Transaction.transaction_date >= start_date,
            Transaction.transaction_date <= today,
        )
    )
    return (Decimal(total_income) / Decimal(RECENT_BASELINE_MONTHS)).quantize(MONEY_QUANTUM)


def _estimate_monthly_expense_baseline(db: Session, *, user_id: UUID, today: date) -> Decimal:
    start_date = _month_start(today, offset=-(RECENT_BASELINE_MONTHS - 1))
    total_expense = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    case((Transaction.type == TransactionType.EXPENSE, Transaction.amount), else_=0)
                ),
                0,
            )
        ).where(
            Transaction.user_id == user_id,
            Transaction.transaction_date >= start_date,
            Transaction.transaction_date <= today,
        )
    )
    return (Decimal(total_expense) / Decimal(RECENT_BASELINE_MONTHS)).quantize(MONEY_QUANTUM)


def _calculate_monthly_required(
    *,
    current_amount: Decimal,
    target_amount: Decimal,
    target_date: date | None,
    today: date,
) -> Decimal:
    remaining_amount = max(ZERO_MONEY, (Decimal(target_amount) - Decimal(current_amount))).quantize(MONEY_QUANTUM)
    if remaining_amount <= 0:
        return ZERO_MONEY
    if target_date is None:
        return ZERO_MONEY

    months_remaining = _months_until(today, target_date)
    if months_remaining <= 0:
        months_remaining = 1

    return (remaining_amount / Decimal(months_remaining)).quantize(MONEY_QUANTUM)


def _estimate_completion_date(
    *,
    current_amount: Decimal,
    target_amount: Decimal,
    monthly_contribution: Decimal,
    today: date,
) -> date | None:
    if monthly_contribution <= 0:
        return None

    remaining_amount = max(ZERO_MONEY, (Decimal(target_amount) - Decimal(current_amount))).quantize(MONEY_QUANTUM)
    if remaining_amount <= 0:
        return today

    months_needed = int((remaining_amount / Decimal(monthly_contribution)).to_integral_value(rounding=ROUND_CEILING))
    return _month_start(today, offset=max(0, months_needed - 1))


def _classify_goal_feasibility(*, monthly_required: Decimal, comfortable_monthly_savings: Decimal) -> tuple[str, str]:
    if monthly_required <= ZERO_MONEY:
        return ("on_track", "On track")

    if comfortable_monthly_savings <= ZERO_MONEY:
        return ("at_risk", "At risk")

    if monthly_required <= comfortable_monthly_savings * Decimal("0.45"):
        return ("on_track", "On track")
    if monthly_required <= comfortable_monthly_savings * Decimal("0.90"):
        return ("behind", "Behind")
    return ("at_risk", "At risk")


def _safe_percentage(value: Decimal, total: Decimal) -> Decimal:
    if total <= 0:
        return ZERO_PERCENT
    return ((Decimal(value) / Decimal(total)) * Decimal("100")).quantize(PERCENT_QUANTUM)


def _months_until(start: date, end: date) -> int:
    if end <= start:
        return 1
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day > start.day:
        months += 1
    return max(1, months)


def _month_start(reference_date: date, *, offset: int = 0) -> date:
    zero_indexed_month = reference_date.month - 1 + offset
    year = reference_date.year + zero_indexed_month // 12
    month = zero_indexed_month % 12 + 1
    return date(year, month, 1)
