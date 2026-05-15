from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate, TransactionUpdate
from app.services.categories import get_accessible_category


def list_transactions(
    db: Session,
    *,
    user_id: UUID,
    category_id: UUID | None = None,
) -> list[Transaction]:
    statement: Select[tuple[Transaction]] = (
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
    )
    if category_id:
        statement = statement.where(Transaction.category_id == category_id)

    return list(db.scalars(statement))


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

    for field_name, value in updates.items():
        setattr(transaction, field_name, value)

    db.commit()
    db.refresh(transaction)
    return transaction


def delete_transaction(db: Session, user_id: UUID, transaction_id: UUID) -> None:
    transaction = get_owned_transaction_or_404(db, user_id, transaction_id)
    db.delete(transaction)
    db.commit()


def _ensure_category_access(db: Session, user_id: UUID, category_id: UUID) -> None:
    category = get_accessible_category(db, user_id, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category does not exist for this user.",
        )
