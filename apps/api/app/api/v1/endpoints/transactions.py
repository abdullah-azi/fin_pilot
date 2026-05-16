from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.enums import TransactionType
from app.models.user import User
from app.schemas.transaction import (
    TransactionCategorySnapshot,
    TransactionCreate,
    TransactionHistoryItemResponse,
    TransactionListResponse,
    TransactionListMeta,
    TransactionResponse,
    TransactionHistorySummary,
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
    transaction_type: TransactionType | None = Query(default=None, alias="type"),
    q: str | None = Query(default=None, min_length=1),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionListResponse:
    result = list_transactions(
        db,
        user_id=current_user.id,
        category_id=category_id,
        transaction_type=transaction_type,
        date_from=date_from,
        date_to=date_to,
        query=q,
        limit=limit,
        offset=offset,
    )

    return TransactionListResponse(
        items=[
            TransactionHistoryItemResponse(
                **item.transaction.__dict__,
                category=TransactionCategorySnapshot(
                    name=item.category_name,
                    color=item.category_color,
                    icon=item.category_icon,
                )
                if item.category_name or item.category_color or item.category_icon
                else None,
            )
            for item in result.items
        ],
        summary=TransactionHistorySummary(
            total_count=result.summary.total_count,
            total_income=result.summary.total_income,
            total_expense=result.summary.total_expense,
            net=result.summary.net,
        ),
        meta=TransactionListMeta(
            limit=result.limit,
            offset=result.offset,
            has_more=result.has_more,
        ),
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
