from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("reset_database")


def test_auth_signup_login_and_me_flow(client: TestClient) -> None:
    signup_response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": "user@example.com",
            "password": "supersecure123",
            "full_name": "Fin Pilot",
            "phone": "+923001112233",
            "currency": "usd",
            "country": "Pakistan",
            "preferences": {
                "monthly_income_expected": "5000.00",
                "monthly_savings_target": "1000.00",
                "month_start_day": 25,
                "ai_suggestions_enabled": True,
                "weekly_digest_enabled": True,
                "savings_reminders_enabled": True,
                "promotions_enabled": False,
                "biometric_enabled": True,
                "appearance": "dark",
                "language": "English",
                "notifications_enabled": True,
                "default_currency": "usd",
            },
        },
    )
    assert signup_response.status_code == 201
    signup_body = signup_response.json()
    assert signup_body["user"]["email"] == "user@example.com"
    assert signup_body["user"]["phone"] == "+923001112233"
    assert signup_body["user"]["currency"] == "USD"
    assert signup_body["user"]["preferences"]["default_currency"] == "USD"
    assert signup_body["user"]["preferences"]["month_start_day"] == 25
    assert signup_body["user"]["preferences"]["biometric_enabled"] is True

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "supersecure123"},
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    refresh_token = login_response.json()["refresh_token"]

    me_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"
    assert me_response.json()["preferences"]["appearance"] == "dark"

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_response.status_code == 200
    refreshed_access_token = refresh_response.json()["access_token"]
    assert refreshed_access_token != access_token

    change_password_response = client.post(
        "/api/v1/users/me/change-password",
        json={
            "current_password": "supersecure123",
            "new_password": "newsupersecure123",
        },
        headers={"Authorization": f"Bearer {refreshed_access_token}"},
    )
    assert change_password_response.status_code == 200
    assert change_password_response.json() == {"status": "password_changed"}

    old_login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "supersecure123"},
    )
    assert old_login_response.status_code == 401

    new_login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "newsupersecure123"},
    )
    assert new_login_response.status_code == 200


def test_auth_email_is_case_insensitive(client: TestClient) -> None:
    signup_response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": "CaseUser@Example.com",
            "password": "supersecure123",
            "full_name": "Case User",
            "currency": "usd",
        },
    )
    assert signup_response.status_code == 201
    assert signup_response.json()["user"]["email"] == "caseuser@example.com"

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "CASEUSER@EXAMPLE.COM", "password": "supersecure123"},
    )
    assert login_response.status_code == 200
    assert login_response.json()["user"]["email"] == "caseuser@example.com"


