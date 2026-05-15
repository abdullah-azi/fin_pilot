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
            "currency": "usd",
            "country": "Pakistan",
            "preferences": {
                "monthly_income_expected": "5000.00",
                "monthly_savings_target": "1000.00",
                "notifications_enabled": True,
                "default_currency": "usd",
            },
        },
    )
    assert signup_response.status_code == 201
    signup_body = signup_response.json()
    assert signup_body["user"]["email"] == "user@example.com"
    assert signup_body["user"]["currency"] == "USD"
    assert signup_body["user"]["preferences"]["default_currency"] == "USD"

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

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_response.status_code == 200
    assert refresh_response.json()["access_token"] != access_token


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
