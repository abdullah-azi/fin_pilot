from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.deps import get_ai_service
from app.main import app
from app.models.ai_advice_log import AIAdviceLog
from app.models.enums import AIContextType
from app.models.user import User
from app.services.ai.provider import AICompletionResult
from app.services.ai.service import AIService

pytestmark = pytest.mark.usefixtures("reset_database")


class FakeAIService:
    async def purchase_check(self, db, *, user_id, payload):
        user = db.scalar(select(User).where(User.id == user_id))
        assert user is not None

        real_service = AIService(provider=_FakeProvider())
        return await real_service.purchase_check(db, user_id=user_id, payload=payload)

    async def savings_advice(self, db, *, user_id, payload):
        user = db.scalar(select(User).where(User.id == user_id))
        assert user is not None

        real_service = AIService(provider=_FakeProvider())
        return await real_service.savings_advice(db, user_id=user_id, payload=payload)


class _FakeProvider:
    async def generate_finance_guidance(self, *, messages, temperature=0.2, response_format=None):
        return AICompletionResult(
            text="Use caution. This purchase is possible, but it would tighten your category budget and savings pace.",
            provider="fake-provider",
            model_name="fake-model",
            request_metadata={"message_count": len(messages)},
        )


def test_ai_purchase_check_endpoint_returns_structured_response_and_logs(
    client: TestClient,
    db_session,
) -> None:
    app.dependency_overrides[get_ai_service] = lambda: FakeAIService()
    try:
        auth = _signup_and_get_auth(client, "purchasecheck@example.com")
        headers = _auth_headers(auth["access_token"])

        categories = client.get("/api/v1/categories/?include_hidden=true", headers=headers).json()
        groceries = next(category for category in categories if category["name"] == "Groceries")
        salary = next(category for category in categories if category["name"] == "Salary")

        update_response = client.patch(
            f"/api/v1/categories/{groceries['id']}/settings",
            json={"monthly_budget_limit": "450.00"},
            headers=headers,
        )
        assert update_response.status_code == 200

        today = date.today()
        month_start = today.replace(day=1).isoformat()
        current_day = today.isoformat()

        income_response = client.post(
            "/api/v1/transactions/",
            json={
                "type": "income",
                "amount": "5000.00",
                "income_frequency": "monthly",
                "category_id": salary["id"],
                "title": "Salary",
                "transaction_date": month_start,
            },
            headers=headers,
        )
        assert income_response.status_code == 201

        expense_response = client.post(
            "/api/v1/transactions/",
            json={
                "type": "expense",
                "amount": "300.00",
                "category_id": groceries["id"],
                "title": "Weekly groceries",
                "transaction_date": current_day,
            },
            headers=headers,
        )
        assert expense_response.status_code == 201

        response = client.post(
            "/api/v1/ai/purchase-check",
            json={
                "planned_amount": "200.00",
                "item_name": "Bulk groceries",
                "question": "Can I afford a larger grocery run this week?",
                "category_id": groceries["id"],
            },
            headers=headers,
        )
        assert response.status_code == 200

        body = response.json()
        assert body["verdict"] == "not_recommended"
        assert body["affordability_score"] <= 39
        assert body["guidance"].startswith("Use caution.")
        assert body["provider"] == "fake-provider"
        assert body["model_name"] == "fake-model"
        assert body["context"]["category_name"] == "Groceries"
        assert body["context"]["current_category_spend"] == "300.00"
        assert body["context"]["category_budget_limit"] == "450.00"
        assert body["context"]["planned_amount"] == "200.00"

        user = db_session.scalar(select(User).where(User.email == "purchasecheck@example.com"))
        assert user is not None
        log = db_session.scalar(select(AIAdviceLog).where(AIAdviceLog.user_id == user.id))
        assert log is not None
        assert log.provider == "fake-provider"
        assert log.model_name == "fake-model"
        assert log.request_metadata["planned_amount"] == "200.00"
    finally:
        app.dependency_overrides.clear()


def test_ai_savings_advice_endpoint_returns_structured_response_and_logs(
    client: TestClient,
    db_session,
) -> None:
    app.dependency_overrides[get_ai_service] = lambda: FakeAIService()
    try:
        auth = _signup_and_get_auth(client, "savingsadvice@example.com")
        headers = _auth_headers(auth["access_token"])

        categories = client.get("/api/v1/categories/?include_hidden=true", headers=headers).json()
        salary = next(category for category in categories if category["name"] == "Salary")

        income_response = client.post(
            "/api/v1/transactions/",
            json={
                "type": "income",
                "amount": "5000.00",
                "income_frequency": "monthly",
                "category_id": salary["id"],
                "title": "Salary",
                "transaction_date": date.today().replace(day=1).isoformat(),
            },
            headers=headers,
        )
        assert income_response.status_code == 201

        goal_response = client.post(
            "/api/v1/savings-goals/",
            json={
                "name": "Emergency Fund",
                "target_amount": "2000.00",
                "current_amount": "400.00",
                "target_date": date(date.today().year, 12, 31).isoformat(),
                "priority": "high",
                "status": "active",
            },
            headers=headers,
        )
        assert goal_response.status_code == 201
        goal = goal_response.json()

        response = client.post(
            "/api/v1/ai/savings-advice",
            json={
                "question": "How should I plan my savings this month?",
                "goal_id": goal["id"],
            },
            headers=headers,
        )
        assert response.status_code == 200

        body = response.json()
        assert body["guidance"].startswith("Use caution.")
        assert body["provider"] == "fake-provider"
        assert body["model_name"] == "fake-model"
        assert body["context"]["active_goal_count"] == 1
        assert body["context"]["focus_goal_name"] == "Emergency Fund"
        assert body["context"]["total_goal_monthly_required"] != "0.00"
        assert len(body["context"]["allocations"]) == 1
        assert body["context"]["allocations"][0]["name"] == "Emergency Fund"

        user = db_session.scalar(select(User).where(User.email == "savingsadvice@example.com"))
        assert user is not None
        log = db_session.scalar(
            select(AIAdviceLog).where(
                AIAdviceLog.user_id == user.id,
                AIAdviceLog.context_type == AIContextType.SAVINGS_GOAL,
            )
        )
        assert log is not None
        assert log.provider == "fake-provider"
        assert log.model_name == "fake-model"
        assert log.request_metadata["goal_id"] == goal["id"]
    finally:
        app.dependency_overrides.clear()


def _signup_and_get_auth(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "supersecure123",
            "full_name": "FinPilot User",
            "currency": "USD",
            "preferences": {
                "monthly_income_expected": "5000.00",
                "notifications_enabled": True,
                "default_currency": "USD",
            },
        },
    )
    assert response.status_code == 201
    return response.json()


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
