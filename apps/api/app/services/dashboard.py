from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.enums import SavingsGoalStatus, TransactionType
from app.models.savings_goal import SavingsGoal
from app.models.transaction import Transaction
from app.models.user_category_setting import UserCategorySetting
from app.services.transactions import TransactionHistoryItem, list_transactions

MONEY_QUANTUM = Decimal("0.01")
PERCENT_QUANTUM = Decimal("0.1")


@dataclass(slots=True)
class DashboardCategoryAggregate:
    category_id: UUID | None
    color: str | None
    icon: str | None
    name: str
    percentage: Decimal
    total_amount: Decimal


@dataclass(slots=True)
class DashboardGoalAggregate:
    current_amount: Decimal
    goal_id: UUID
    name: str
    progress_percentage: Decimal
    target_amount: Decimal
    target_date: date | None


@dataclass(slots=True)
class DashboardMonthlyAggregate:
    net: Decimal
    total_expense: Decimal
    total_income: Decimal
    transaction_count: int


@dataclass(slots=True)
class DashboardSummary:
    active_goal: DashboardGoalAggregate | None
    insight: str
    month_label: str
    recent_transactions: list[TransactionHistoryItem]
    summary: DashboardMonthlyAggregate
    top_categories: list[DashboardCategoryAggregate]


def build_dashboard_summary(db: Session, user_id: UUID, *, today: date | None = None) -> DashboardSummary:
    today = today or date.today()
    period_start = today.replace(day=1)
    period_end = today

    summary = _build_monthly_summary(db, user_id=user_id, period_start=period_start, period_end=period_end)
    top_categories = _build_top_categories(db, user_id=user_id, period_start=period_start, period_end=period_end)
    recent_transactions = list_transactions(
        db,
        user_id=user_id,
        date_from=period_start,
        date_to=period_end,
        limit=5,
        offset=0,
    ).items
    active_goal = _build_primary_goal(db, user_id=user_id)

    return DashboardSummary(
        month_label=today.strftime("%B %Y"),
        summary=summary,
        top_categories=top_categories,
        recent_transactions=recent_transactions,
        active_goal=active_goal,
        insight=_build_dashboard_insight(summary=summary, top_categories=top_categories, active_goal=active_goal),
    )


def _build_monthly_summary(
    db: Session,
    *,
    user_id: UUID,
    period_start: date,
    period_end: date,
) -> DashboardMonthlyAggregate:
    transaction_count, total_income, total_expense = db.execute(
        select(
            func.count(Transaction.id),
            func.coalesce(
                func.sum(
                    case((Transaction.type == TransactionType.INCOME, Transaction.amount), else_=0)
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case((Transaction.type == TransactionType.EXPENSE, Transaction.amount), else_=0)
                ),
                0,
            ),
        ).where(
            Transaction.user_id == user_id,
            Transaction.transaction_date >= period_start,
            Transaction.transaction_date <= period_end,
        )
    ).one()

    income = Decimal(total_income).quantize(MONEY_QUANTUM)
    expense = Decimal(total_expense).quantize(MONEY_QUANTUM)

    return DashboardMonthlyAggregate(
        transaction_count=transaction_count,
        total_income=income,
        total_expense=expense,
        net=(income - expense).quantize(MONEY_QUANTUM),
    )


def _build_top_categories(
    db: Session,
    *,
    user_id: UUID,
    period_start: date,
    period_end: date,
) -> list[DashboardCategoryAggregate]:
    total_expense = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.transaction_date >= period_start,
            Transaction.transaction_date <= period_end,
        )
    )
    total_expense_decimal = Decimal(total_expense).quantize(MONEY_QUANTUM)

    if total_expense_decimal <= 0:
        return []

    rows = db.execute(
        select(
            Transaction.category_id,
            func.coalesce(UserCategorySetting.display_name, Category.name, "Uncategorized"),
            Category.color,
            Category.icon,
            func.sum(Transaction.amount),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(
            UserCategorySetting,
            and_(
                UserCategorySetting.category_id == Category.id,
                UserCategorySetting.user_id == user_id,
            ),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.transaction_date >= period_start,
            Transaction.transaction_date <= period_end,
        )
        .group_by(
            Transaction.category_id,
            UserCategorySetting.display_name,
            Category.name,
            Category.color,
            Category.icon,
        )
        .order_by(func.sum(Transaction.amount).desc())
        .limit(4)
    ).all()

    return [
        DashboardCategoryAggregate(
            category_id=category_id,
            name=name,
            color=color,
            icon=icon,
            total_amount=Decimal(total_amount).quantize(MONEY_QUANTUM),
            percentage=((Decimal(total_amount) / total_expense_decimal) * Decimal("100")).quantize(PERCENT_QUANTUM),
        )
        for category_id, name, color, icon, total_amount in rows
    ]


def _build_primary_goal(db: Session, *, user_id: UUID) -> DashboardGoalAggregate | None:
    goal = db.scalar(
        select(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsGoal.status == SavingsGoalStatus.ACTIVE,
        )
        .order_by(
            SavingsGoal.target_date.is_(None),
            SavingsGoal.target_date.asc(),
            SavingsGoal.created_at.asc(),
        )
    )

    if not goal:
        return None

    progress = Decimal("0.0")
    if goal.target_amount > 0:
        progress = ((goal.current_amount / goal.target_amount) * Decimal("100")).quantize(PERCENT_QUANTUM)

    return DashboardGoalAggregate(
        goal_id=goal.id,
        name=goal.name,
        current_amount=goal.current_amount.quantize(MONEY_QUANTUM),
        target_amount=goal.target_amount.quantize(MONEY_QUANTUM),
        progress_percentage=progress,
        target_date=goal.target_date,
    )


def _build_dashboard_insight(
    *,
    summary: DashboardMonthlyAggregate,
    top_categories: list[DashboardCategoryAggregate],
    active_goal: DashboardGoalAggregate | None,
) -> str:
    if summary.total_income <= 0 and summary.total_expense <= 0:
        return "Add your first income or expense entry to unlock a real dashboard summary."

    if summary.net < 0:
        category_name = top_categories[0].name if top_categories else "spending"
        return f"You have spent more than you earned this month. Review {category_name} first."

    if top_categories and top_categories[0].percentage >= Decimal("30.0"):
        top_category = top_categories[0]
        return (
            f"{top_category.name} is leading your spending this month at "
            f"{top_category.percentage}% of all outflow."
        )

    if active_goal and active_goal.progress_percentage >= Decimal("40.0"):
        return (
            f"Your {active_goal.name} goal is {active_goal.progress_percentage}% funded and still on a healthy pace."
        )

    if summary.total_income > 0:
        retention_rate = ((summary.net / summary.total_income) * Decimal("100")).quantize(PERCENT_QUANTUM)
        return f"You are retaining {retention_rate}% of this month's income after expenses."

    return "This month shows spending activity, but no income entries yet."
