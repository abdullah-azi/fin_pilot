from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user_category_setting import UserCategorySetting
from app.services.transactions import TransactionHistoryItem

MONEY_QUANTUM = Decimal("0.01")
PERCENT_QUANTUM = Decimal("0.1")
ZERO_MONEY = Decimal("0.00")
ZERO_PERCENT = Decimal("0.0")

PLANNED_CATEGORY_NAMES = {
    "Bills",
    "Education",
    "Groceries",
    "Health",
    "Subscriptions",
    "Transport",
    "Utilities",
}
IMPULSE_CATEGORY_NAMES = {
    "Clothing",
    "Entertainment",
    "Food",
    "Other",
    "Shopping",
}


@dataclass(slots=True)
class CategoryAnalytics:
    category_id: UUID | None
    name: str
    color: str | None
    icon: str | None
    total_amount: Decimal
    percentage: Decimal
    delta_percentage: Decimal | None
    trend_direction: str


@dataclass(slots=True)
class MonthlySpendPoint:
    month_key: str
    month_label: str
    total_amount: Decimal
    is_current: bool


@dataclass(slots=True)
class MonthlyCashflowPoint:
    month_key: str
    month_label: str
    total_income: Decimal
    total_expense: Decimal
    net: Decimal
    is_current: bool


@dataclass(slots=True)
class SpendingBehavior:
    label: str
    score: int
    planned_buys: int
    impulse_buys: int
    overspent_days: int


@dataclass(slots=True)
class InsightCardData:
    severity: str
    title: str
    description: str


@dataclass(slots=True)
class SpendingAnalysis:
    period_label: str
    total_spent: Decimal
    category_breakdown: list[CategoryAnalytics]
    monthly_trend: list[MonthlySpendPoint]
    behavior: SpendingBehavior
    insights: list[InsightCardData]


@dataclass(slots=True)
class ReportSummary:
    period_label: str
    net_saved: Decimal
    total_income: Decimal
    total_expense: Decimal
    transaction_count: int
    savings_rate: Decimal
    savings_rate_delta: Decimal | None
    monthly_overview: list[MonthlyCashflowPoint]
    category_table: list[CategoryAnalytics]
    largest_transactions: list[TransactionHistoryItem]


@dataclass(slots=True)
class AnalyticsRecord:
    transaction: Transaction
    canonical_category_name: str
    display_category_name: str
    category_color: str | None
    category_icon: str | None


def build_spending_analysis(
    db: Session,
    user_id: UUID,
    *,
    today: date | None = None,
    months: int = 4,
) -> SpendingAnalysis:
    today = today or date.today()
    current_month_start = today.replace(day=1)
    previous_month_start = _shift_month(current_month_start, -1)
    window_start = _shift_month(current_month_start, -(months - 1))

    records = _fetch_records(db, user_id=user_id, date_from=window_start, date_to=today)
    current_records = _filter_records(records, current_month_start, today)
    previous_records = _filter_records(records, previous_month_start, current_month_start - timedelta(days=1))

    current_expense_records = [record for record in current_records if record.transaction.type == TransactionType.EXPENSE]
    previous_expense_records = [record for record in previous_records if record.transaction.type == TransactionType.EXPENSE]

    category_breakdown = _build_category_breakdown(current_expense_records, previous_expense_records)
    monthly_trend = _build_monthly_spend_trend(records, current_month_start=current_month_start, months=months)
    behavior = _build_spending_behavior(current_expense_records)
    insights = _build_insight_cards(
        current_expense_records=current_expense_records,
        previous_expense_records=previous_expense_records,
        category_breakdown=category_breakdown,
        behavior=behavior,
    )

    return SpendingAnalysis(
        period_label=today.strftime("%B %Y"),
        total_spent=_sum_transaction_amounts(current_expense_records),
        category_breakdown=category_breakdown,
        monthly_trend=monthly_trend,
        behavior=behavior,
        insights=insights,
    )


