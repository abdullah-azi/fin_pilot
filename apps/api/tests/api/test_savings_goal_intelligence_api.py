from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("reset_database")


def test_savings_goal_summary_returns_progress_and_pace_states(client: TestClient) -> None:
    headers = _auth_headers(_signup_and_get_auth(client, "goalsummary@example.com")["access_token"])
    _seed_goal_intelligence_data(client, headers)

    response = client.get("/api/v1/savings-goals/summary", headers=headers)
    assert response.status_code == 200

    body = response.json()
    assert body["period_label"] == date.today().strftime("%B %Y")
    assert body["active_goal_count"] == 3
    assert body["total_saved"] == "6000.00"
    assert body["total_target"] == "37000.00"
    assert body["overall_progress"] == "16.2"
    assert body["comfortable_monthly_savings"] == "4000.00"
    assert body["total_monthly_required"] == "11833.33"

    goals_by_name = {goal["name"]: goal for goal in body["goals"]}
    assert goals_by_name["Emergency fund"]["pace_status"] == "on_track"
    assert goals_by_name["Emergency fund"]["monthly_required"] == "1000.00"
    assert goals_by_name["New laptop"]["pace_status"] == "behind"
    assert goals_by_name["New laptop"]["monthly_required"] == "3333.33"
    assert goals_by_name["Holiday trip"]["pace_status"] == "at_risk"
    assert goals_by_name["Holiday trip"]["shortfall_amount"] == "3500.00"


def test_savings_goal_projection_uses_income_baseline_and_target_date(client: TestClient) -> None:
    headers = _auth_headers(_signup_and_get_auth(client, "goalprojection@example.com")["access_token"])
    _seed_goal_intelligence_data(client, headers)

    target_date = _month_start(date.today(), 3)
    response = client.post(
        "/api/v1/savings-goals/projection",
        json={
            "target_amount": "12000.00",
            "current_amount": "2000.00",
            "target_date": target_date.isoformat(),
            "monthly_contribution": "1500.00",
        },
        headers=headers,
    )
    assert response.status_code == 200

    body = response.json()
    assert body["monthly_required"] == "3333.33"
    assert body["income_share_percentage"] == "66.7"
    assert body["feasible_status"] == "behind"
    assert body["feasible_label"] == "Behind"
    assert body["comfortable_monthly_savings"] == "4000.00"
    assert body["projected_completion_date"] == _month_start(date.today(), 6).isoformat()
    assert body["will_hit_target_on_time"] is False


def test_savings_goal_recommendation_returns_allocation_plan(client: TestClient) -> None:
    headers = _auth_headers(_signup_and_get_auth(client, "goalrecommendation@example.com")["access_token"])
    _seed_goal_intelligence_data(client, headers)

    response = client.get("/api/v1/savings-goals/recommendation", headers=headers)
    assert response.status_code == 200

    body = response.json()
    assert body["period_label"] == date.today().strftime("%B %Y")
    assert body["comfortable_monthly_savings"] == "4000.00"
    assert body["total_monthly_required"] == "11833.33"
    assert body["can_fund_all_goals_on_time"] is False
    assert "4000.00/month comfortably" in body["recommendation_text"]
    assert "11833.33/month" in body["recommendation_text"]
    assert len(body["allocations"]) == 3
    allocations_by_name = {allocation["name"]: allocation for allocation in body["allocations"]}
    assert allocations_by_name["Emergency fund"]["recommended_monthly_contribution"] == "489.03"
    assert allocations_by_name["Emergency fund"]["required_monthly_contribution"] == "1000.00"
    assert allocations_by_name["Emergency fund"]["pace_status"] == "behind"
    assert allocations_by_name["New laptop"]["recommended_monthly_contribution"] == "1253.92"
    assert allocations_by_name["Holiday trip"]["recommended_monthly_contribution"] == "2257.05"


def _seed_goal_intelligence_data(client: TestClient, headers: dict[str, str]) -> None:
    categories = client.get("/api/v1/categories/", headers=headers).json()
    groceries_category = next(category for category in categories if category["name"] == "Groceries")
    transport_category = next(category for category in categories if category["name"] == "Transport")
    subscriptions_category = next(category for category in categories if category["name"] == "Subscriptions")

    today = date.today()
    expense_payloads = [
        {
            "type": "expense",
            "amount": "1200.00",
            "category_id": groceries_category["id"],
            "title": "Current month groceries",
            "transaction_date": today.isoformat(),
        },
        {
            "type": "expense",
            "amount": "900.00",
            "category_id": transport_category["id"],
            "title": "Previous month transport",
            "transaction_date": _month_start(today, -1).isoformat(),
        },
        {
            "type": "expense",
            "amount": "900.00",
            "category_id": subscriptions_category["id"],
            "title": "Two months back subscriptions",
            "transaction_date": _month_start(today, -2).isoformat(),
        },
    ]
    for payload in expense_payloads:
        response = client.post("/api/v1/transactions/", json=payload, headers=headers)
        assert response.status_code == 201

    goal_payloads = [
        {
            "name": "Emergency fund",
            "target_amount": "10000.00",
            "current_amount": "4000.00",
            "target_date": _month_start(today, 6).isoformat(),
            "priority": "high",
            "status": "active",
        },
        {
            "name": "New laptop",
            "target_amount": "12000.00",
            "current_amount": "2000.00",
            "target_date": _month_start(today, 3).isoformat(),
            "priority": "medium",
            "status": "active",
        },
        {
            "name": "Holiday trip",
            "target_amount": "15000.00",
            "current_amount": "0.00",
            "target_date": _month_start(today, 2).isoformat(),
            "priority": "low",
            "status": "active",
        },
        {
            "name": "Paused goal",
            "target_amount": "5000.00",
            "current_amount": "1000.00",
            "target_date": _month_start(today, 4).isoformat(),
            "priority": "low",
            "status": "paused",
        },
    ]
    for payload in goal_payloads:
        response = client.post("/api/v1/savings-goals/", json=payload, headers=headers)
        assert response.status_code == 201


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


def _month_start(reference_date: date, offset: int) -> date:
    zero_indexed_month = reference_date.month - 1 + offset
    year = reference_date.year + zero_indexed_month // 12
    month = zero_indexed_month % 12 + 1
    return date(year, month, 1)
