from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import TransactionFrequency, TransactionType
from app.schemas.common import CalendarDate, TimestampedResponse


class TransactionCreate(BaseModel):
    type: TransactionType
    amount: Decimal = Field(gt=0)
    income_frequency: TransactionFrequency | None = None
    hours_per_day: Decimal | None = Field(default=None, gt=0, le=24)
    days_per_week: Decimal | None = Field(default=None, gt=0, le=7)
    category_id: UUID | None = None
    title: str = Field(min_length=1, max_length=120)
    note: str | None = None
    transaction_date: CalendarDate


class TransactionUpdate(BaseModel):
    type: TransactionType | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    income_frequency: TransactionFrequency | None = None
    hours_per_day: Decimal | None = Field(default=None, gt=0, le=24)
    days_per_week: Decimal | None = Field(default=None, gt=0, le=7)
    category_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)
    note: str | None = None
    transaction_date: CalendarDate | None = None


class TransactionResponse(TimestampedResponse):
    user_id: UUID
    type: TransactionType
    amount: Decimal
    income_frequency: TransactionFrequency | None
    hours_per_day: Decimal | None
    days_per_week: Decimal | None
    category_id: UUID | None
    title: str
    note: str | None
    transaction_date: CalendarDate


class TransactionCategorySnapshot(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None


class TransactionHistoryItemResponse(TransactionResponse):
    category: TransactionCategorySnapshot | None = None


class TransactionHistorySummary(BaseModel):
    total_count: int
    total_income: Decimal
    total_expense: Decimal
    net: Decimal


class TransactionListMeta(BaseModel):
    limit: int
    offset: int
    has_more: bool


class TransactionListResponse(BaseModel):
    items: list[TransactionHistoryItemResponse]
    summary: TransactionHistorySummary
    meta: TransactionListMeta


class TransactionBulkDeleteResponse(BaseModel):
    deleted_count: int
    status: str = "deleted"


class TransactionBackfillResponse(BaseModel):
    scanned_count: int
    updated_count: int
    status: str = "completed"