def build_report_summary(
    db: Session,
    user_id: UUID,
    *,
    today: date | None = None,
    months: int = 4,
) -> ReportSummary:
    today = today or date.today()
    current_month_start = today.replace(day=1)
    previous_month_start = _shift_month(current_month_start, -1)
    previous_month_end = current_month_start - timedelta(days=1)
    window_start = _shift_month(current_month_start, -(months - 1))

    records = _fetch_records(db, user_id=user_id, date_from=window_start, date_to=today)
    current_records = _filter_records(records, current_month_start, today)
    previous_records = _filter_records(records, previous_month_start, previous_month_end)
    current_expense_records = [record for record in current_records if record.transaction.type == TransactionType.EXPENSE]
    previous_expense_records = [record for record in previous_records if record.transaction.type == TransactionType.EXPENSE]

    monthly_overview = _build_monthly_cashflow(records, current_month_start=current_month_start, months=months)
    total_income = _sum_transaction_amounts(
        [record for record in current_records if record.transaction.type == TransactionType.INCOME]
    )
    total_expense = _sum_transaction_amounts(current_expense_records)
    net_saved = (total_income - total_expense).quantize(MONEY_QUANTUM)
    savings_rate = _safe_percentage(net_saved, total_income)

    previous_income = _sum_transaction_amounts(
        [record for record in previous_records if record.transaction.type == TransactionType.INCOME]
    )
    previous_expense = _sum_transaction_amounts(previous_expense_records)
    previous_net = (previous_income - previous_expense).quantize(MONEY_QUANTUM)
    previous_savings_rate = _safe_percentage(previous_net, previous_income) if previous_income > 0 else None

    category_table = _build_category_breakdown(current_expense_records, previous_expense_records)
    largest_transactions = sorted(
        current_expense_records,
        key=lambda record: (record.transaction.amount, record.transaction.transaction_date, record.transaction.created_at),
        reverse=True,
    )[:3]

    return ReportSummary(
        period_label=today.strftime("%B %Y"),
        net_saved=net_saved,
        total_income=total_income,
        total_expense=total_expense,
        transaction_count=len(current_records),
        savings_rate=savings_rate,
        savings_rate_delta=(
            (savings_rate - previous_savings_rate).quantize(PERCENT_QUANTUM)
            if previous_savings_rate is not None
            else None
        ),
        monthly_overview=monthly_overview,
        category_table=category_table,
        largest_transactions=[
            TransactionHistoryItem(
                transaction=record.transaction,
                category_name=record.display_category_name,
                category_color=record.category_color,
                category_icon=record.category_icon,
            )
            for record in largest_transactions
        ],
    )


def _fetch_records(
    db: Session,
    *,
    user_id: UUID,
    date_from: date,
    date_to: date,
) -> list[AnalyticsRecord]:
    rows = db.execute(
        select(
            Transaction,
            func.coalesce(UserCategorySetting.display_name, Category.name),
            Category.name,
            Category.color,
            Category.icon,
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
            Transaction.transaction_date >= date_from,
            Transaction.transaction_date <= date_to,
        )
        .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
    ).all()

    return [
        AnalyticsRecord(
            transaction=transaction,
            canonical_category_name=canonical_name or "Uncategorized",
            display_category_name=display_name or canonical_name or "Uncategorized",
            category_color=category_color,
            category_icon=category_icon,
        )
        for transaction, display_name, canonical_name, category_color, category_icon in rows
    ]


def _filter_records(records: list[AnalyticsRecord], start: date, end: date) -> list[AnalyticsRecord]:
    return [
        record
        for record in records
        if start <= record.transaction.transaction_date <= end
    ]


def _build_category_breakdown(
    current_expense_records: list[AnalyticsRecord],
    previous_expense_records: list[AnalyticsRecord],
) -> list[CategoryAnalytics]:
    current_totals = _group_category_totals(current_expense_records)
    previous_totals = _group_category_totals(previous_expense_records)
    total_spent = _sum_transaction_amounts(current_expense_records)

    breakdown: list[CategoryAnalytics] = []
    for key, aggregate in sorted(
        current_totals.items(),
        key=lambda item: item[1]["total_amount"],
        reverse=True,
    ):
        previous_aggregate = previous_totals.get(key)
        previous_amount = (
            Decimal(previous_aggregate["total_amount"]).quantize(MONEY_QUANTUM)
            if previous_aggregate is not None
            else ZERO_MONEY
        )
        current_amount = aggregate["total_amount"]

        trend_direction = _trend_direction(current_amount=current_amount, previous_amount=previous_amount)
        delta_percentage = _delta_percentage(current_amount=current_amount, previous_amount=previous_amount)

        breakdown.append(
            CategoryAnalytics(
                category_id=aggregate["category_id"],
                name=aggregate["name"],
                color=aggregate["color"],
                icon=aggregate["icon"],
                total_amount=current_amount,
                percentage=_safe_percentage(current_amount, total_spent),
                delta_percentage=delta_percentage,
                trend_direction=trend_direction,
            )
        )

    return breakdown


