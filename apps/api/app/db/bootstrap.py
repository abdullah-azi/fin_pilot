from sqlalchemy import Engine, text

from app.db.base import Base
from app.db.session import engine
from app.models import register_models
from app.models.enums import (
    AIAdviceTone,
    AIContextType,
    CategoryType,
    GoalPriority,
    NotificationChannel,
    NotificationPlatform,
    RiskStyle,
    SavingsGoalStatus,
    TransactionFrequency,
    TransactionType,
)


ENUM_VALUE_SYNC: dict[str, list[str]] = {
    "aicontexttype": [item.value for item in AIContextType],
    "aiadvicetone": [item.value for item in AIAdviceTone],
    "categorytype": [item.value for item in CategoryType],
    "goalpriority": [item.value for item in GoalPriority],
    "notificationchannel": [item.value for item in NotificationChannel],
    "notificationplatform": [item.value for item in NotificationPlatform],
    "riskstyle": [item.value for item in RiskStyle],
    "savingsgoalstatus": [item.value for item in SavingsGoalStatus],
    "transaction_frequency": [item.value for item in TransactionFrequency],
    "transactiontype": [item.value for item in TransactionType],
}


def create_schema(bind_engine: Engine | None = None) -> None:
    active_engine = bind_engine or engine
    register_models()
    Base.metadata.create_all(bind=active_engine)
    _sync_enum_values(active_engine)
    _sync_transaction_frequency_schema(active_engine)
    _sync_settings_profile_schema(active_engine)
    _sync_notification_schema(active_engine)


def _sync_enum_values(bind_engine: Engine) -> None:
    with bind_engine.begin() as connection:
        for type_name, expected_values in ENUM_VALUE_SYNC.items():
            existing_values = connection.execute(
                text(
                    """
                    SELECT enumlabel
                    FROM pg_enum
                    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
                    WHERE pg_type.typname = :type_name
                    ORDER BY enumsortorder
                    """
                ),
                {"type_name": type_name},
            ).scalars().all()
            if not existing_values:
                continue

            for expected_value in expected_values:
                uppercase_value = expected_value.upper()
                if uppercase_value in existing_values and expected_value not in existing_values:
                    connection.execute(
                        text(
                            f"ALTER TYPE {type_name} RENAME VALUE '{uppercase_value}' TO '{expected_value}'"
                        )
                    )


def _sync_transaction_frequency_schema(bind_engine: Engine) -> None:
    with bind_engine.begin() as connection:
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_type
                        WHERE typname = 'transaction_frequency'
                    ) THEN
                        CREATE TYPE transaction_frequency AS ENUM (
                            'once',
                            'hourly',
                            'daily',
                            'monthly',
                            'yearly'
                        );
                    END IF;
                END $$;
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE transactions
                ADD COLUMN IF NOT EXISTS income_frequency transaction_frequency
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE transactions
                ADD COLUMN IF NOT EXISTS hours_per_day NUMERIC(5, 2)
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE transactions
                ADD COLUMN IF NOT EXISTS days_per_week NUMERIC(5, 2)
                """
            )
        )


def _sync_settings_profile_schema(bind_engine: Engine) -> None:
    with bind_engine.begin() as connection:
        connection.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR(500)
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS profile_image_storage_key VARCHAR(500)
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS phone VARCHAR(30)
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS month_start_day INTEGER NOT NULL DEFAULT 1
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS ai_suggestions_enabled BOOLEAN NOT NULL DEFAULT TRUE
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS weekly_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS savings_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS promotions_enabled BOOLEAN NOT NULL DEFAULT FALSE
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS appearance VARCHAR(20) NOT NULL DEFAULT 'dark'
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS language VARCHAR(20) NOT NULL DEFAULT 'English'
                """
            )
        )


def _sync_notification_schema(bind_engine: Engine) -> None:
    with bind_engine.begin() as connection:
        connection.execute(
            text(
                """
                ALTER TABLE notification_devices
                ADD COLUMN IF NOT EXISTS last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE notification_devices
                ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ
                """
            )
        )


if __name__ == "__main__":
    create_schema()
