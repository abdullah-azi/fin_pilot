"""initial schema

Revision ID: 20260522_0001
Revises:
Create Date: 2026-05-22 00:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260522_0001"
down_revision = None
branch_labels = None
depends_on = None


ENUM_SQL = [
    """
    CREATE TYPE aicontexttype AS ENUM (
        'purchase_check',
        'spending_summary',
        'savings_goal',
        'report_summary',
        'general_advice'
    )
    """,
    """
    CREATE TYPE categorytype AS ENUM (
        'income',
        'expense',
        'both'
    )
    """,
    """
    CREATE TYPE notificationplatform AS ENUM (
        'android',
        'ios',
        'web',
        'unknown'
    )
    """,
    """
    CREATE TYPE goalpriority AS ENUM (
        'low',
        'medium',
        'high'
    )
    """,
    """
    CREATE TYPE savingsgoalstatus AS ENUM (
        'active',
        'completed',
        'paused'
    )
    """,
    """
    CREATE TYPE riskstyle AS ENUM (
        'conservative',
        'balanced',
        'aggressive'
    )
    """,
    """
    CREATE TYPE aiadvicetone AS ENUM (
        'supportive',
        'direct',
        'detailed'
    )
    """,
    """
    CREATE TYPE notificationchannel AS ENUM (
        'test',
        'weekly_digest',
        'savings_reminder',
        'promotion'
    )
    """,
    """
    CREATE TYPE transactiontype AS ENUM (
        'income',
        'expense'
    )
    """,
    """
    CREATE TYPE transaction_frequency AS ENUM (
        'once',
        'hourly',
        'daily',
        'monthly',
        'yearly'
    )
    """,
]


TABLE_SQL = [
    """
    CREATE TABLE users (
        email VARCHAR(255) NOT NULL,
        hashed_password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        phone VARCHAR(30),
        profile_image_url VARCHAR(500),
        profile_image_storage_key VARCHAR(500),
        currency VARCHAR(3) NOT NULL,
        country VARCHAR(100),
        is_active BOOLEAN NOT NULL,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_users PRIMARY KEY (id)
    )
    """,
    "CREATE UNIQUE INDEX ix_users_email ON users (email)",
    """
    CREATE TABLE ai_advice_logs (
        user_id UUID NOT NULL,
        question TEXT NOT NULL,
        context_type aicontexttype NOT NULL,
        response TEXT NOT NULL,
        provider VARCHAR(50),
        model_name VARCHAR(100),
        request_metadata JSON,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_ai_advice_logs PRIMARY KEY (id),
        CONSTRAINT fk_ai_advice_logs_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX ix_ai_advice_logs_user_id ON ai_advice_logs (user_id)",
    """
    CREATE TABLE categories (
        user_id UUID,
        name VARCHAR(100) NOT NULL,
        type categorytype NOT NULL,
        color VARCHAR(20),
        icon VARCHAR(100),
        is_default BOOLEAN NOT NULL,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_categories PRIMARY KEY (id),
        CONSTRAINT fk_categories_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE SET NULL
    )
    """,
    "CREATE INDEX ix_categories_name ON categories (name)",
    "CREATE INDEX ix_categories_user_id ON categories (user_id)",
    """
    CREATE TABLE import_batches (
        user_id UUID NOT NULL,
        source_name VARCHAR(255),
        original_parsed_count INTEGER NOT NULL,
        requested_count INTEGER NOT NULL,
        imported_count INTEGER NOT NULL,
        ignored_count INTEGER NOT NULL,
        skipped_duplicate_count INTEGER NOT NULL,
        transaction_date_from DATE,
        transaction_date_to DATE,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_import_batches PRIMARY KEY (id),
        CONSTRAINT fk_import_batches_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX ix_import_batches_user_id ON import_batches (user_id)",
    """
    CREATE TABLE notification_devices (
        user_id UUID NOT NULL,
        expo_push_token VARCHAR(255) NOT NULL,
        platform notificationplatform NOT NULL,
        device_name VARCHAR(120),
        app_build VARCHAR(40),
        push_enabled BOOLEAN NOT NULL,
        is_active BOOLEAN NOT NULL,
        last_registered_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        last_notified_at TIMESTAMPTZ,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_notification_devices PRIMARY KEY (id),
        CONSTRAINT uq_notification_devices_expo_push_token UNIQUE (expo_push_token),
        CONSTRAINT fk_notification_devices_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX ix_notification_devices_user_id ON notification_devices (user_id)",
    """
    CREATE TABLE password_reset_tokens (
        user_id UUID NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_password_reset_tokens PRIMARY KEY (id),
        CONSTRAINT fk_password_reset_tokens_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT uq_password_reset_tokens_token_hash UNIQUE (token_hash)
    )
    """,
    "CREATE INDEX ix_password_reset_tokens_user_id ON password_reset_tokens (user_id)",
    """
    CREATE TABLE savings_goals (
        user_id UUID NOT NULL,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        target_amount NUMERIC(12, 2) NOT NULL,
        current_amount NUMERIC(12, 2) NOT NULL,
        target_date DATE,
        priority goalpriority NOT NULL,
        status savingsgoalstatus NOT NULL,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_savings_goals PRIMARY KEY (id),
        CONSTRAINT ck_savings_goals_target_amount_positive CHECK (target_amount > 0),
        CONSTRAINT ck_savings_goals_current_amount_non_negative CHECK (current_amount >= 0),
        CONSTRAINT fk_savings_goals_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX ix_savings_goals_user_id ON savings_goals (user_id)",
    """
    CREATE TABLE user_preferences (
        user_id UUID NOT NULL,
        monthly_income_expected NUMERIC(12, 2),
        monthly_savings_target NUMERIC(12, 2),
        risk_style riskstyle,
        preferred_ai_tone aiadvicetone,
        month_start_day INTEGER NOT NULL,
        ai_suggestions_enabled BOOLEAN NOT NULL,
        weekly_digest_enabled BOOLEAN NOT NULL,
        savings_reminders_enabled BOOLEAN NOT NULL,
        promotions_enabled BOOLEAN NOT NULL,
        biometric_enabled BOOLEAN NOT NULL,
        appearance VARCHAR(20) NOT NULL,
        language VARCHAR(20) NOT NULL,
        notifications_enabled BOOLEAN NOT NULL,
        default_currency VARCHAR(3),
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_user_preferences PRIMARY KEY (id),
        CONSTRAINT uq_user_preferences_user_id UNIQUE (user_id),
        CONSTRAINT fk_user_preferences_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE user_sessions (
        user_id UUID NOT NULL,
        refresh_token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_user_sessions PRIMARY KEY (id),
        CONSTRAINT fk_user_sessions_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT uq_user_sessions_refresh_token_hash UNIQUE (refresh_token_hash)
    )
    """,
    "CREATE INDEX ix_user_sessions_user_id ON user_sessions (user_id)",
    """
    CREATE TABLE notification_delivery_logs (
        user_id UUID NOT NULL,
        device_id UUID,
        channel notificationchannel NOT NULL,
        title VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(20) NOT NULL,
        provider VARCHAR(40) NOT NULL,
        provider_ticket_id VARCHAR(120),
        error_message TEXT,
        payload_data JSON,
        provider_response JSON,
        sent_at TIMESTAMPTZ NOT NULL,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_notification_delivery_logs PRIMARY KEY (id),
        CONSTRAINT fk_notification_delivery_logs_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_notification_delivery_logs_device_id_notification_devices FOREIGN KEY(device_id) REFERENCES notification_devices (id) ON DELETE SET NULL
    )
    """,
    "CREATE INDEX ix_notification_delivery_logs_device_id ON notification_delivery_logs (device_id)",
    "CREATE INDEX ix_notification_delivery_logs_user_id ON notification_delivery_logs (user_id)",
    """
    CREATE TABLE transactions (
        user_id UUID NOT NULL,
        type transactiontype NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        income_frequency transaction_frequency,
        hours_per_day NUMERIC(5, 2),
        days_per_week NUMERIC(5, 2),
        category_id UUID,
        title VARCHAR(120) NOT NULL,
        note TEXT,
        transaction_date DATE NOT NULL,
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_transactions PRIMARY KEY (id),
        CONSTRAINT ck_transactions_amount_positive CHECK (amount > 0),
        CONSTRAINT fk_transactions_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_transactions_category_id_categories FOREIGN KEY(category_id) REFERENCES categories (id) ON DELETE SET NULL
    )
    """,
    "CREATE INDEX ix_transactions_category_id ON transactions (category_id)",
    "CREATE INDEX ix_transactions_transaction_date ON transactions (transaction_date)",
    "CREATE INDEX ix_transactions_user_id ON transactions (user_id)",
    """
    CREATE TABLE user_category_settings (
        user_id UUID NOT NULL,
        category_id UUID NOT NULL,
        display_name VARCHAR(100),
        is_hidden BOOLEAN NOT NULL,
        monthly_budget_limit NUMERIC(12, 2),
        id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
        CONSTRAINT pk_user_category_settings PRIMARY KEY (id),
        CONSTRAINT uq_user_category_settings_user_category UNIQUE (user_id, category_id),
        CONSTRAINT fk_user_category_settings_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_user_category_settings_category_id_categories FOREIGN KEY(category_id) REFERENCES categories (id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX ix_user_category_settings_category_id ON user_category_settings (category_id)",
    "CREATE INDEX ix_user_category_settings_user_id ON user_category_settings (user_id)",
]


DROP_SQL = [
    "DROP TABLE IF EXISTS user_category_settings",
    "DROP TABLE IF EXISTS transactions",
    "DROP TABLE IF EXISTS notification_delivery_logs",
    "DROP TABLE IF EXISTS user_sessions",
    "DROP TABLE IF EXISTS user_preferences",
    "DROP TABLE IF EXISTS savings_goals",
    "DROP TABLE IF EXISTS password_reset_tokens",
    "DROP TABLE IF EXISTS notification_devices",
    "DROP TABLE IF EXISTS import_batches",
    "DROP TABLE IF EXISTS categories",
    "DROP TABLE IF EXISTS ai_advice_logs",
    "DROP TABLE IF EXISTS users",
]


DROP_ENUM_SQL = [
    "DROP TYPE IF EXISTS transaction_frequency",
    "DROP TYPE IF EXISTS transactiontype",
    "DROP TYPE IF EXISTS notificationchannel",
    "DROP TYPE IF EXISTS aiadvicetone",
    "DROP TYPE IF EXISTS riskstyle",
    "DROP TYPE IF EXISTS savingsgoalstatus",
    "DROP TYPE IF EXISTS goalpriority",
    "DROP TYPE IF EXISTS notificationplatform",
    "DROP TYPE IF EXISTS categorytype",
    "DROP TYPE IF EXISTS aicontexttype",
]


def upgrade() -> None:
    for statement in ENUM_SQL:
        op.execute(statement)
    for statement in TABLE_SQL:
        op.execute(statement)


def downgrade() -> None:
    for statement in DROP_SQL:
        op.execute(statement)
    for statement in DROP_ENUM_SQL:
        op.execute(statement)