def test_profile_image_upload_and_delete(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "avatar@example.com")
    headers = _auth_headers(auth["access_token"])

    upload_response = client.post(
        "/api/v1/users/me/profile-image",
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\nfakepng", "image/png")},
        headers=headers,
    )
    assert upload_response.status_code == 200
    uploaded_url = upload_response.json()["profile_image_url"]
    assert uploaded_url.startswith("/uploads/profile-images/")

    me_response = client.get("/api/v1/users/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["profile_image_url"] == uploaded_url

    delete_response = client.delete("/api/v1/users/me/profile-image", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json() == {"status": "profile_image_deleted"}

    me_response_after_delete = client.get("/api/v1/users/me", headers=headers)
    assert me_response_after_delete.status_code == 200
    assert me_response_after_delete.json()["profile_image_url"] is None


def test_protected_resource_crud_flow(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "spender@example.com")
    headers = _auth_headers(auth["access_token"])

    seed_response = client.post("/api/v1/categories/seed-defaults", headers=headers)
    assert seed_response.status_code == 201

    categories_response = client.get("/api/v1/categories/", headers=headers)
    assert categories_response.status_code == 200
    category_id = categories_response.json()[0]["id"]

    user_me_response = client.patch(
        "/api/v1/users/me",
        json={"full_name": "Spender Updated", "preferences": {"notifications_enabled": False}},
        headers=headers,
    )
    assert user_me_response.status_code == 200
    assert user_me_response.json()["full_name"] == "Spender Updated"

    transaction_response = client.post(
        "/api/v1/transactions/",
        json={
            "type": "expense",
            "amount": "42.50",
            "category_id": category_id,
            "title": "Coffee beans",
            "note": "Monthly refill",
            "transaction_date": "2026-05-15",
        },
        headers=headers,
    )
    assert transaction_response.status_code == 201
    transaction_id = transaction_response.json()["id"]

    list_transactions_response = client.get("/api/v1/transactions/", headers=headers)
    assert list_transactions_response.status_code == 200
    assert len(list_transactions_response.json()["items"]) == 1

    patch_transaction_response = client.patch(
        f"/api/v1/transactions/{transaction_id}",
        json={"note": "Updated note"},
        headers=headers,
    )
    assert patch_transaction_response.status_code == 200
    assert patch_transaction_response.json()["note"] == "Updated note"

    goal_response = client.post(
        "/api/v1/savings-goals/",
        json={
            "name": "Emergency Fund",
            "description": "Starter safety net",
            "target_amount": "1500.00",
            "current_amount": "200.00",
            "target_date": "2026-12-31",
            "priority": "high",
            "status": "active",
        },
        headers=headers,
    )
    assert goal_response.status_code == 201
    goal_id = goal_response.json()["id"]

    list_goals_response = client.get("/api/v1/savings-goals/", headers=headers)
    assert list_goals_response.status_code == 200
    assert len(list_goals_response.json()["items"]) == 1

    patch_goal_response = client.patch(
        f"/api/v1/savings-goals/{goal_id}",
        json={"current_amount": "300.00"},
        headers=headers,
    )
    assert patch_goal_response.status_code == 200
    assert patch_goal_response.json()["current_amount"] == "300.00"


def test_user_settings_fields_persist_via_users_me(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "settingsuser@example.com")
    headers = _auth_headers(auth["access_token"])

    update_response = client.patch(
        "/api/v1/users/me",
        json={
            "full_name": "Settings User",
            "phone": "+97455555555",
            "country": "Qatar",
            "preferences": {
                "month_start_day": 25,
                "ai_suggestions_enabled": False,
                "weekly_digest_enabled": True,
                "savings_reminders_enabled": False,
                "promotions_enabled": True,
                "biometric_enabled": True,
                "appearance": "dark",
                "language": "Arabic",
                "notifications_enabled": False,
            },
        },
        headers=headers,
    )
    assert update_response.status_code == 200
    body = update_response.json()
    assert body["phone"] == "+97455555555"
    assert body["country"] == "Qatar"
    assert body["preferences"]["month_start_day"] == 25
    assert body["preferences"]["ai_suggestions_enabled"] is False
    assert body["preferences"]["weekly_digest_enabled"] is True
    assert body["preferences"]["savings_reminders_enabled"] is False
    assert body["preferences"]["promotions_enabled"] is True
    assert body["preferences"]["biometric_enabled"] is True
    assert body["preferences"]["appearance"] == "dark"
    assert body["preferences"]["language"] == "Arabic"
    assert body["preferences"]["notifications_enabled"] is False

    me_response = client.get("/api/v1/users/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["phone"] == "+97455555555"
    assert me_response.json()["preferences"]["language"] == "Arabic"


def test_income_transaction_supports_frequency_metadata(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "incomeflow@example.com")
    headers = _auth_headers(auth["access_token"])

    categories = client.get("/api/v1/categories/", headers=headers).json()
    income_category = next(category for category in categories if category["type"] == "income")

    response = client.post(
        "/api/v1/transactions/",
        json={
            "type": "income",
            "amount": "2500.00",
            "income_frequency": "hourly",
            "hours_per_day": "8",
            "days_per_week": "5",
            "category_id": income_category["id"],
            "title": "Client work",
            "note": "Hourly freelance retainer",
            "transaction_date": "2026-05-15",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["income_frequency"] == "hourly"
    assert body["hours_per_day"] == "8.00"
    assert body["days_per_week"] == "5.00"


def test_expense_transaction_rejects_income_frequency_metadata(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "expensevalidation@example.com")
    headers = _auth_headers(auth["access_token"])

    categories = client.get("/api/v1/categories/", headers=headers).json()
    expense_category = next(category for category in categories if category["type"] == "expense")

    response = client.post(
        "/api/v1/transactions/",
        json={
            "type": "expense",
            "amount": "42.50",
            "income_frequency": "monthly",
            "category_id": expense_category["id"],
            "title": "Coffee beans",
            "transaction_date": "2026-05-15",
        },
        headers=headers,
    )

    assert response.status_code == 400
    assert "Expense transactions cannot include income frequency fields." in response.json()["detail"]


def test_history_endpoint_supports_filters_summary_and_pagination(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "historyfilters@example.com")
    headers = _auth_headers(auth["access_token"])

    categories = client.get("/api/v1/categories/", headers=headers).json()
    groceries_category = next(category for category in categories if category["name"] == "Groceries")
    transport_category = next(category for category in categories if category["name"] == "Transport")
    salary_category = next(category for category in categories if category["name"] == "Salary")

    payloads = [
        {
            "type": "expense",
            "amount": "3240.00",
            "category_id": groceries_category["id"],
            "title": "Carrefour",
            "note": "Monthly stock-up",
            "transaction_date": "2026-05-16",
        },
        {
            "type": "expense",
            "amount": "850.00",
            "category_id": transport_category["id"],
            "title": "Uber",
            "note": "Airport ride",
            "transaction_date": "2026-05-15",
        },
        {
            "type": "income",
            "amount": "140000.00",
            "income_frequency": "monthly",
            "category_id": salary_category["id"],
            "title": "Acme Corp",
            "note": "May salary",
            "transaction_date": "2026-05-01",
        },
        {
            "type": "expense",
            "amount": "4800.00",
            "category_id": groceries_category["id"],
            "title": "Al-Fatah",
            "note": "Pantry restock",
            "transaction_date": "2026-04-10",
        },
    ]

    for payload in payloads:
        response = client.post("/api/v1/transactions/", json=payload, headers=headers)
        assert response.status_code == 201

    may_expenses_response = client.get(
        "/api/v1/transactions/?type=expense&date_from=2026-05-01&date_to=2026-05-31&limit=1&offset=0",
        headers=headers,
    )
    assert may_expenses_response.status_code == 200
    may_expenses_body = may_expenses_response.json()
    assert len(may_expenses_body["items"]) == 1
    assert may_expenses_body["summary"]["total_count"] == 2
    assert may_expenses_body["summary"]["total_expense"] == "4090.00"
    assert may_expenses_body["summary"]["total_income"] == "0.00"
    assert may_expenses_body["summary"]["net"] == "-4090.00"
    assert may_expenses_body["meta"] == {"limit": 1, "offset": 0, "has_more": True}

    groceries_search_response = client.get(
        "/api/v1/transactions/?type=expense&q=grocer",
        headers=headers,
    )
    assert groceries_search_response.status_code == 200
    groceries_search_body = groceries_search_response.json()
    assert groceries_search_body["summary"]["total_count"] == 2
    assert groceries_search_body["summary"]["total_expense"] == "8040.00"
    assert groceries_search_body["items"][0]["category"]["name"] == "Groceries"
    assert groceries_search_body["items"][0]["category"]["icon"] == "shopping-basket"


def test_transactions_delete_all_removes_user_history(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "bulkdelete@example.com")
    headers = _auth_headers(auth["access_token"])

    categories = client.get("/api/v1/categories/", headers=headers).json()
    groceries_category = next(category for category in categories if category["name"] == "Groceries")

    for amount in ("120.00", "250.00"):
        response = client.post(
            "/api/v1/transactions/",
            json={
                "type": "expense",
                "amount": amount,
                "category_id": groceries_category["id"],
                "title": "Grocery run",
                "transaction_date": "2026-05-16",
            },
            headers=headers,
        )
        assert response.status_code == 201

    delete_response = client.delete("/api/v1/transactions/all", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted_count": 2, "status": "deleted"}

    list_response = client.get("/api/v1/transactions/", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()["items"] == []
    assert list_response.json()["summary"]["total_count"] == 0


def test_dashboard_summary_returns_current_month_overview(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "dashboard@example.com")
    headers = _auth_headers(auth["access_token"])

    categories = client.get("/api/v1/categories/", headers=headers).json()
    groceries_category = next(category for category in categories if category["name"] == "Groceries")
    transport_category = next(category for category in categories if category["name"] == "Transport")
    salary_category = next(category for category in categories if category["name"] == "Salary")

    today = date.today()
    month_start = today.replace(day=1)
    previous_month_day = month_start - timedelta(days=1)
    second_current_month_day = today if today.day == 1 else today - timedelta(days=1)

    payloads = [
        {
            "type": "income",
            "amount": "5000.00",
            "income_frequency": "monthly",
            "category_id": salary_category["id"],
            "title": "Acme Corp",
            "note": "Current month salary",
            "transaction_date": month_start.isoformat(),
        },
        {
            "type": "expense",
            "amount": "200.00",
            "category_id": groceries_category["id"],
            "title": "Carrefour",
            "note": "Weekly groceries",
            "transaction_date": today.isoformat(),
        },
        {
            "type": "expense",
            "amount": "100.00",
            "category_id": transport_category["id"],
            "title": "Uber",
            "note": "Office commute",
            "transaction_date": second_current_month_day.isoformat(),
        },
        {
            "type": "expense",
            "amount": "999.00",
            "category_id": groceries_category["id"],
            "title": "Old expense",
            "note": "Previous month",
            "transaction_date": previous_month_day.isoformat(),
        },
    ]

    for payload in payloads:
        response = client.post("/api/v1/transactions/", json=payload, headers=headers)
        assert response.status_code == 201

    goal_response = client.post(
        "/api/v1/savings-goals/",
        json={
            "name": "Emergency Fund",
            "description": "Keep building liquidity",
            "target_amount": "1000.00",
            "current_amount": "500.00",
            "target_date": (today + timedelta(days=120)).isoformat(),
            "priority": "high",
            "status": "active",
        },
        headers=headers,
    )
    assert goal_response.status_code == 201

    paused_goal_response = client.post(
        "/api/v1/savings-goals/",
        json={
            "name": "Vacation",
            "description": "Paused plan",
            "target_amount": "3000.00",
            "current_amount": "200.00",
            "target_date": (today + timedelta(days=240)).isoformat(),
            "priority": "medium",
            "status": "paused",
        },
        headers=headers,
    )
    assert paused_goal_response.status_code == 201

    dashboard_response = client.get("/api/v1/dashboard/summary", headers=headers)
    assert dashboard_response.status_code == 200

    body = dashboard_response.json()
    assert body["month_label"] == today.strftime("%B %Y")
    assert body["summary"] == {
        "transaction_count": 3,
        "total_income": "5000.00",
        "total_expense": "300.00",
        "net": "4700.00",
    }
    assert len(body["top_categories"]) == 2
    assert body["top_categories"][0]["name"] == "Groceries"
    assert body["top_categories"][0]["total_amount"] == "200.00"
    assert body["top_categories"][0]["percentage"] == "66.7"
    assert body["top_categories"][1]["name"] == "Transport"
    assert len(body["recent_transactions"]) == 3
    assert body["recent_transactions"][0]["title"] == "Carrefour"
    assert all(item["title"] != "Old expense" for item in body["recent_transactions"])
    assert body["active_goal"]["name"] == "Emergency Fund"
    assert body["active_goal"]["progress_percentage"] == "50.0"
    assert body["insight"].startswith("Groceries is leading your spending this month")


def test_protected_endpoints_require_auth(client: TestClient) -> None:
    response = client.get("/api/v1/transactions/")
    assert response.status_code == 401


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
