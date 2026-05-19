import pytest
from fastapi.testclient import TestClient

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
