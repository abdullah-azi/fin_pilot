from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, case, delete, func, or_, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.enums import TransactionFrequency, TransactionType
from app.models.transaction import Transaction
from app.models.user_category_setting import UserCategorySetting
from app.schemas.transaction import TransactionCreate, TransactionUpdate
from app.services.category_matching import build_category_lookup, infer_category_match
from app.services.categories import get_accessible_category, list_categories

MONEY_QUANTUM = Decimal("0.01")


@dataclass(slots=True)
class TransactionHistoryItem:
    transaction: Transaction
    category_color: str | None
    category_icon: str | None
    category_name: str | None


@dataclass(slots=True)
class TransactionHistorySummary:
    net: Decimal
    total_count: int
    total_expense: Decimal
    total_income: Decimal


@dataclass(slots=True)
class TransactionHistoryResult:
    has_more: bool
    items: list[TransactionHistoryItem]
    limit: int
    offset: int
    summary: TransactionHistorySummary


@dataclass(slots=True)
class TransactionBackfillResult:
    scanned_count: int
    updated_count: int


def list_transactions(
    db: Session,
    *,
    user_id: UUID,
    category_id: UUID | None = None,
    transaction_type: TransactionType | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> TransactionHistoryResult:
    conditions = _build_transaction_filters(
        user_id=user_id,
        category_id=category_id,
        transaction_type=transaction_type,
        date_from=date_from,
        date_to=date_to,
        query=query,
    )

    statement: Select[tuple[Transaction, str | None, str | None, str | None]] = (
        select(
            Transaction,
            func.coalesce(UserCategorySetting.display_name, Category.name),
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
        .where(*conditions)
        .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    rows = db.execute(statement).all()
    items = [
        TransactionHistoryItem(
            transaction=transaction,
            category_name=category_name,
            category_color=category_color,
            category_icon=category_icon,
        )
        for transaction, category_name, category_color, category_icon in rows
    ]

    total_count, total_income, total_expense = db.execute(
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
        )
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .outerjoin(
            UserCategorySetting,
            and_(
                UserCategorySetting.category_id == Category.id,
                UserCategorySetting.user_id == user_id,
            ),
        )
        .where(*conditions)
    ).one()

    total_income = Decimal(total_income).quantize(MONEY_QUANTUM)
    total_expense = Decimal(total_expense).quantize(MONEY_QUANTUM)

    return TransactionHistoryResult(
        items=items,
        summary=TransactionHistorySummary(
            total_count=total_count,
            total_income=total_income,
            total_expense=total_expense,
            net=(total_income - total_expense).quantize(MONEY_QUANTUM),
        ),
        limit=limit,
        offset=offset,
        has_more=offset + len(items) < total_count,
    )


def get_transaction_or_404(db: Session, transaction_id: UUID) -> Transaction:
    transaction = db.scalar(select(Transaction).where(Transaction.id == transaction_id))
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )
    return transaction


def get_owned_transaction_or_404(
    db: Session,
    user_id: UUID,
    transaction_id: UUID,
) -> Transaction:
    transaction = get_transaction_or_404(db, transaction_id)
    if transaction.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )
    return transaction


def create_transaction(db: Session, user_id: UUID, payload: TransactionCreate) -> Transaction:
    _validate_transaction_metadata(
        transaction_type=payload.type,
        income_frequency=payload.income_frequency,
        hours_per_day=payload.hours_per_day,
        days_per_week=payload.days_per_week,
    )

    if payload.category_id:
        _ensure_category_access(db, user_id, payload.category_id)

    transaction = Transaction(user_id=user_id, **payload.model_dump())
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def update_transaction(
    db: Session,
    user_id: UUID,
    transaction_id: UUID,
    payload: TransactionUpdate,
) -> Transaction:
    transaction = get_owned_transaction_or_404(db, user_id, transaction_id)
    updates = payload.model_dump(exclude_unset=True)

    if "category_id" in updates and updates["category_id"] is not None:
        _ensure_category_access(db, transaction.user_id, updates["category_id"])

    _validate_transaction_metadata(
        transaction_type=updates.get("type", transaction.type),
        income_frequency=updates.get("income_frequency", transaction.income_frequency),
        hours_per_day=updates.get("hours_per_day", transaction.hours_per_day),
        days_per_week=updates.get("days_per_week", transaction.days_per_week),
    )

    for field_name, value in updates.items():
        setattr(transaction, field_name, value)

    db.commit()
    db.refresh(transaction)
    return transaction


def delete_transaction(db: Session, user_id: UUID, transaction_id: UUID) -> None:
    transaction = get_owned_transaction_or_404(db, user_id, transaction_id)
    db.delete(transaction)
    db.commit()


def delete_all_transactions(db: Session, user_id: UUID) -> int:
    result = db.execute(delete(Transaction).where(Transaction.user_id == user_id))
    db.commit()
    return int(result.rowcount or 0)


def backfill_uncategorized_transactions(db: Session, user_id: UUID) -> TransactionBackfillResult:
    categories = list_categories(db, user_id, include_hidden=False)
    category_lookup = build_category_lookup(categories)

    transactions = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == user_id, Transaction.category_id.is_(None))
        .order_by(Transaction.transaction_date.asc(), Transaction.created_at.asc())
    ).all()

    updated_count = 0
    for transaction in transactions:
        category_id, _ = infer_category_match(
            title=transaction.title,
            note=transaction.note,
            transaction_type=transaction.type,
            category_lookup=category_lookup,
        )
        if category_id is None:
            continue

        transaction.category_id = category_id
        updated_count += 1

    if updated_count:
        db.commit()

    return TransactionBackfillResult(scanned_count=len(transactions), updated_count=updated_count)


def _build_transaction_filters(
    *,
    user_id: UUID,
    category_id: UUID | None,
    transaction_type: TransactionType | None,
    date_from: date | None,
    date_to: date | None,
    query: str | None,
):
    conditions = [Transaction.user_id == user_id]

    if category_id:
        conditions.append(Transaction.category_id == category_id)

    if transaction_type:
        conditions.append(Transaction.type == transaction_type)

    if date_from:
        conditions.append(Transaction.transaction_date >= date_from)

    if date_to:
        conditions.append(Transaction.transaction_date <= date_to)

    normalized_query = query.strip() if query else None
    if normalized_query:
        like_pattern = f"%{normalized_query}%"
        conditions.append(
            or_(
                Transaction.title.ilike(like_pattern),
                Transaction.note.ilike(like_pattern),
                UserCategorySetting.display_name.ilike(like_pattern),
                Category.name.ilike(like_pattern),
            )
        )

    return conditions


def _ensure_category_access(db: Session, user_id: UUID, category_id: UUID) -> None:
    category = get_accessible_category(db, user_id, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category does not exist for this user.",
        )


def _validate_transaction_metadata(
    *,
    transaction_type: TransactionType,
    income_frequency: TransactionFrequency | None,
    hours_per_day,
    days_per_week,
) -> None:
    if transaction_type == TransactionType.EXPENSE:
        if income_frequency is not None or hours_per_day is not None or days_per_week is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Expense transactions cannot include income frequency fields.",
            )
        return

    if income_frequency is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Income transactions must include income_frequency.",
        )

    if income_frequency == TransactionFrequency.HOURLY:
        if hours_per_day is None or days_per_week is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hourly income requires hours_per_day and days_per_week.",
            )
        return

    if hours_per_day is not None or days_per_week is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="hours_per_day and days_per_week are only valid for hourly income.",
        )
