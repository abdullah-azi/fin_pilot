import csv
import hashlib
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.import_batch import ImportBatch
from app.models.enums import CategoryType, TransactionFrequency, TransactionType
from app.models.transaction import Transaction
from app.schemas.imports import (
    ImportBatchHistoryItem,
    ImportBatchHistoryResponse,
    CSVImportConfirmRequest,
    CSVImportPreviewResponse,
    CSVImportPreviewRow,
    CSVImportSkippedRow,
)
from app.services.categories import list_categories
from app.services.transactions import MONEY_QUANTUM, _ensure_category_access

DATE_HEADERS = (
    "date",
    "transaction_date",
    "posted_date",
    "posting_date",
    "created_at",
    "timestamp",
    "time",
)
TITLE_HEADERS = (
    "description",
    "details",
    "merchant",
    "title",
    "transaction",
    "narration",
    "remarks",
    "reference",
    "name",
)
AMOUNT_HEADERS = ("amount", "transaction_amount", "value", "amount_pkr")
DEBIT_HEADERS = ("debit", "withdrawal", "money_out", "debit_amount", "outflow")
CREDIT_HEADERS = ("credit", "deposit", "money_in", "credit_amount", "inflow")
TYPE_HEADERS = ("type", "transaction_type", "direction", "dr_cr", "drcr")
NOTE_HEADERS = ("note", "notes", "memo", "reference", "remarks")
BALANCE_HEADERS = ("balance", "closing_balance", "available_balance")


@dataclass(slots=True)
class ParsedImportRow:
    row_index: int
    transaction_date: date
    title: str
    amount: Decimal
    transaction_type: TransactionType
    note: str | None
    category_id: UUID | None
    category_name: str | None
    fingerprint: str
    raw_preview: dict[str, str]


@dataclass(slots=True)
class SkippedImportRow:
    row_index: int
    reason: str
    raw_preview: dict[str, str]


@dataclass(slots=True)
class PreviewCSVResult:
    source_name: str | None
    detected_columns: list[str]
    rows: list[ParsedImportRow]
    skipped_rows: list[SkippedImportRow]


@dataclass(slots=True)
class ConfirmCSVResult:
    source_name: str | None
    imported_count: int
    skipped_duplicate_count: int
    skipped_duplicates: list[int]
    imported_transaction_ids: list[UUID]


def preview_csv_import(
    db: Session,
    *,
    user_id: UUID,
    file_name: str | None,
    file_bytes: bytes,
) -> PreviewCSVResult:
    decoded = _decode_csv_bytes(file_bytes)
    dialect = _sniff_dialect(decoded)
    reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)

    if not reader.fieldnames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file has no header row.",
        )

    normalized_header_map = {
        _normalize_header(field_name): field_name
        for field_name in reader.fieldnames
        if field_name is not None
    }
    detected_columns = [field_name.strip() for field_name in reader.fieldnames if field_name and field_name.strip()]

    if not _has_any_header(normalized_header_map, DATE_HEADERS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must include a date column.",
        )

    if not (
        _has_any_header(normalized_header_map, AMOUNT_HEADERS)
        or _has_any_header(normalized_header_map, DEBIT_HEADERS)
        or _has_any_header(normalized_header_map, CREDIT_HEADERS)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV must include an amount column or debit/credit columns.",
        )

    categories = list_categories(db, user_id, include_hidden=True)
    category_lookup = {category.effective_name.lower(): category for category in categories}

    parsed_rows: list[ParsedImportRow] = []
    skipped_rows: list[SkippedImportRow] = []

    for row_index, raw_row in enumerate(reader, start=2):
        compact_preview = {
            key.strip(): (value or "").strip()
            for key, value in raw_row.items()
            if key and ((value or "").strip())
        }

        if not compact_preview:
            continue

        try:
            parsed_rows.append(
                _parse_csv_row(
                    row_index=row_index,
                    raw_row=raw_row,
                    normalized_header_map=normalized_header_map,
                    category_lookup=category_lookup,
                )
            )
        except ValueError as exc:
            skipped_rows.append(
                SkippedImportRow(
                    row_index=row_index,
                    reason=str(exc),
                    raw_preview=compact_preview,
                )
            )

    return PreviewCSVResult(
        source_name=file_name,
        detected_columns=detected_columns,
        rows=parsed_rows,
        skipped_rows=skipped_rows,
    )


