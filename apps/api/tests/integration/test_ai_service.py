import asyncio
from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.ai_advice_log import AIAdviceLog
from app.models.enums import AIContextType
from app.models.user import User
from app.services.ai.provider import AICompletionResult
from app.services.ai.service import (
    AIService,
    GeneralAdviceInput,
    PurchaseCheckInput,
    ReportSummaryInput,
    SavingsAdviceInput,
    SpendingSummaryInput,
    _general_advice_messages,
    render_general_advice_context,
)

pytestmark = pytest.mark.usefixtures("reset_database")


class FakeProvider:
    async def generate_finance_guidance(self, *, messages, temperature=0.2, response_format=None):
        return AICompletionResult(
            text="Focus on your urgent goal first, keep monthly contributions consistent, and avoid stretching beyond your comfortable savings amount.",
            provider="fake-provider",
            model_name="fake-model",
            request_metadata={"message_count": len(messages), "temperature": temperature},
        )


def test_purchase_check_builds_context_and_logs_ai_response(
    client: TestClient,
    db_session,
) -> None:
    auth = _signup_and_get_auth(client, "aiservice@example.com")
    headers = _auth_headers(auth["access_token"])

    categories = client.get("/api/v1/categories/?include_hidden=true", headers=headers).json()
    groceries = next(category for category in categories if category["name"] == "Groceries")
    salary = next(category for category in categories if category["name"] == "Salary")

    settings_response = client.patch(
        f"/api/v1/categories/{groceries['id']}/settings",
        json={"monthly_budget_limit": "400.00"},
        headers=headers,
    )
    assert settings_response.status_code == 200

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
            "amount": "350.00",
            "category_id": groceries["id"],
            "title": "Current groceries",
            "transaction_date": current_day,
        },
        headers=headers,
    )
    assert expense_response.status_code == 201

    user = db_session.scalar(select(User).where(User.email == "aiservice@example.com"))
    assert user is not None

    service = AIService(provider=FakeProvider())
    result = asyncio.run(
        service.purchase_check(
            db_session,
            user_id=user.id,
            payload=PurchaseCheckInput(
                planned_amount=Decimal("100.00"),
                item_name="Extra grocery run",
                question="Can I afford another grocery run this month?",
                category_id=groceries["id"],
            ),
        )
    )

    assert result.verdict == "not_recommended"
    assert result.affordability_score <= 39
    assert result.context.category_name == "Groceries"
    assert result.context.current_category_spend == Decimal("350.00")
    assert result.context.category_budget_limit == Decimal("400.00")
    assert result.provider == "fake-provider"
    assert "urgent goal first" in result.guidance

    log = db_session.scalar(select(AIAdviceLog).where(AIAdviceLog.user_id == user.id))
    assert log is not None
    assert log.context_type == AIContextType.PURCHASE_CHECK
    assert log.provider == "fake-provider"
    assert log.model_name == "fake-model"
    assert log.request_metadata["planned_amount"] == "100.00"
    assert log.request_metadata["verdict"] == "not_recommended"


def test_general_advice_builds_context_and_logs_ai_response(
    client: TestClient,
    db_session,
) -> None:
    auth = _signup_and_get_auth(client, "generaladvice@example.com")
    headers = _auth_headers(auth["access_token"])
    _seed_analytics_transactions(client, headers)

    user = db_session.scalar(select(User).where(User.email == "generaladvice@example.com"))
    assert user is not None

    service = AIService(provider=FakeProvider())
    result = asyncio.run(
        service.general_advice(
            db_session,
            user_id=user.id,
            payload=GeneralAdviceInput(question="What should I focus on right now?"),
        )
    )

    assert result.provider == "fake-provider"
    assert result.context.currency_code == "USD"
    assert result.context.currency_symbol == "$"
    assert result.context.current_month_income == Decimal("3000.00")
    assert result.context.behavior_label == "Moderate spender"
    assert result.context.top_spending_category == "Groceries"
    assert "urgent goal first" in result.guidance

    log = db_session.scalar(
        select(AIAdviceLog).where(
            AIAdviceLog.user_id == user.id,
            AIAdviceLog.context_type == AIContextType.GENERAL_ADVICE,
        )
    )
    assert log is not None
    assert log.request_metadata["behavior_score"] >= 0


