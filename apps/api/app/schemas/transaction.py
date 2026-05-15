from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import TransactionType
from app.schemas.common import CalendarDate, TimestampedResponse


class TransactionCreate(BaseModel):
    type: TransactionType
    amount: Decimal = Field(gt=0)
    category_id: UUID | None = None
    title: str = Field(min_length=1, max_length=120)
    note: str | None = None
    transaction_date: CalendarDate


class TransactionUpdate(BaseModel):
    type: TransactionType | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    category_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)
    note: str | None = None
    transaction_date: CalendarDate | None = None


class TransactionResponse(TimestampedResponse):
    user_id: UUID
    type: TransactionType
    amount: Decimal
    category_id: UUID | None
    title: str
    note: str | None
    transaction_date: CalendarDate


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