def _build_monthly_spend_trend(
    records: list[AnalyticsRecord],
    *,
    current_month_start: date,
    months: int,
) -> list[MonthlySpendPoint]:
    expense_totals = defaultdict(lambda: ZERO_MONEY)
    for record in records:
        if record.transaction.type != TransactionType.EXPENSE:
            continue
        bucket = record.transaction.transaction_date.replace(day=1)
        expense_totals[bucket] += Decimal(record.transaction.amount)

    points: list[MonthlySpendPoint] = []
    for month_start in _month_starts(current_month_start, months):
        total_amount = expense_totals[month_start].quantize(MONEY_QUANTUM)
        points.append(
            MonthlySpendPoint(
                month_key=month_start.strftime("%Y-%m"),
                month_label=month_start.strftime("%b"),
                total_amount=total_amount,
                is_current=month_start == current_month_start,
            )
        )
    return points


def _build_monthly_cashflow(
    records: list[AnalyticsRecord],
    *,
    current_month_start: date,
    months: int,
) -> list[MonthlyCashflowPoint]:
    income_totals = defaultdict(lambda: ZERO_MONEY)
    expense_totals = defaultdict(lambda: ZERO_MONEY)

    for record in records:
        bucket = record.transaction.transaction_date.replace(day=1)
        amount = Decimal(record.transaction.amount)
        if record.transaction.type == TransactionType.INCOME:
            income_totals[bucket] += amount
        else:
            expense_totals[bucket] += amount

    points: list[MonthlyCashflowPoint] = []
    for month_start in _month_starts(current_month_start, months):
        total_income = income_totals[month_start].quantize(MONEY_QUANTUM)
        total_expense = expense_totals[month_start].quantize(MONEY_QUANTUM)
        points.append(
            MonthlyCashflowPoint(
                month_key=month_start.strftime("%Y-%m"),
                month_label=month_start.strftime("%b"),
                total_income=total_income,
                total_expense=total_expense,
                net=(total_income - total_expense).quantize(MONEY_QUANTUM),
                is_current=month_start == current_month_start,
            )
        )
    return points


def _build_spending_behavior(current_expense_records: list[AnalyticsRecord]) -> SpendingBehavior:
    planned_buys = sum(
        1 for record in current_expense_records if record.canonical_category_name in PLANNED_CATEGORY_NAMES
    )
    impulse_buys = sum(
        1 for record in current_expense_records if record.canonical_category_name in IMPULSE_CATEGORY_NAMES
    )

    overspent_days = _count_overspent_days(current_expense_records)
    total_expense = _sum_transaction_amounts(current_expense_records)
    discretionary_spend = _sum_transaction_amounts(
        [record for record in current_expense_records if record.canonical_category_name in IMPULSE_CATEGORY_NAMES]
    )
    discretionary_ratio = (
        (discretionary_spend / total_expense) if total_expense > 0 else Decimal("0")
    )

    raw_score = Decimal("82") - (discretionary_ratio * Decimal("45")) - (Decimal(overspent_days) * Decimal("6"))
    if impulse_buys > planned_buys and impulse_buys > 0:
        raw_score -= Decimal("8")

    score = max(0, min(100, int(raw_score.to_integral_value())))

    if score >= 70:
        label = "Disciplined spender"
    elif score >= 40:
        label = "Moderate spender"
    else:
        label = "Impulse-leaning spender"

    return SpendingBehavior(
        label=label,
        score=score,
        planned_buys=planned_buys,
        impulse_buys=impulse_buys,
        overspent_days=overspent_days,
    )


