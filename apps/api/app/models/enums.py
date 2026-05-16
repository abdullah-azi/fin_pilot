from enum import StrEnum


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
