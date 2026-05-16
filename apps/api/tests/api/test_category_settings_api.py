from datetime import date

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("reset_database")


def test_category_settings_are_user_specific_and_hidden_categories_can_be_included(client: TestClient) -> None:
    owner = _signup_and_get_auth(client, "categoryowner@example.com")
    other = _signup_and_get_auth(client, "categoryother@example.com")

    owner_headers = _auth_headers(owner["access_token"])
    other_headers = _auth_headers(other["access_token"])

    owner_categories = client.get("/api/v1/categories/?include_hidden=true", headers=owner_headers).json()
    groceries = next(category for category in owner_categories if category["name"] == "Groceries")

    update_response = client.patch(
        f"/api/v1/categories/{groceries['id']}/settings",
        json={
            "display_name": "Essentials",
            "is_hidden": True,
            "monthly_budget_limit": "500.00",
        },
        headers=owner_headers,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Groceries"
    assert updated["effective_name"] == "Essentials"
    assert updated["is_hidden"] is True
    assert updated["monthly_budget_limit"] == "500.00"

    visible_owner_categories = client.get("/api/v1/categories/", headers=owner_headers).json()
    assert all(category["id"] != groceries["id"] for category in visible_owner_categories)

    hidden_owner_categories = client.get("/api/v1/categories/?include_hidden=true", headers=owner_headers).json()
    owner_hidden = next(category for category in hidden_owner_categories if category["id"] == groceries["id"])
    assert owner_hidden["effective_name"] == "Essentials"

    other_categories = client.get("/api/v1/categories/?include_hidden=true", headers=other_headers).json()
    other_groceries = next(category for category in other_categories if category["id"] == groceries["id"])
    assert other_groceries["effective_name"] == "Groceries"
    assert other_groceries["is_hidden"] is False
    assert other_groceries["monthly_budget_limit"] is None


def test_custom_category_can_be_created_listed_and_deleted(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "customcategory@example.com")
    headers = _auth_headers(auth["access_token"])

    create_response = client.post(
        "/api/v1/categories/",
        json={
            "name": "Side Hustle",
            "type": "income",
            "color": "#22C55E",
            "icon": "rocket",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Side Hustle"
    assert created["effective_name"] == "Side Hustle"
    assert created["is_custom"] is True

    categories = client.get("/api/v1/categories/?include_hidden=true", headers=headers).json()
    assert any(category["id"] == created["id"] for category in categories)

    delete_response = client.delete(f"/api/v1/categories/{created['id']}", headers=headers)
    assert delete_response.status_code == 204

    categories_after_delete = client.get("/api/v1/categories/?include_hidden=true", headers=headers).json()
    assert all(category["id"] != created["id"] for category in categories_after_delete)


def test_category_rename_flows_into_history_and_dashboard(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "categoryanalytics@example.com")
    headers = _auth_headers(auth["access_token"])

    categories = client.get("/api/v1/categories/?include_hidden=true", headers=headers).json()
    groceries = next(category for category in categories if category["name"] == "Groceries")
    salary = next(category for category in categories if category["name"] == "Salary")

    rename_response = client.patch(
        f"/api/v1/categories/{groceries['id']}/settings",
        json={"display_name": "Bananas"},
        headers=headers,
    )
    assert rename_response.status_code == 200

    today = date.today().isoformat()
    salary_response = client.post(
        "/api/v1/transactions/",
        json={
            "type": "income",
            "amount": "3000.00",
            "income_frequency": "monthly",
            "category_id": salary["id"],
            "title": "Salary",
            "transaction_date": today,
        },
        headers=headers,
    )
    assert salary_response.status_code == 201

    expense_response = client.post(
        "/api/v1/transactions/",
        json={
            "type": "expense",
            "amount": "250.00",
            "category_id": groceries["id"],
            "title": "Carrefour",
            "transaction_date": today,
        },
        headers=headers,
    )
    assert expense_response.status_code == 201

    history_response = client.get("/api/v1/transactions/", headers=headers)
    assert history_response.status_code == 200
    history_body = history_response.json()
    expense_item = next(item for item in history_body["items"] if item["type"] == "expense")
    assert expense_item["category"]["name"] == "Bananas"

    dashboard_response = client.get("/api/v1/dashboard/summary", headers=headers)
    assert dashboard_response.status_code == 200
    dashboard_body = dashboard_response.json()
    assert dashboard_body["top_categories"][0]["name"] == "Bananas"

    insights_response = client.get("/api/v1/insights/spending-analysis", headers=headers)
    assert insights_response.status_code == 200
    insights_body = insights_response.json()
    assert insights_body["category_breakdown"][0]["name"] == "Bananas"
    assert insights_body["behavior"]["planned_buys"] == 1
    assert insights_body["behavior"]["impulse_buys"] == 0


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
