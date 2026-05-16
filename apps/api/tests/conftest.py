from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_db
from app.core.config import settings
from app.db.base import Base
from app.db.bootstrap import create_schema
from app.main import app
from app.models import register_models


TEST_DATABASE_URL = settings.test_database_url


def _assert_safe_test_database(database_url: str) -> None:
    url = make_url(database_url)
    database_name = url.database or ""
    if database_name in {"", "finpilot"}:
        raise RuntimeError(
            "Unsafe test database configuration. TEST_DATABASE_URL must not point to the "
            "development database."
        )


def _ensure_test_database_exists(database_url: str) -> None:
    url = make_url(database_url)
    database_name = url.database or ""
    if not database_name.replace("_", "").isalnum():
        raise RuntimeError("TEST_DATABASE_URL contains an unsupported database name.")

    admin_engine = create_engine(
        url.set(database="postgres"),
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
    )
    try:
        with admin_engine.connect() as connection:
            exists = connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
                {"database_name": database_name},
            )
            if not exists:
                connection.execute(text(f'CREATE DATABASE "{database_name}"'))
    finally:
        admin_engine.dispose()


_assert_safe_test_database(TEST_DATABASE_URL)
_ensure_test_database_exists(TEST_DATABASE_URL)

test_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
TestSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
)


def _override_get_db() -> Generator[Session, None, None]:
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.clear()


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    with TestSessionLocal() as db:
        yield db


@pytest.fixture
def reset_database() -> Generator[None, None, None]:
    register_models()
    create_schema(bind_engine=test_engine)

    with TestSessionLocal() as db:
        _clear_tables(db)

    yield

    with TestSessionLocal() as db:
        _clear_tables(db)


def _clear_tables(db: Session) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(delete(table))
    db.commit()
