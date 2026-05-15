from app.db.base import Base
from app.db.session import engine
from app.models import register_models


def create_schema() -> None:
    register_models()
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    create_schema()