def test_general_advice_messages_use_user_currency_for_pkr(
    client: TestClient,
    db_session,
) -> None:
    auth = _signup_and_get_auth(client, "pkrcurrency@example.com", currency="PKR")
    headers = _auth_headers(auth["access_token"])
    _seed_analytics_transactions(client, headers)

    user = db_session.scalar(select(User).where(User.email == "pkrcurrency@example.com"))
    assert user is not None

    service = AIService(provider=FakeProvider())
    context = service.build_general_advice_context(db_session, user_id=user.id)
    rendered = render_general_advice_context(context)
    messages = _general_advice_messages(question="What should I focus on?", context=context)

    assert context.currency_code == "PKR"
    assert context.currency_symbol == "Rs"
    assert "currency_code=PKR" in rendered
    assert "currency_symbol=Rs" in rendered
    assert "Rs " in rendered
    assert "PKR" in messages[0]["content"]
    assert "Rs" in messages[0]["content"]


def test_savings_advice_builds_context_and_logs_ai_response(
    client: TestClient,
    db_session,
) -> None:
    auth = _signup_and_get_auth(client, "savingsai@example.com")
    headers = _auth_headers(auth["access_token"])

    categories = client.get("/api/v1/categories/?include_hidden=true", headers=headers).json()
    salary = next(category for category in categories if category["name"] == "Salary")

    income_response = client.post(
        "/api/v1/transactions/",
        json={
            "type": "income",
            "amount": "4500.00",
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
            "current_amount": "500.00",
            "target_date": date(date.today().year, 12, 31).isoformat(),
            "priority": "high",
            "status": "active",
        },
        headers=headers,
    )
    assert goal_response.status_code == 201
    goal = goal_response.json()

    user = db_session.scalar(select(User).where(User.email == "savingsai@example.com"))
    assert user is not None

    service = AIService(provider=FakeProvider())
    result = asyncio.run(
        service.savings_advice(
            db_session,
            user_id=user.id,
            payload=SavingsAdviceInput(
                question="How should I plan my savings this month?",
                goal_id=UUID(goal["id"]),
            ),
        )
    )

    assert result.provider == "fake-provider"
    assert result.context.currency_code == "USD"
    assert result.context.currency_symbol == "$"
    assert "urgent goal first" in result.guidance
    assert result.context.active_goal_count == 1
    assert result.context.focus_goal_name == "Emergency Fund"
    assert result.context.focus_goal_monthly_required > Decimal("0")
    assert len(result.context.allocations) == 1
    assert result.context.allocations[0].name == "Emergency Fund"

    log = db_session.scalar(
        select(AIAdviceLog)
        .where(AIAdviceLog.user_id == user.id, AIAdviceLog.context_type == AIContextType.SAVINGS_GOAL)
    )
    assert log is not None
    assert log.provider == "fake-provider"
    assert log.model_name == "fake-model"
    assert log.request_metadata["goal_id"] == goal["id"]
    assert log.request_metadata["active_goal_count"] == 1


def test_spending_summary_builds_context_and_logs_ai_response(
    client: TestClient,
    db_session,
) -> None:
    auth = _signup_and_get_auth(client, "spendingservice@example.com")
    headers = _auth_headers(auth["access_token"])
    _seed_analytics_transactions(client, headers)

    user = db_session.scalar(select(User).where(User.email == "spendingservice@example.com"))
    assert user is not None

    service = AIService(provider=FakeProvider())
    result = asyncio.run(
        service.spending_summary(
            db_session,
            user_id=user.id,
            payload=SpendingSummaryInput(
                question="What should I fix in my spending?",
                months=4,
            ),
        )
    )

    assert result.provider == "fake-provider"
    assert result.context.currency_code == "USD"
    assert result.context.currency_symbol == "$"
    assert result.context.total_spent == Decimal("600.00")
    assert result.context.behavior_label == "Moderate spender"
    assert result.context.top_categories[0].name == "Groceries"

    log = db_session.scalar(
        select(AIAdviceLog).where(
            AIAdviceLog.user_id == user.id,
            AIAdviceLog.context_type == AIContextType.SPENDING_SUMMARY,
        )
    )
    assert log is not None
    assert log.request_metadata["months"] == 4


