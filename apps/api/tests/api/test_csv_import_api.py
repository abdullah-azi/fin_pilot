import base64
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

pytestmark = pytest.mark.usefixtures("reset_database")


def test_csv_import_preview_and_confirm_flow(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "importer@example.com")
    headers = _auth_headers(auth["access_token"])

    csv_content = "\n".join(
        [
            "Date,Description,Debit,Credit,Balance",
            "2026-05-14,Imtiaz Superstore,5400,,144600",
            "2026-05-15,Salary,,140000,284600",
            "2026-05-16,Broken Row,abc,,284600",
        ]
    )

    preview_response = client.post(
        "/api/v1/imports/csv/preview",
        files={"file": ("nayapay-report.csv", csv_content, "text/csv")},
        headers=headers,
    )
    assert preview_response.status_code == 200
    preview_body = preview_response.json()

    assert preview_body["source_name"] == "nayapay-report.csv"
    assert preview_body["parsed_count"] == 2
    assert preview_body["skipped_count"] == 1
    assert preview_body["detected_columns"] == ["Date", "Description", "Debit", "Credit", "Balance"]
    assert preview_body["rows"][0]["title"] == "Imtiaz Superstore"
    assert preview_body["rows"][0]["type"] == "expense"
    assert preview_body["rows"][0]["category_name"] == "Groceries"
    assert preview_body["rows"][1]["title"] == "Salary"
    assert preview_body["rows"][1]["type"] == "income"
    assert preview_body["rows"][1]["category_name"] == "Salary"
    assert preview_body["skipped_rows"][0]["row_index"] == 4

    confirm_payload = {
        "original_parsed_count": preview_body["parsed_count"],
        "source_name": preview_body["source_name"],
        "rows": [
            {
                "row_index": row["row_index"],
                "transaction_date": row["transaction_date"],
                "title": row["title"],
                "amount": row["amount"],
                "type": row["type"],
                "note": row["note"],
                "category_id": row["category_id"],
                "fingerprint": row["fingerprint"],
            }
            for row in preview_body["rows"]
        ],
    }

    confirm_response = client.post(
        "/api/v1/imports/csv/confirm",
        json=confirm_payload,
        headers=headers,
    )
    assert confirm_response.status_code == 201
    confirm_body = confirm_response.json()
    assert confirm_body["imported_count"] == 2
    assert confirm_body["skipped_duplicate_count"] == 0
    assert len(confirm_body["imported_transaction_ids"]) == 2

    history_response = client.get("/api/v1/imports/history", headers=headers)
    assert history_response.status_code == 200
    history_body = history_response.json()
    assert len(history_body["items"]) == 1
    assert history_body["items"][0]["source_name"] == "nayapay-report.csv"
    assert history_body["items"][0]["original_parsed_count"] == 2
    assert history_body["items"][0]["requested_count"] == 2
    assert history_body["items"][0]["imported_count"] == 2
    assert history_body["items"][0]["ignored_count"] == 0
    assert history_body["items"][0]["skipped_duplicate_count"] == 0

    transactions_response = client.get("/api/v1/transactions/", headers=headers)
    assert transactions_response.status_code == 200
    transactions_body = transactions_response.json()
    assert len(transactions_body["items"]) == 2
    salary_transaction = next(item for item in transactions_body["items"] if item["title"] == "Salary")
    grocery_transaction = next(item for item in transactions_body["items"] if item["title"] == "Imtiaz Superstore")
    assert salary_transaction["income_frequency"] == "once"
    assert salary_transaction["type"] == "income"
    assert grocery_transaction["type"] == "expense"

    duplicate_response = client.post(
        "/api/v1/imports/csv/confirm",
        json=confirm_payload,
        headers=headers,
    )
    assert duplicate_response.status_code == 201
    duplicate_body = duplicate_response.json()
    assert duplicate_body["imported_count"] == 0
    assert duplicate_body["skipped_duplicate_count"] == 2
    assert duplicate_body["skipped_duplicates"] == [2, 3]


