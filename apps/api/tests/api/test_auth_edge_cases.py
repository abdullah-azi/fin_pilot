import pytest
from fastapi.testclient import TestClient


pytestmark = pytest.mark.usefixtures("reset_database")


def test_signup_rejects_duplicate_email(client: TestClient) -> None:
    payload = {
        "email": "duplicate@example.com",
        "password": "supersecure123",
        "full_name": "Duplicate User",
        "currency": "USD",
    }

    first = client.post("/api/v1/auth/signup", json=payload)
    second = client.post("/api/v1/auth/signup", json=payload)

    assert first.status_code == 201
    assert second.status_code == 409


def test_login_rejects_wrong_password(client: TestClient) -> None:
    _signup_and_get_auth(client, "wrongpass@example.com")

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpass@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_refresh_rejects_invalid_token(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "not-a-real-token"},
    )

    assert response.status_code == 401


def test_logout_revokes_access_token_session(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "logout@example.com")
    headers = _auth_headers(auth["access_token"])

    logout_response = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_response.status_code == 200

    me_response = client.get("/api/v1/auth/me", headers=headers)
    assert me_response.status_code == 401


def test_refresh_rotates_and_revokes_old_refresh_token(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "refreshrotate@example.com")

    first_refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert first_refresh.status_code == 200

    second_refresh_with_old_token = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert second_refresh_with_old_token.status_code == 401


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

