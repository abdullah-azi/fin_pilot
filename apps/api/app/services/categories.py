from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.enums import CategoryType


DEFAULT_CATEGORIES = [
    {"name": "Salary", "type": CategoryType.INCOME, "color": "#157A6E", "icon": "briefcase"},
    {"name": "Freelance", "type": CategoryType.INCOME, "color": "#1F9D6E", "icon": "laptop"},
    {"name": "Food", "type": CategoryType.EXPENSE, "color": "#F3B248", "icon": "utensils"},
    {"name": "Groceries", "type": CategoryType.EXPENSE, "color": "#3AA17E", "icon": "shopping-basket"},
    {"name": "Transport", "type": CategoryType.EXPENSE, "color": "#4E8098", "icon": "car"},
    {"name": "Bills", "type": CategoryType.EXPENSE, "color": "#F06A63", "icon": "file-text-o"},
    {"name": "Shopping", "type": CategoryType.EXPENSE, "color": "#C8553D", "icon": "shopping-bag"},
    {"name": "Health", "type": CategoryType.EXPENSE, "color": "#D95D39", "icon": "heartbeat"},
    {"name": "Entertainment", "type": CategoryType.EXPENSE, "color": "#7A8B99", "icon": "film"},
]


def seed_default_categories(db: Session) -> tuple[int, int]:
    created_count = 0
    skipped_count = 0

    for item in DEFAULT_CATEGORIES:
        existing = db.scalar(
            select(Category).where(
                Category.user_id.is_(None),
                Category.name == item["name"],
                Category.type == item["type"],
            )
        )
        if existing:
            skipped_count += 1
            continue

        db.add(
            Category(
                user_id=None,
                name=item["name"],
                type=item["type"],
                color=item["color"],
                icon=item["icon"],
                is_default=True,
            )
        )
        created_count += 1

    db.commit()
    return created_count, skipped_count


def list_categories(db: Session, user_id: UUID | None = None) -> list[Category]:
    statement = select(Category).order_by(Category.is_default.desc(), Category.name.asc())

    if user_id:
        statement = statement.where(
            or_(Category.user_id.is_(None), Category.user_id == user_id)
        )
    else:
        statement = statement.where(Category.user_id.is_(None))

    return list(db.scalars(statement))


def get_accessible_category(
    db: Session,
    user_id: UUID,
    category_id: UUID,
) -> Category | None:
    return db.scalar(
        select(Category).where(
            Category.id == category_id,
            or_(Category.user_id.is_(None), Category.user_id == user_id),
        )
    )
