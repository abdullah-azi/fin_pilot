from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import TransactionType


class CSVImportPreviewRow(BaseModel):
    row_index: int
    transaction_date: date
    title: str
    amount: Decimal
    type: TransactionType
    note: str | None = None
    category_id: UUID | None = None
    category_name: str | None = None
    fingerprint: str
    raw_preview: dict[str, str]


class CSVImportSkippedRow(BaseModel):
    row_index: int
    reason: str
    raw_preview: dict[str, str]


class CSVImportPreviewResponse(BaseModel):
    source_name: str | None = None
    detected_columns: list[str]
    parsed_count: int
    skipped_count: int
    rows: list[CSVImportPreviewRow]
    skipped_rows: list[CSVImportSkippedRow]


class CSVImportPreviewTextRequest(BaseModel):
    source_name: str | None = Field(default=None, max_length=255)
    content: str = Field(min_length=1)


class XLSXImportPreviewBase64Request(BaseModel):
    source_name: str | None = Field(default=None, max_length=255)
    content_base64: str = Field(min_length=1)


class CSVImportConfirmRow(BaseModel):
    row_index: int
    transaction_date: date
    title: str = Field(min_length=1, max_length=120)
    amount: Decimal = Field(gt=0)
    type: TransactionType
    note: str | None = None
    category_id: UUID | None = None
    fingerprint: str


class CSVImportConfirmRequest(BaseModel):
    source_name: str | None = Field(default=None, max_length=255)
    original_parsed_count: int | None = Field(default=None, ge=0)
    rows: list[CSVImportConfirmRow] = Field(min_length=1)


class CSVImportConfirmResponse(BaseModel):
    source_name: str | None = None
    imported_count: int
    skipped_duplicate_count: int
    skipped_duplicates: list[int]
    imported_transaction_ids: list[UUID]


class ImportBatchHistoryItem(BaseModel):
    id: UUID
    source_name: str | None = None
    original_parsed_count: int
    requested_count: int
    imported_count: int
    ignored_count: int
    skipped_duplicate_count: int
    transaction_date_from: date | None = None
    transaction_date_to: date | None = None
    created_at: str
    updated_at: str


class ImportBatchHistoryResponse(BaseModel):
    items: list[ImportBatchHistoryItem]
