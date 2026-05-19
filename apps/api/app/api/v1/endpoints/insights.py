import csv
from io import StringIO

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.insights import (
    InsightCard,
    InsightCategoryAnalytics,
    InsightMonthlyCashflowPoint,
    InsightMonthlySpendPoint,
    ReportSummaryResponse,
    SpendingAnalysisResponse,
    SpendingBehaviorSummary,
)
from app.schemas.transaction import TransactionCategorySnapshot, TransactionHistoryItemResponse
from app.services.insights import build_report_summary, build_spending_analysis

router = APIRouter()


@router.get("/summary", response_model=SpendingAnalysisResponse)
async def insights_summary(
    months: int = Query(default=4, ge=2, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SpendingAnalysisResponse:
    result = build_spending_analysis(db, current_user.id, months=months)
    return _map_spending_analysis_response(result)


@router.get("/spending-analysis", response_model=SpendingAnalysisResponse)
async def insights_spending_analysis(
    months: int = Query(default=4, ge=2, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SpendingAnalysisResponse:
    result = build_spending_analysis(db, current_user.id, months=months)
    return _map_spending_analysis_response(result)


@router.get("/reports", response_model=ReportSummaryResponse)
async def insights_reports(
    months: int = Query(default=4, ge=2, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReportSummaryResponse:
    result = build_report_summary(db, current_user.id, months=months)
    return ReportSummaryResponse(
        period_label=result.period_label,
        net_saved=result.net_saved,
        total_income=result.total_income,
        total_expense=result.total_expense,
        transaction_count=result.transaction_count,
        savings_rate=result.savings_rate,
        savings_rate_delta=result.savings_rate_delta,
        monthly_overview=[
            InsightMonthlyCashflowPoint(
                month_key=item.month_key,
                month_label=item.month_label,
                total_income=item.total_income,
                total_expense=item.total_expense,
                net=item.net,
                is_current=item.is_current,
            )
            for item in result.monthly_overview
        ],
        category_table=[
            InsightCategoryAnalytics(
                category_id=item.category_id,
                name=item.name,
                color=item.color,
                icon=item.icon,
                total_amount=item.total_amount,
                percentage=item.percentage,
                delta_percentage=item.delta_percentage,
                trend_direction=item.trend_direction,
            )
            for item in result.category_table
        ],
        largest_transactions=[
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
            for item in result.largest_transactions
        ],
    )


@router.get("/export")
async def insights_export(
    export_format: str = Query(default="csv", alias="format", pattern="^(csv|pdf)$"),
    months: int = Query(default=4, ge=2, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    result = build_report_summary(db, current_user.id, months=months)

    if export_format == "csv":
        csv_content = _build_report_csv(result)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="finpilot-report-{result.period_label.replace(" ", "-").lower()}.csv"'
            },
        )

    pdf_content = _build_report_pdf_bytes(result)
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="finpilot-report-{result.period_label.replace(" ", "-").lower()}.pdf"'
        },
    )


def _map_spending_analysis_response(result) -> SpendingAnalysisResponse:
    return SpendingAnalysisResponse(
        period_label=result.period_label,
        total_spent=result.total_spent,
        category_breakdown=[
            InsightCategoryAnalytics(
                category_id=item.category_id,
                name=item.name,
                color=item.color,
                icon=item.icon,
                total_amount=item.total_amount,
                percentage=item.percentage,
                delta_percentage=item.delta_percentage,
                trend_direction=item.trend_direction,
            )
            for item in result.category_breakdown
        ],
        monthly_trend=[
            InsightMonthlySpendPoint(
                month_key=item.month_key,
                month_label=item.month_label,
                total_amount=item.total_amount,
                is_current=item.is_current,
            )
            for item in result.monthly_trend
        ],
        behavior=SpendingBehaviorSummary(
            label=result.behavior.label,
            score=result.behavior.score,
            planned_buys=result.behavior.planned_buys,
            impulse_buys=result.behavior.impulse_buys,
            overspent_days=result.behavior.overspent_days,
        ),
        insights=[
            InsightCard(
                severity=item.severity,
                title=item.title,
                description=item.description,
            )
            for item in result.insights
        ],
    )


def _build_report_csv(result) -> str:
    buffer = StringIO()
    writer = csv.writer(buffer)

    writer.writerow(["FinPilot Report"])
    writer.writerow(["Period", result.period_label])
    writer.writerow(["Net Saved", result.net_saved])
    writer.writerow(["Total Income", result.total_income])
    writer.writerow(["Total Expense", result.total_expense])
    writer.writerow(["Transaction Count", result.transaction_count])
    writer.writerow(["Savings Rate", result.savings_rate])
    writer.writerow(["Savings Rate Delta", result.savings_rate_delta or ""])
    writer.writerow([])

    writer.writerow(["Monthly Overview"])
    writer.writerow(["Month", "Income", "Expense", "Net", "Current"])
    for item in result.monthly_overview:
        writer.writerow(
            [item.month_label, item.total_income, item.total_expense, item.net, "yes" if item.is_current else "no"]
        )
    writer.writerow([])

    writer.writerow(["Category Table"])
    writer.writerow(["Category", "Amount", "Share %", "Delta %", "Trend"])
    for item in result.category_table:
        writer.writerow(
            [item.name, item.total_amount, item.percentage, item.delta_percentage or "", item.trend_direction]
        )
    writer.writerow([])

    writer.writerow(["Largest Transactions"])
    writer.writerow(["Date", "Title", "Category", "Amount", "Type", "Note"])
    for item in result.largest_transactions:
        writer.writerow(
            [
                item.transaction.transaction_date.isoformat(),
                item.transaction.title,
                item.category_name or "",
                item.transaction.amount,
                item.transaction.type,
                item.transaction.note or "",
            ]
        )

    return buffer.getvalue()


def _build_report_pdf_bytes(result) -> bytes:
    lines = [
        f"FinPilot Report - {result.period_label}",
        "",
        f"Net Saved: {result.net_saved}",
        f"Total Income: {result.total_income}",
        f"Total Expense: {result.total_expense}",
        f"Transaction Count: {result.transaction_count}",
        f"Savings Rate: {result.savings_rate}%",
        (
            f"Savings Rate Delta: {result.savings_rate_delta}%"
            if result.savings_rate_delta is not None
            else "Savings Rate Delta: N/A"
        ),
        "",
        "Top Categories:",
    ]

    for item in result.category_table[:5]:
        lines.append(
            f"- {item.name}: {item.total_amount} ({item.percentage}%), trend={item.trend_direction}"
        )

    lines.append("")
    lines.append("Largest Transactions:")
    for item in result.largest_transactions[:5]:
        lines.append(
            f"- {item.transaction.transaction_date.isoformat()} | {item.transaction.title} | "
            f"{item.category_name or 'Uncategorized'} | {item.transaction.amount}"
        )

    return _render_minimal_pdf(lines)


def _render_minimal_pdf(lines: list[str]) -> bytes:
    escaped_lines = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
    y_position = 760
    content_lines = ["BT", "/F1 12 Tf", "50 800 Td"]
    for index, line in enumerate(escaped_lines):
        if index == 0:
            content_lines.append(f"({line}) Tj")
        else:
            content_lines.append(f"0 -16 Td ({line}) Tj")
        y_position -= 16
        if y_position < 60:
            break
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
        f"4 0 obj << /Length {len(stream)} >> stream\n".encode("latin-1") + stream + b"\nendstream endobj",
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj)
        pdf.extend(b"\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    pdf.extend(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode(
            "latin-1"
        )
    )
    return bytes(pdf)
