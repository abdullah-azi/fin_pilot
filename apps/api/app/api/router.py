from fastapi import APIRouter

from app.api.v1.endpoints import (
    ai,
    auth,
    categories,
    dashboard,
    health,
    imports,
    insights,
    notifications,
    savings_goals,
    transactions,
    users,
)

api_router = APIRouter()
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(savings_goals.router, prefix="/savings-goals", tags=["savings-goals"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(imports.router, prefix="/imports", tags=["imports"])
api_router.include_router(insights.router, prefix="/insights", tags=["insights"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