def test_report_summary_builds_context_and_logs_ai_response(
    client: TestClient,
    db_session,
) -> None:
    auth = _signup_and_get_auth(client, "reportservice@example.com")
    headers = _auth_headers(auth["access_token"])
    _seed_analytics_transactions(client, headers)

    user = db_session.scalar(select(User).where(User.email == "reportservice@example.com"))
    assert user is not None

    service = AIService(provider=FakeProvider())
    result = asyncio.run(
        service.report_summary(
            db_session,
            user_id=user.id,
            payload=ReportSummaryInput(
                question="Summarize this month for me.",
                months=4,
            ),
        )
    )

    assert result.provider == "fake-provider"
    assert result.context.currency_code == "USD"
    assert result.context.currency_symbol == "$"
    assert result.context.net_saved == Decimal("2400.00")
    assert result.context.top_category_name == "Groceries"
    assert result.context.largest_transactions[0].title == "Carrefour"

    log = db_session.scalar(
        select(AIAdviceLog).where(
            AIAdviceLog.user_id == user.id,
            AIAdviceLog.context_type == AIContextType.REPORT_SUMMARY,
        )
    )
    assert log is not None
    assert log.request_metadata["months"] == 4



def _signup_and_get_auth(client: TestClient, email: str, currency: str = "USD") -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "supersecure123",
            "full_name": "FinPilot User",
            "currency": currency,
            "preferences": {
                "monthly_income_expected": "5000.00",
                "notifications_enabled": True,
                "default_currency": currency,
            },
        },
    )
    assert response.status_code == 201
    return response.json()


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _seed_analytics_transactions(client: TestClient, headers: dict[str, str]) -> None:
    categories = client.get("/api/v1/categories/", headers=headers).json()

    def category_id(name: str) -> str:
        return next(category["id"] for category in categories if category["name"] == name)

    today = date.today()
    month_start = today.replace(day=1)
    previous_month_start = (month_start - date.resolution).replace(day=1)
    second_current_day = today if today.day == 1 else today.replace(day=max(1, today.day - 1))
    third_current_day = month_start if month_start < second_current_day else today

    payloads = [
        {
            "type": "income",
            "amount": "3000.00",
            "income_frequency": "monthly",
            "category_id": category_id("Salary"),
            "title": "Main salary",
            "transaction_date": month_start.isoformat(),
        },
        {
            "type": "expense",
            "amount": "200.00",
            "category_id": category_id("Groceries"),
            "title": "Carrefour",
            "transaction_date": today.isoformat(),
        },
        {
            "type": "expense",
            "amount": "150.00",
            "category_id": category_id("Groceries"),
            "title": "Metro",
            "transaction_date": second_current_day.isoformat(),
        },
        {
            "type": "expense",
            "amount": "50.00",
            "category_id": category_id("Transport"),
            "title": "Uber",
            "transaction_date": third_current_day.isoformat(),
        },
        {
            "type": "expense",
            "amount": "80.00",
            "category_id": category_id("Subscriptions"),
            "title": "Spotify",
            "transaction_date": today.isoformat(),
        },
        {
            "type": "expense",
            "amount": "120.00",
            "category_id": category_id("Shopping"),
            "title": "New shirt",
            "transaction_date": today.isoformat(),
        },
        {
            "type": "income",
            "amount": "2800.00",
            "income_frequency": "monthly",
            "category_id": category_id("Salary"),
            "title": "Previous salary",
            "transaction_date": previous_month_start.isoformat(),
        },
        {
            "type": "expense",
            "amount": "100.00",
            "category_id": category_id("Groceries"),
            "title": "Previous groceries",
            "transaction_date": previous_month_start.isoformat(),
        },
        {
            "type": "expense",
            "amount": "90.00",
            "category_id": category_id("Transport"),
            "title": "Previous commute",
            "transaction_date": previous_month_start.isoformat(),
        },
        {
            "type": "expense",
            "amount": "40.00",
            "category_id": category_id("Shopping"),
            "title": "Previous shopping",
            "transaction_date": previous_month_start.isoformat(),
        },
    ]

    for payload in payloads:
        response = client.post("/api/v1/transactions/", json=payload, headers=headers)
        assert response.status_code == 201
