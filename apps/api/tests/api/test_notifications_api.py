import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_notification_service
from app.main import app
from app.models.enums import NotificationChannel
from app.services.notifications import NotificationSendResult

pytestmark = pytest.mark.usefixtures("reset_database")


class FakeNotificationService:
    async def send_test_notification(self, db, *, user, title, body, data=None):
        return NotificationSendResult(
            attempted_count=1,
            delivered_count=1,
            failed_count=0,
            channel=NotificationChannel.TEST,
        )

    async def send_weekly_digest(self, db, *, user):
        return NotificationSendResult(
            attempted_count=1,
            delivered_count=1,
            failed_count=0,
            channel=NotificationChannel.WEEKLY_DIGEST,
        )

    async def send_savings_reminder(self, db, *, user):
        return NotificationSendResult(
            attempted_count=1,
            delivered_count=1,
            failed_count=0,
            channel=NotificationChannel.SAVINGS_REMINDER,
        )


def test_notification_device_registration_flow(client: TestClient) -> None:
    auth = _signup_and_get_auth(client, "notify-device@example.com")
    headers = _auth_headers(auth["access_token"])

    register_response = client.post(
        "/api/v1/notifications/devices/register",
        json={
            "expo_push_token": "ExponentPushToken[test-token-123]",
            "platform": "android",
            "device_name": "Pixel 8",
            "app_build": "1.0.0",
            "push_enabled": True,
        },
        headers=headers,
    )
    assert register_response.status_code == 201
    register_body = register_response.json()
    assert register_body["platform"] == "android"
    assert register_body["is_active"] is True
    assert register_body["push_enabled"] is True

    list_response = client.get("/api/v1/notifications/devices", headers=headers)
    assert list_response.status_code == 200
    list_body = list_response.json()
    assert len(list_body["items"]) == 1
    assert list_body["items"][0]["expo_push_token"] == "ExponentPushToken[test-token-123]"

    deactivate_response = client.post(
        "/api/v1/notifications/devices/deactivate",
        json={"expo_push_token": "ExponentPushToken[test-token-123]"},
        headers=headers,
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["status"] == "device_deactivated"

    list_after_response = client.get("/api/v1/notifications/devices", headers=headers)
    assert list_after_response.status_code == 200
    assert list_after_response.json()["items"][0]["is_active"] is False


def test_notification_send_endpoints(client: TestClient) -> None:
    app.dependency_overrides[get_notification_service] = lambda: FakeNotificationService()
    try:
        auth = _signup_and_get_auth(client, "notify-send@example.com")
        headers = _auth_headers(auth["access_token"])

        test_response = client.post(
            "/api/v1/notifications/test",
            json={"title": "Ping", "body": "Hello from FinPilot"},
            headers=headers,
        )
        assert test_response.status_code == 200
        assert test_response.json()["channel"] == "test"

        weekly_response = client.post("/api/v1/notifications/weekly-digest", headers=headers)
        assert weekly_response.status_code == 200
        assert weekly_response.json()["channel"] == "weekly_digest"

        savings_response = client.post("/api/v1/notifications/savings-reminder", headers=headers)
        assert savings_response.status_code == 200
        assert savings_response.json()["channel"] == "savings_reminder"
    finally:
        app.dependency_overrides.clear()


def _signup_and_get_auth(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "supersecure123",
            "full_name": "Notify User",
            "currency": "PKR",
        },
    )
    assert response.status_code == 201
    return response.json()


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