def build_preview_response(result: PreviewCSVResult) -> CSVImportPreviewResponse:
    return CSVImportPreviewResponse(
        source_name=result.source_name,
        detected_columns=result.detected_columns,
        parsed_count=len(result.rows),
        skipped_count=len(result.skipped_rows),
        rows=[
            CSVImportPreviewRow(
                row_index=row.row_index,
                transaction_date=row.transaction_date,
                title=row.title,
                amount=row.amount,
                type=row.transaction_type,
                note=row.note,
                category_id=row.category_id,
                category_name=row.category_name,
                fingerprint=row.fingerprint,
                raw_preview=row.raw_preview,
            )
            for row in result.rows
        ],
        skipped_rows=[
            CSVImportSkippedRow(
                row_index=row.row_index,
                reason=row.reason,
                raw_preview=row.raw_preview,
            )
            for row in result.skipped_rows
        ],
    )


def confirm_csv_import(
    db: Session,
    *,
    user_id: UUID,
    payload: CSVImportConfirmRequest,
) -> ConfirmCSVResult:
    if not payload.rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one parsed row is required for import.",
        )

    for row in payload.rows:
        if row.category_id is not None:
            _ensure_category_access(db, user_id, row.category_id)

    min_date = min(row.transaction_date for row in payload.rows)
    max_date = max(row.transaction_date for row in payload.rows)
    original_parsed_count = payload.original_parsed_count if payload.original_parsed_count is not None else len(payload.rows)
    ignored_count = max(0, original_parsed_count - len(payload.rows))

    existing_rows = db.execute(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.transaction_date >= min_date,
            Transaction.transaction_date <= max_date,
        )
    ).scalars().all()

    existing_keys = {
        _build_duplicate_key(
            transaction.transaction_date,
            transaction.type,
            transaction.amount,
            transaction.title,
        )
        for transaction in existing_rows
    }

    seen_payload_keys: set[tuple[date, str, str, str]] = set()
    imported_transaction_ids: list[UUID] = []
    skipped_duplicates: list[int] = []

    for row in payload.rows:
        duplicate_key = _build_duplicate_key(
            row.transaction_date,
            row.type,
            row.amount.quantize(MONEY_QUANTUM),
            row.title,
        )
        if duplicate_key in existing_keys or duplicate_key in seen_payload_keys:
            skipped_duplicates.append(row.row_index)
            continue

        transaction = Transaction(
            user_id=user_id,
            type=row.type,
            amount=row.amount.quantize(MONEY_QUANTUM),
            income_frequency=TransactionFrequency.ONCE if row.type == TransactionType.INCOME else None,
            hours_per_day=None,
            days_per_week=None,
            category_id=row.category_id,
            title=row.title.strip(),
            note=row.note,
            transaction_date=row.transaction_date,
        )
        db.add(transaction)
        db.flush()

        imported_transaction_ids.append(transaction.id)
        existing_keys.add(duplicate_key)
        seen_payload_keys.add(duplicate_key)

    import_batch = ImportBatch(
        user_id=user_id,
        source_name=payload.source_name,
        original_parsed_count=original_parsed_count,
        requested_count=len(payload.rows),
        imported_count=len(imported_transaction_ids),
        ignored_count=ignored_count,
        skipped_duplicate_count=len(skipped_duplicates),
        transaction_date_from=min_date,
        transaction_date_to=max_date,
    )
    db.add(import_batch)

    db.commit()

    return ConfirmCSVResult(
        source_name=payload.source_name,
        imported_count=len(imported_transaction_ids),
        skipped_duplicate_count=len(skipped_duplicates),
        skipped_duplicates=skipped_duplicates,
        imported_transaction_ids=imported_transaction_ids,
    )


def list_import_batches(
    db: Session,
    *,
    user_id: UUID,
    limit: int = 20,
) -> ImportBatchHistoryResponse:
    rows = db.execute(
        select(ImportBatch)
        .where(ImportBatch.user_id == user_id)
        .order_by(ImportBatch.created_at.desc())
        .limit(limit)
    ).scalars().all()

    return ImportBatchHistoryResponse(
        items=[
            ImportBatchHistoryItem(
                id=row.id,
                source_name=row.source_name,
                original_parsed_count=row.original_parsed_count,
                requested_count=row.requested_count,
                imported_count=row.imported_count,
                ignored_count=row.ignored_count,
                skipped_duplicate_count=row.skipped_duplicate_count,
                transaction_date_from=row.transaction_date_from,
                transaction_date_to=row.transaction_date_to,
                created_at=row.created_at.isoformat(),
                updated_at=row.updated_at.isoformat(),
            )
            for row in rows
        ]
    )