def _build_insight_cards(
    *,
    current_expense_records: list[AnalyticsRecord],
    previous_expense_records: list[AnalyticsRecord],
    category_breakdown: list[CategoryAnalytics],
    behavior: SpendingBehavior,
) -> list[InsightCardData]:
    cards: list[InsightCardData] = []

    if category_breakdown:
        top_category = category_breakdown[0]
        top_severity = "bad" if top_category.percentage >= Decimal("30.0") else "warn"
        delta_suffix = (
            f" and is {abs(top_category.delta_percentage)}% {'above' if top_category.trend_direction == 'up' else 'below'} last month"
            if top_category.delta_percentage is not None and top_category.trend_direction in {"up", "down"}
            else ""
        )
        cards.append(
            InsightCardData(
                severity=top_severity,
                title=f"{top_category.name} is your biggest spend bucket",
                description=(
                    f"{top_category.name} accounts for {top_category.percentage}% of this month's outflow"
                    f"{delta_suffix}."
                ),
            )
        )

    weekend_expense = _sum_transaction_amounts(
        [
            record
            for record in current_expense_records
            if record.transaction.transaction_date.weekday() >= 5
        ]
    )
    weekday_expense = _sum_transaction_amounts(
        [
            record
            for record in current_expense_records
            if record.transaction.transaction_date.weekday() < 5
        ]
    )
    if weekend_expense > 0 and weekday_expense > 0 and weekend_expense > weekday_expense:
        cards.append(
            InsightCardData(
                severity="warn",
                title="Weekend spending runs hotter",
                description="Your weekend spend is currently outpacing weekday spending. Review leisure and convenience purchases first.",
            )
        )

    if behavior.overspent_days > 0:
        cards.append(
            InsightCardData(
                severity="warn" if behavior.overspent_days < 3 else "bad",
                title="A few days are driving the month",
                description=(
                    f"You had {behavior.overspent_days} overspent day"
                    f"{'' if behavior.overspent_days == 1 else 's'} where spending was materially above your daily average."
                ),
            )
        )

    previous_transport = _sum_transaction_amounts(
        [record for record in previous_expense_records if record.canonical_category_name == "Transport"]
    )
    current_transport = _sum_transaction_amounts(
        [record for record in current_expense_records if record.canonical_category_name == "Transport"]
    )
    if previous_transport > ZERO_MONEY and current_transport < previous_transport:
        cards.append(
            InsightCardData(
                severity="good",
                title="Transport cost is improving",
                description="Transport spending is down from last month, which is helping offset pressure from other categories.",
            )
        )

    if not cards:
        cards.append(
            InsightCardData(
                severity="good",
                title="Your spending pattern is stable",
                description="Keep logging transactions to unlock sharper month-on-month insight cards.",
            )
        )

    return cards[:4]


def _group_category_totals(records: list[AnalyticsRecord]) -> dict[tuple[UUID | None, str], dict[str, object]]:
    grouped: dict[tuple[UUID | None, str], dict[str, object]] = {}
    for record in records:
        key = (record.transaction.category_id, record.display_category_name)
        if key not in grouped:
            grouped[key] = {
                "category_id": record.transaction.category_id,
                "name": record.display_category_name,
                "color": record.category_color,
                "icon": record.category_icon,
                "total_amount": ZERO_MONEY,
            }
        grouped[key]["total_amount"] = Decimal(grouped[key]["total_amount"]) + Decimal(record.transaction.amount)

    for aggregate in grouped.values():
        aggregate["total_amount"] = Decimal(aggregate["total_amount"]).quantize(MONEY_QUANTUM)

    return grouped


def _count_overspent_days(records: list[AnalyticsRecord]) -> int:
    if not records:
        return 0

    by_day = defaultdict(lambda: ZERO_MONEY)
    for record in records:
        by_day[record.transaction.transaction_date] += Decimal(record.transaction.amount)

    daily_totals = [total.quantize(MONEY_QUANTUM) for total in by_day.values()]
    average_daily_spend = (sum(daily_totals, ZERO_MONEY) / Decimal(len(daily_totals))).quantize(MONEY_QUANTUM)
    threshold = average_daily_spend * Decimal("1.50")

    return sum(1 for total in daily_totals if total > threshold)


def _sum_transaction_amounts(records: list[AnalyticsRecord]) -> Decimal:
    return sum((Decimal(record.transaction.amount) for record in records), ZERO_MONEY).quantize(MONEY_QUANTUM)


def _safe_percentage(amount: Decimal, total: Decimal) -> Decimal:
    if total <= 0:
        return ZERO_PERCENT
    return ((amount / total) * Decimal("100")).quantize(PERCENT_QUANTUM)


def _delta_percentage(current_amount: Decimal, previous_amount: Decimal) -> Decimal | None:
    if previous_amount <= 0:
        return None
    return (((current_amount - previous_amount) / previous_amount) * Decimal("100")).quantize(PERCENT_QUANTUM)


def _trend_direction(*, current_amount: Decimal, previous_amount: Decimal) -> str:
    if previous_amount <= 0 and current_amount > 0:
        return "up"
    if current_amount > previous_amount:
        return "up"
    if current_amount < previous_amount:
        return "down"
    return "flat"


def _month_starts(current_month_start: date, months: int) -> list[date]:
    return [_shift_month(current_month_start, offset) for offset in range(-(months - 1), 1)]


def _shift_month(month_start: date, offset: int) -> date:
    zero_indexed_month = month_start.month - 1 + offset
    year = month_start.year + zero_indexed_month // 12
    month = zero_indexed_month % 12 + 1
    return date(year, month, 1)