def test_csv_import_preview_rejects_non_csv_upload(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "invalidimport@example.com")
    headers = _auth_headers(auth["access_token"])

    response = client.post(
        "/api/v1/imports/csv/preview",
        files={"file": ("statement.pdf", "not a csv", "application/pdf")},
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Only .csv files are supported for statement import."


def test_csv_import_preview_supports_statement_preamble_and_short_timestamps(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "nayapayimport@example.com")
    headers = _auth_headers(auth["access_token"])

    csv_content = "\n".join(
        [
            "Customer Name,Test User,,,,",
            "Customer Address,Rawalpindi,,,,",
            ",,,,,",
            "TIMESTAMP,TYPE,DESCRIPTION,AMOUNT,BALANCE",
            '1/1/2026 2:34,Raast In,"Incoming fund transfer from Salary source",20000,20263.55',
            '1/1/2026 16:04,Peer to Peer,"Money sent to brother",-1000,19263.55',
        ]
    )

    preview_response = client.post(
        "/api/v1/imports/csv/preview",
        files={"file": ("nayapay-january.csv", csv_content, "text/csv")},
        headers=headers,
    )
    assert preview_response.status_code == 200
    preview_body = preview_response.json()

    assert preview_body["detected_columns"] == ["TIMESTAMP", "TYPE", "DESCRIPTION", "AMOUNT", "BALANCE"]
    assert preview_body["parsed_count"] == 2
    assert preview_body["rows"][0]["transaction_date"] == "2026-01-01"
    assert preview_body["rows"][0]["type"] == "income"
    assert preview_body["rows"][1]["type"] == "expense"


def test_csv_import_preview_text_flow(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "inlineimport@example.com")
    headers = _auth_headers(auth["access_token"])

    csv_content = "\n".join(
        [
            "TIMESTAMP,TYPE,DESCRIPTION,AMOUNT,BALANCE",
            '1/1/2026 2:34,Raast In,"Incoming fund transfer from Salary source",20000,20263.55',
            '1/1/2026 16:04,Peer to Peer,"Money sent to brother",-1000,19263.55',
        ]
    )

    preview_response = client.post(
        "/api/v1/imports/csv/preview-text",
        json={
            "source_name": "nayapay-january.csv",
            "content": csv_content,
        },
        headers=headers,
    )
    assert preview_response.status_code == 200
    preview_body = preview_response.json()

    assert preview_body["source_name"] == "nayapay-january.csv"
    assert preview_body["parsed_count"] == 2
    assert preview_body["skipped_count"] == 0
    assert preview_body["rows"][0]["transaction_date"] == "2026-01-01"
    assert preview_body["rows"][1]["type"] == "expense"


def test_csv_import_preview_understands_nayapay_type_labels_without_signed_amounts(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "nayapaytypes@example.com")
    headers = _auth_headers(auth["access_token"])

    csv_content = "\n".join(
        [
            "TIMESTAMP,TYPE,DESCRIPTION,AMOUNT,BALANCE",
            '1/1/2026 2:34,Raast In,"Incoming fund transfer from Muhammad",20000,20263.55',
            '1/1/2026 16:04,Peer to Peer,"Money sent to brother",1000,19263.55',
            '1/1/2026 16:14,Cash Withdrawal,"Cash Withdrawn at ATM|Visa xxxx3388",18000,263.55',
            '1/3/2026 19:01,POS,"Paid to BLANCO RAWALPINDI PK|Visa xxxx3388",101,462.55',
            '1/13/2026 9:14,Mobile Top-Up,"Mobile top-up purchased |Zong 03165251122",3000,2007.55',
        ]
    )

    preview_response = client.post(
        "/api/v1/imports/csv/preview-text",
        json={
            "source_name": "nayapay-type-labels.csv",
            "content": csv_content,
        },
        headers=headers,
    )
    assert preview_response.status_code == 200
    preview_body = preview_response.json()

    assert preview_body["parsed_count"] == 5
    assert preview_body["skipped_count"] == 0
    assert [row["type"] for row in preview_body["rows"]] == [
        "income",
        "expense",
        "expense",
        "expense",
        "expense",
    ]


def test_csv_import_preview_supports_textual_month_with_ampm_timestamp(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "textualmonth@example.com")
    headers = _auth_headers(auth["access_token"])

    csv_content = "\n".join(
        [
            "TIMESTAMP,TYPE,DESCRIPTION,AMOUNT,BALANCE",
            '01 Jan 2026 2:34 AM,Raast In,"Incoming fund transfer from Muhammad",20000,20263.55',
            '01 Jan 2026 4:04 PM,Peer to Peer,"Money sent to brother",-1000,19263.55',
        ]
    )

    preview_response = client.post(
        "/api/v1/imports/csv/preview-text",
        json={
            "source_name": "nayapay-textual-month.csv",
            "content": csv_content,
        },
        headers=headers,
    )
    assert preview_response.status_code == 200
    preview_body = preview_response.json()

    assert preview_body["parsed_count"] == 2
    assert preview_body["skipped_count"] == 0
    assert preview_body["rows"][0]["transaction_date"] == "2026-01-01"
    assert preview_body["rows"][1]["transaction_date"] == "2026-01-01"


def test_xlsx_import_preview_base64_flow(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "xlsximport@example.com")
    headers = _auth_headers(auth["access_token"])

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Statement"
    worksheet.append(["TIMESTAMP", "TYPE", "DESCRIPTION", "AMOUNT", "BALANCE"])
    worksheet.append(["01 Jan 2026 2:34 AM", "Raast In", "Incoming fund transfer from Muhammad", 20000, 20263.55])
    worksheet.append(["01 Jan 2026 4:04 PM", "Peer to Peer", "Money sent to brother", -1000, 19263.55])

    buffer = io.BytesIO()
    workbook.save(buffer)
    payload = {
        "source_name": "nayapay-january.xlsx",
        "content_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
    }

    preview_response = client.post(
        "/api/v1/imports/xlsx/preview-base64",
        json=payload,
        headers=headers,
    )
    assert preview_response.status_code == 200
    preview_body = preview_response.json()

    assert preview_body["source_name"] == "nayapay-january.xlsx"
    assert preview_body["parsed_count"] == 2
    assert preview_body["skipped_count"] == 0
    assert preview_body["rows"][0]["type"] == "income"
    assert preview_body["rows"][1]["type"] == "expense"


def test_import_preview_maps_real_statement_titles_to_new_categories(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "categorymapping@example.com")
    headers = _auth_headers(auth["access_token"])

    csv_content = "\n".join(
        [
            "TIMESTAMP,TYPE,DESCRIPTION,AMOUNT,BALANCE",
            '01 Jan 2026 2:34 AM,Raast In,"Incoming fund transfer from Muhammad",20000,20263.55',
            '01 Jan 2026 4:04 PM,Peer to Peer,"Money sent to brother",-1000,19263.55',
            '01 Jan 2026 4:14 PM,Cash Withdrawal,"Cash Withdrawn at ATM|Visa xxxx3388",-18000,263.55',
            '03 Jan 2026 7:01 PM,POS,"Paid to SHELL RAWALPINDI PK|Visa xxxx3388",-350,462.55',
            '03 Jan 2026 7:05 PM,POS,"Paid to D WATSON ISLAMABAD PK|Visa xxxx3388",-110,352.55',
            '03 Jan 2026 7:10 PM,Mobile Top-Up,"Mobile top-up purchased |Ufone 03317775401",-650,292.55',
            '03 Jan 2026 7:15 PM,POS,"Paid Traffic Challan|Ticket Number 492623119422003670",-2015,0.00',
            '03 Jan 2026 7:20 PM,POS,"Paid to DeepSeek Hangzhou CN|Visa xxxx3388, USD 2.12",-706.49,0.00',
            '03 Jan 2026 7:25 PM,POS,"Paid to CHEEZIOUS RAWALPINDI PK|Visa xxxx3388",-955,0.00',
        ]
    )

    preview_response = client.post(
        "/api/v1/imports/csv/preview-text",
        json={
            "source_name": "real-history-mapping.csv",
            "content": csv_content,
        },
        headers=headers,
    )
    assert preview_response.status_code == 200
    preview_body = preview_response.json()
    rows_by_title = {row["title"]: row for row in preview_body["rows"]}

    assert rows_by_title["Incoming fund transfer from Muhammad"]["category_name"] == "Transfers In"
    assert rows_by_title["Money sent to brother"]["category_name"] == "Peer / Family Support"
    assert rows_by_title["Cash Withdrawn at ATM|Visa xxxx3388"]["category_name"] == "Cash Withdrawal"
    assert rows_by_title["Paid to SHELL RAWALPINDI PK|Visa xxxx3388"]["category_name"] == "Fuel"
    assert rows_by_title["Paid to D WATSON ISLAMABAD PK|Visa xxxx3388"]["category_name"] == "Pharmacy / Medicine"
    assert rows_by_title["Mobile top-up purchased |Ufone 03317775401"]["category_name"] == "Mobile Top-Up"
    assert rows_by_title["Paid Traffic Challan|Ticket Number 492623119422003670"]["category_name"] == "Fines / Government"
    assert rows_by_title["Paid to DeepSeek Hangzhou CN|Visa xxxx3388, USD 2.12"]["category_name"] == "Digital Services"
    assert rows_by_title["Paid to CHEEZIOUS RAWALPINDI PK|Visa xxxx3388"]["category_name"] == "Dining / Fast Food"


def test_confirm_import_uses_balance_to_avoid_false_duplicates(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "balancededupe@example.com")
    headers = _auth_headers(auth["access_token"])

    csv_content = "\n".join(
        [
            "TIMESTAMP,TYPE,DESCRIPTION,AMOUNT,BALANCE",
            '01 Jan 2026 2:34 AM,Peer to Peer,"Money sent to MIR YOUSUF AZEEM",-1000,19263.55',
            '01 Jan 2026 5:34 PM,Peer to Peer,"Money sent to MIR YOUSUF AZEEM",-1000,18263.55',
        ]
    )

    preview_response = client.post(
        "/api/v1/imports/csv/preview-text",
        json={
            "source_name": "same-day-same-amount.csv",
            "content": csv_content,
        },
        headers=headers,
    )
    assert preview_response.status_code == 200
    preview_body = preview_response.json()
    assert preview_body["parsed_count"] == 2

    confirm_payload = {
        "original_parsed_count": preview_body["parsed_count"],
        "source_name": preview_body["source_name"],
        "rows": [
            {
                "row_index": row["row_index"],
                "transaction_date": row["transaction_date"],
                "title": row["title"],
                "amount": row["amount"],
                "balance": row["balance"],
                "type": row["type"],
                "note": row["note"],
                "category_id": row["category_id"],
                "fingerprint": row["fingerprint"],
            }
            for row in preview_body["rows"]
        ],
    }

    confirm_response = client.post(
        "/api/v1/imports/csv/confirm",
        json=confirm_payload,
        headers=headers,
    )
    assert confirm_response.status_code == 201
    confirm_body = confirm_response.json()
    assert confirm_body["imported_count"] == 2
    assert confirm_body["skipped_duplicate_count"] == 0


def _signup_and_get_auth(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "supersecure123",
            "full_name": "CSV Import User",
            "currency": "PKR",
        },
    )
    assert response.status_code == 201
    return response.json()


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