def _parse_csv_row(
    *,
    row_index: int,
    raw_row: dict[str, str | None],
    normalized_header_map: dict[str, str],
    category_lookup,
) -> ParsedImportRow:
    transaction_date = _extract_date(raw_row, normalized_header_map)
    title = _extract_title(raw_row, normalized_header_map)
    amount, transaction_type = _extract_amount_and_type(raw_row, normalized_header_map)
    note = _extract_note(raw_row, normalized_header_map)
    category_id, category_name = _infer_category(title=title, note=note, transaction_type=transaction_type, category_lookup=category_lookup)

    raw_preview = {
        key.strip(): (value or "").strip()
        for key, value in raw_row.items()
        if key and ((value or "").strip())
    }

    return ParsedImportRow(
        row_index=row_index,
        transaction_date=transaction_date,
        title=title,
        amount=amount,
        transaction_type=transaction_type,
        note=note,
        category_id=category_id,
        category_name=category_name,
        fingerprint=_row_fingerprint(transaction_date, transaction_type, amount, title),
        raw_preview=raw_preview,
    )


def _decode_csv_bytes(file_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="CSV file encoding is not supported.",
    )


def _sniff_dialect(content: str) -> csv.Dialect:
    sample = content[:2048]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        return csv.get_dialect("excel")


def _normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _has_any_header(normalized_header_map: dict[str, str], candidates: tuple[str, ...]) -> bool:
    return any(candidate in normalized_header_map for candidate in candidates)


def _find_value(
    raw_row: dict[str, str | None],
    normalized_header_map: dict[str, str],
    candidates: tuple[str, ...],
) -> str | None:
    for candidate in candidates:
        header = normalized_header_map.get(candidate)
        if header is None:
            continue

        value = raw_row.get(header)
        if value is not None and value.strip():
            return value.strip()

    return None


def _extract_date(raw_row: dict[str, str | None], normalized_header_map: dict[str, str]) -> date:
    value = _find_value(raw_row, normalized_header_map, DATE_HEADERS)
    if not value:
        raise ValueError("Missing transaction date.")

    parsed = _parse_date(value)
    if parsed is None:
        raise ValueError(f"Could not parse date: {value}")

    return parsed


def _extract_title(raw_row: dict[str, str | None], normalized_header_map: dict[str, str]) -> str:
    value = _find_value(raw_row, normalized_header_map, TITLE_HEADERS)
    if not value:
        raise ValueError("Missing transaction description/title.")

    return value[:120]


def _extract_amount_and_type(
    raw_row: dict[str, str | None],
    normalized_header_map: dict[str, str],
) -> tuple[Decimal, TransactionType]:
    explicit_type_value = _find_value(raw_row, normalized_header_map, TYPE_HEADERS)
    explicit_type = _parse_type_value(explicit_type_value) if explicit_type_value else None

    amount_value = _find_value(raw_row, normalized_header_map, AMOUNT_HEADERS)
    if amount_value:
        amount = _parse_decimal(amount_value)
        if amount is None:
            raise ValueError(f"Could not parse amount: {amount_value}")

        if explicit_type is not None:
            return abs(amount).quantize(MONEY_QUANTUM), explicit_type

        if amount < 0:
            return abs(amount).quantize(MONEY_QUANTUM), TransactionType.EXPENSE
        if amount > 0:
            return amount.quantize(MONEY_QUANTUM), TransactionType.INCOME

    debit_value = _find_value(raw_row, normalized_header_map, DEBIT_HEADERS)
    credit_value = _find_value(raw_row, normalized_header_map, CREDIT_HEADERS)

    debit_amount = _parse_decimal(debit_value) if debit_value else None
    credit_amount = _parse_decimal(credit_value) if credit_value else None

    if debit_amount and debit_amount > 0:
        return debit_amount.quantize(MONEY_QUANTUM), TransactionType.EXPENSE
    if credit_amount and credit_amount > 0:
        return credit_amount.quantize(MONEY_QUANTUM), TransactionType.INCOME

    raise ValueError("Could not determine whether this row is income or expense.")


