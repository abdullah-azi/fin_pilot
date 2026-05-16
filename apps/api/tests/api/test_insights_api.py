from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("reset_database")


def test_spending_analysis_returns_category_trend_and_behavior_metrics(client: TestClient) -> None:
    headers = _auth_headers(_signup_and_get_auth(client, "insights@example.com")["access_token"])
    _seed_analytics_transactions(client, headers)

    response = client.get("/api/v1/insights/spending-analysis?months=4", headers=headers)
    assert response.status_code == 200

    body = response.json()
    today = date.today()

    assert body["period_label"] == today.strftime("%B %Y")
    assert body["total_spent"] == "600.00"

    top_category = body["category_breakdown"][0]
    assert top_category["name"] == "Groceries"
    assert top_category["total_amount"] == "350.00"
    assert top_category["percentage"] == "58.3"
    assert top_category["delta_percentage"] == "250.0"
    assert top_category["trend_direction"] == "up"

    assert len(body["monthly_trend"]) == 4
    assert body["monthly_trend"][-1]["month_key"] == today.replace(day=1).strftime("%Y-%m")
    assert body["monthly_trend"][-1]["total_amount"] == "600.00"
    assert body["monthly_trend"][-1]["is_current"] is True

    assert body["behavior"] == {
        "label": "Moderate spender",
        "score": 67,
        "planned_buys": 4,
        "impulse_buys": 1,
        "overspent_days": 1,
    }

    assert body["insights"][0]["severity"] == "bad"
    assert "Groceries" in body["insights"][0]["title"]


def test_reports_endpoint_returns_cashflow_category_table_and_largest_transactions(client: TestClient) -> None:
    headers = _auth_headers(_signup_and_get_auth(client, "reports@example.com")["access_token"])
    _seed_analytics_transactions(client, headers)

    response = client.get("/api/v1/insights/reports?months=4", headers=headers)
    assert response.status_code == 200

    body = response.json()
    today = date.today()

    assert body["period_label"] == today.strftime("%B %Y")
    assert body["net_saved"] == "2400.00"
    assert body["total_income"] == "3000.00"
    assert body["total_expense"] == "600.00"
    assert body["transaction_count"] == 6
    assert body["savings_rate"] == "80.0"
    assert body["savings_rate_delta"] == "-11.8"

    assert len(body["monthly_overview"]) == 4
    assert body["monthly_overview"][-1] == {
        "month_key": today.replace(day=1).strftime("%Y-%m"),
        "month_label": today.replace(day=1).strftime("%b"),
        "total_income": "3000.00",
        "total_expense": "600.00",
        "net": "2400.00",
        "is_current": True,
    }

    assert body["category_table"][0]["name"] == "Groceries"
    assert body["category_table"][1]["name"] == "Shopping"

    largest_titles = [item["title"] for item in body["largest_transactions"]]
    assert largest_titles == ["Carrefour", "Metro", "New shirt"]


def _seed_analytics_transactions(client: TestClient, headers: dict[str, str]) -> None:
    categories = client.get("/api/v1/categories/", headers=headers).json()

    def category_id(name: str) -> str:
        return next(category["id"] for category in categories if category["name"] == name)

    today = date.today()
    month_start = today.replace(day=1)
    previous_month_start = (month_start - timedelta(days=1)).replace(day=1)
    second_current_day = today if today.day == 1 else today - timedelta(days=1)
    third_current_day = month_start if month_start < second_current_day else today

    payloads = [
        {
            "type": "income",
            "amount": "3000.00",
            "income_frequency": "monthly",
            "category_id": category_id("Salary"),
            "title": "Main salary",
            "note": "Current month salary",
            "transaction_date": month_start.isoformat(),
        },
        {
            "type": "expense",
            "amount": "200.00",
            "category_id": category_id("Groceries"),
            "title": "Carrefour",
            "note": "Weekly groceries",
            "transaction_date": today.isoformat(),
        },
        {
            "type": "expense",
            "amount": "150.00",
            "category_id": category_id("Groceries"),
            "title": "Metro",
            "note": "Top-up run",
            "transaction_date": second_current_day.isoformat(),
        },
        {
            "type": "expense",
            "amount": "50.00",
            "category_id": category_id("Transport"),
            "title": "Uber",
            "note": "Commute",
            "transaction_date": third_current_day.isoformat(),
        },
        {
            "type": "expense",
            "amount": "80.00",
            "category_id": category_id("Subscriptions"),
            "title": "Spotify",
            "note": "Monthly plan",
            "transaction_date": today.isoformat(),
        },
        {
            "type": "expense",
            "amount": "120.00",
            "category_id": category_id("Shopping"),
            "title": "New shirt",
            "note": "Impulse buy",
            "transaction_date": today.isoformat(),
        },
        {
            "type": "income",
            "amount": "2800.00",
            "income_frequency": "monthly",
            "category_id": category_id("Salary"),
            "title": "Previous salary",
            "note": "Previous month salary",
            "transaction_date": previous_month_start.isoformat(),
        },
        {
            "type": "expense",
            "amount": "100.00",
            "category_id": category_id("Groceries"),
            "title": "Previous groceries",
            "note": "Previous month",
            "transaction_date": previous_month_start.isoformat(),
        },
        {
            "type": "expense",
            "amount": "90.00",
            "category_id": category_id("Transport"),
            "title": "Previous commute",
            "note": "Previous month",
            "transaction_date": (previous_month_start + timedelta(days=1)).isoformat(),
        },
        {
            "type": "expense",
            "amount": "40.00",
            "category_id": category_id("Shopping"),
            "title": "Previous shopping",
            "note": "Previous month",
            "transaction_date": (previous_month_start + timedelta(days=2)).isoformat(),
        },
    ]

    for payload in payloads:
        response = client.post("/api/v1/transactions/", json=payload, headers=headers)
        assert response.status_code == 201


def _signup_and_get_auth(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "supersecure123",
            "full_name": "FinPilot User",
            "currency": "USD",
        },
    )
    assert response.status_code == 201
    return response.json()


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
