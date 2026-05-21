from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.imports import (
    CSVImportConfirmRequest,
    CSVImportConfirmResponse,
    CSVImportPreviewResponse,
    CSVImportPreviewTextRequest,
    ImportBatchHistoryResponse,
    XLSXImportPreviewBase64Request,
)
from app.services.csv_imports import (
    build_preview_response,
    confirm_csv_import,
    list_import_batches,
    preview_csv_import,
    preview_xlsx_import,
)

router = APIRouter()


@router.post("/csv/preview", response_model=CSVImportPreviewResponse)
async def imports_csv_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CSVImportPreviewResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv files are supported for statement import.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded CSV file is empty.",
        )

    result = preview_csv_import(
        db,
        user_id=current_user.id,
        file_name=file.filename,
        file_bytes=file_bytes,
    )
    return build_preview_response(result)


@router.post("/csv/preview-text", response_model=CSVImportPreviewResponse)
async def imports_csv_preview_text(
    payload: CSVImportPreviewTextRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CSVImportPreviewResponse:
    if payload.source_name and not payload.source_name.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv files are supported for statement import.",
        )

    result = preview_csv_import(
        db,
        user_id=current_user.id,
        file_name=payload.source_name,
        file_bytes=payload.content.encode("utf-8"),
    )
    return build_preview_response(result)


@router.post("/xlsx/preview-base64", response_model=CSVImportPreviewResponse)
async def imports_xlsx_preview_base64(
    payload: XLSXImportPreviewBase64Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CSVImportPreviewResponse:
    if payload.source_name and not payload.source_name.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .xlsx files are supported for Excel statement import.",
        )

    result = preview_xlsx_import(
        db,
        user_id=current_user.id,
        file_name=payload.source_name,
        content_base64=payload.content_base64,
    )
    return build_preview_response(result)


@router.post("/csv/confirm", response_model=CSVImportConfirmResponse, status_code=status.HTTP_201_CREATED)
async def imports_csv_confirm(
    payload: CSVImportConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CSVImportConfirmResponse:
    result = confirm_csv_import(
        db,
        user_id=current_user.id,
        payload=payload,
    )
    return CSVImportConfirmResponse(
        source_name=result.source_name,
        imported_count=result.imported_count,
        skipped_duplicate_count=result.skipped_duplicate_count,
        skipped_duplicates=result.skipped_duplicates,
        imported_transaction_ids=result.imported_transaction_ids,
    )


@router.get("/history", response_model=ImportBatchHistoryResponse)
async def imports_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportBatchHistoryResponse:
    return list_import_batches(db, user_id=current_user.id)