def _extract_note(raw_row: dict[str, str | None], normalized_header_map: dict[str, str]) -> str | None:
    parts: list[str] = []
    note_value = _find_value(raw_row, normalized_header_map, NOTE_HEADERS)
    balance_value = _find_value(raw_row, normalized_header_map, BALANCE_HEADERS)

    if note_value:
        parts.append(note_value)
    if balance_value:
        parts.append(f"Balance: {balance_value}")

    return " | ".join(parts)[:255] if parts else None


def _infer_category(*, title: str, note: str | None, transaction_type: TransactionType, category_lookup):
    haystack = f"{title} {note or ''}".lower()
    keyword_map = {
        "Groceries": ("grocery", "mart", "superstore", "imtiaz", "carrefour", "metro"),
        "Food": ("food", "restaurant", "cafe", "coffee", "burger", "pizza", "meal"),
        "Transport": ("uber", "careem", "fuel", "petrol", "bus", "metrobus", "transport"),
        "Subscriptions": ("netflix", "spotify", "youtube", "adobe", "subscription"),
        "Utilities": ("electric", "gas", "water", "internet", "wifi", "utility"),
        "Health": ("hospital", "pharmacy", "clinic", "medical", "doctor"),
        "Shopping": ("store", "mall", "shopping", "daraz", "amazon"),
        "Education": ("school", "college", "university", "course", "tuition"),
        "Salary": ("salary", "payroll", "wage"),
        "Investment": ("profit", "dividend", "investment", "mutual"),
        "Freelance": ("freelance", "upwork", "fiverr", "client"),
    }

    candidate_names = list(keyword_map.keys())
    if transaction_type == TransactionType.EXPENSE:
        candidate_names = [name for name in candidate_names if name not in {"Salary", "Investment", "Freelance"}]
    else:
        candidate_names = [name for name in candidate_names if name in {"Salary", "Investment", "Freelance"}]

    for category_name in candidate_names:
        if any(keyword in haystack for keyword in keyword_map[category_name]):
            category = category_lookup.get(category_name.lower())
            if category and (
                category.type == CategoryType.BOTH
                or (transaction_type == TransactionType.EXPENSE and category.type == CategoryType.EXPENSE)
                or (transaction_type == TransactionType.INCOME and category.type == CategoryType.INCOME)
            ):
                return category.id, category.effective_name

    return None, None


def _parse_date(value: str) -> date | None:
    normalized = value.strip()

    iso_candidate = normalized[:10]
    try:
        return date.fromisoformat(iso_candidate)
    except ValueError:
        pass

    datetime_formats = (
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d %b %Y",
        "%d %B %Y",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
    )
    for fmt in datetime_formats:
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue

    return None


def _parse_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None

    cleaned = value.strip()
    if not cleaned:
        return None

    negative = False
    if cleaned.startswith("(") and cleaned.endswith(")"):
        negative = True
        cleaned = cleaned[1:-1]

    cleaned = cleaned.replace(",", "")
    cleaned = re.sub(r"(?i)(pkr|rs\.?|usd|eur|qar)", "", cleaned).strip()
    cleaned = re.sub(r"[^0-9.\-]", "", cleaned)
    if not cleaned:
        return None

    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        return None

    if negative:
        amount = -amount

    return amount


def _parse_type_value(value: str) -> TransactionType | None:
    normalized = _normalize_header(value)
    if normalized in {"expense", "debit", "dr", "withdrawal", "money_out"}:
        return TransactionType.EXPENSE
    if normalized in {"income", "credit", "cr", "deposit", "money_in"}:
        return TransactionType.INCOME
    return None


def _row_fingerprint(
    transaction_date: date,
    transaction_type: TransactionType,
    amount: Decimal,
    title: str,
) -> str:
    raw = f"{transaction_date.isoformat()}|{transaction_type.value}|{amount.quantize(MONEY_QUANTUM)}|{title.strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build_duplicate_key(
    transaction_date: date,
    transaction_type: TransactionType,
    amount: Decimal,
    title: str,
) -> tuple[date, str, str, str]:
    return (
        transaction_date,
        transaction_type.value,
        f"{amount.quantize(MONEY_QUANTUM)}",
        title.strip().lower(),
    )
