from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine
from app.models import register_models


def create_schema() -> None:
    register_models()
    Base.metadata.create_all(bind=engine)
    _sync_transaction_frequency_schema()


def _sync_transaction_frequency_schema() -> None:
    with engine.begin() as connection:
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


if __name__ == "__main__":
    create_schema()
