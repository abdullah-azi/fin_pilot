from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.transaction import (
    TransactionCreate,
    TransactionListResponse,
    TransactionResponse,
    TransactionUpdate,
)
from app.services.transactions import (
    create_transaction,
    delete_transaction,
    get_owned_transaction_or_404,
    list_transactions,
    update_transaction,
)

router = APIRouter()


@router.get("/", response_model=TransactionListResponse)
async def transactions_index(
    category_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionListResponse:
    return TransactionListResponse(
        items=list_transactions(db, user_id=current_user.id, category_id=category_id)
    )


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def transactions_create(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionResponse:
    return create_transaction(db, current_user.id, payload)


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def transactions_show(
    transaction_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionResponse:
    return get_owned_transaction_or_404(db, current_user.id, transaction_id)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def transactions_update(
    transaction_id: UUID,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionResponse:
    return update_transaction(db, current_user.id, transaction_id, payload)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def transactions_delete(
    transaction_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    delete_transaction(db, current_user.id, transaction_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
