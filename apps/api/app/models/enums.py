from enum import StrEnum

from sqlalchemy import Enum as SQLAlchemyEnum


class TransactionType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class TransactionFrequency(StrEnum):
    ONCE = "once"
    HOURLY = "hourly"
    DAILY = "daily"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class CategoryType(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    BOTH = "both"


class SavingsGoalStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"


class GoalPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class RiskStyle(StrEnum):
    CONSERVATIVE = "conservative"
    BALANCED = "balanced"
    AGGRESSIVE = "aggressive"


class AIAdviceTone(StrEnum):
    SUPPORTIVE = "supportive"
    DIRECT = "direct"
    DETAILED = "detailed"


class AIContextType(StrEnum):
    PURCHASE_CHECK = "purchase_check"
    SPENDING_SUMMARY = "spending_summary"
    SAVINGS_GOAL = "savings_goal"
    REPORT_SUMMARY = "report_summary"
    GENERAL_ADVICE = "general_advice"


class NotificationPlatform(StrEnum):
    ANDROID = "android"
    IOS = "ios"
    WEB = "web"
    UNKNOWN = "unknown"


class NotificationChannel(StrEnum):
    TEST = "test"
    WEEKLY_DIGEST = "weekly_digest"
    SAVINGS_REMINDER = "savings_reminder"
    PROMOTION = "promotion"


def db_enum(enum_cls: type[StrEnum], *, name: str | None = None) -> SQLAlchemyEnum:
    return SQLAlchemyEnum(
        enum_cls,
        name=name,
        values_callable=lambda members: [member.value for member in members],
    )
