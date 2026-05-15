import pytest
from fastapi.testclient import TestClient


pytestmark = pytest.mark.usefixtures("reset_database")


def test_user_cannot_access_another_users_transaction(client: TestClient) -> None:
    owner = _signup_and_get_auth(client, "owner@example.com")
    attacker = _signup_and_get_auth(client, "attacker@example.com")

    owner_headers = _auth_headers(owner["access_token"])
    attacker_headers = _auth_headers(attacker["access_token"])

    client.post("/api/v1/categories/seed-defaults", headers=owner_headers)
    categories = client.get("/api/v1/categories/", headers=owner_headers).json()
    category_id = categories[0]["id"]

    transaction = client.post(
        "/api/v1/transactions/",
        json={
            "type": "expense",
            "amount": "25.00",
            "category_id": category_id,
            "title": "Owner purchase",
            "note": "private",
            "transaction_date": "2026-05-15",
        },
        headers=owner_headers,
    ).json()

    get_response = client.get(
        f"/api/v1/transactions/{transaction['id']}",
        headers=attacker_headers,
    )
    patch_response = client.patch(
        f"/api/v1/transactions/{transaction['id']}",
        json={"note": "hijacked"},
        headers=attacker_headers,
    )
    delete_response = client.delete(
        f"/api/v1/transactions/{transaction['id']}",
        headers=attacker_headers,
    )

    assert get_response.status_code == 404
    assert patch_response.status_code == 404
    assert delete_response.status_code == 404


def test_user_cannot_access_another_users_savings_goal(client: TestClient) -> None:
    owner = _signup_and_get_auth(client, "goalowner@example.com")
    attacker = _signup_and_get_auth(client, "goalattacker@example.com")

    owner_headers = _auth_headers(owner["access_token"])
    attacker_headers = _auth_headers(attacker["access_token"])

    goal = client.post(
        "/api/v1/savings-goals/",
        json={
            "name": "Private Goal",
            "description": "private",
            "target_amount": "900.00",
            "current_amount": "100.00",
            "target_date": "2026-12-31",
            "priority": "medium",
            "status": "active",
        },
        headers=owner_headers,
    ).json()

    get_response = client.get(
        f"/api/v1/savings-goals/{goal['id']}",
        headers=attacker_headers,
    )
    patch_response = client.patch(
        f"/api/v1/savings-goals/{goal['id']}",
        json={"current_amount": "500.00"},
        headers=attacker_headers,
    )
    delete_response = client.delete(
        f"/api/v1/savings-goals/{goal['id']}",
        headers=attacker_headers,
    )

    assert get_response.status_code == 404
    assert patch_response.status_code == 404
    assert delete_response.status_code == 404


def test_category_seed_is_idempotent(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "seedcheck@example.com")
    headers = _auth_headers(auth["access_token"])

    initial_categories = client.get("/api/v1/categories/", headers=headers).json()
    first = client.post("/api/v1/categories/seed-defaults", headers=headers)
    second = client.post("/api/v1/categories/seed-defaults", headers=headers)
    final_categories = client.get("/api/v1/categories/", headers=headers).json()

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["created_count"] == 0
    assert second.json()["created_count"] == 0
    assert first.json()["skipped_count"] > 0
    assert second.json()["skipped_count"] > 0
    assert len(initial_categories) == len(final_categories)


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
