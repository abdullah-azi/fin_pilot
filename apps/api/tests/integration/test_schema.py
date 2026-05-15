from app.db.base import Base
from app.models import register_models


def test_schema_tables_registered() -> None:
    register_models()

    assert {
        "users",
        "user_sessions",
        "categories",
        "transactions",
        "savings_goals",
        "user_preferences",
        "ai_advice_logs",
    }.issubset(Base.metadata.tables.keys())
