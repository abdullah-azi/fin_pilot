from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.bootstrap import create_schema
from app.db.session import SessionLocal
from app.main import app
from app.models import register_models


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def reset_database() -> Generator[None, None, None]:
    register_models()
    create_schema()

    with SessionLocal() as db:
        _clear_tables(db)

    yield

    with SessionLocal() as db:
        _clear_tables(db)


def _clear_tables(db: Session) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(delete(table))
    db.commit()
