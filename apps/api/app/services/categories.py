from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.enums import CategoryType
from app.models.user_category_setting import UserCategorySetting
from app.schemas.category import CategoryCreate, CategorySettingsUpdate


DEFAULT_CATEGORIES = [
    {"name": "Salary", "type": CategoryType.INCOME, "color": "#157A6E", "icon": "briefcase"},
    {"name": "Freelance", "type": CategoryType.INCOME, "color": "#1F9D6E", "icon": "laptop"},
    {"name": "Investment", "type": CategoryType.INCOME, "color": "#22C55E", "icon": "line-chart"},
    {"name": "Transfers In", "type": CategoryType.INCOME, "color": "#38BDF8", "icon": "arrow-down"},
    {"name": "Other", "type": CategoryType.BOTH, "color": "#7A7A7A", "icon": "ellipsis-h"},
    {"name": "Peer / Family Support", "type": CategoryType.BOTH, "color": "#A78BFA", "icon": "users"},
    {"name": "Food", "type": CategoryType.EXPENSE, "color": "#F3B248", "icon": "utensils"},
    {"name": "Dining / Fast Food", "type": CategoryType.EXPENSE, "color": "#F97316", "icon": "cutlery"},
    {"name": "Groceries", "type": CategoryType.EXPENSE, "color": "#3AA17E", "icon": "shopping-basket"},
    {"name": "Transport", "type": CategoryType.EXPENSE, "color": "#4E8098", "icon": "car"},
    {"name": "Fuel", "type": CategoryType.EXPENSE, "color": "#FB7185", "icon": "tint"},
    {"name": "Cash Withdrawal", "type": CategoryType.EXPENSE, "color": "#F59E0B", "icon": "money"},
    {"name": "Transfers Out", "type": CategoryType.EXPENSE, "color": "#EF4444", "icon": "arrow-up"},
    {"name": "Mobile Top-Up", "type": CategoryType.EXPENSE, "color": "#8B5CF6", "icon": "mobile"},
    {"name": "Bills", "type": CategoryType.EXPENSE, "color": "#F06A63", "icon": "file-text-o"},
    {"name": "Shopping", "type": CategoryType.EXPENSE, "color": "#C8553D", "icon": "shopping-bag"},
    {"name": "Health", "type": CategoryType.EXPENSE, "color": "#D95D39", "icon": "heartbeat"},
    {"name": "Pharmacy / Medicine", "type": CategoryType.EXPENSE, "color": "#14B8A6", "icon": "medkit"},
    {"name": "Entertainment", "type": CategoryType.EXPENSE, "color": "#7A8B99", "icon": "film"},
    {"name": "Subscriptions", "type": CategoryType.EXPENSE, "color": "#7C3AED", "icon": "tv"},
    {"name": "Digital Services", "type": CategoryType.EXPENSE, "color": "#6366F1", "icon": "cloud"},
    {"name": "Utilities", "type": CategoryType.EXPENSE, "color": "#F59E0B", "icon": "wrench"},
    {"name": "Clothing", "type": CategoryType.EXPENSE, "color": "#6366F1", "icon": "shopping-bag"},
    {"name": "Education", "type": CategoryType.EXPENSE, "color": "#22C55E", "icon": "book"},
    {"name": "Fines / Government", "type": CategoryType.EXPENSE, "color": "#DC2626", "icon": "gavel"},
]


@dataclass(slots=True)
class CategoryView:
    id: UUID
    user_id: UUID | None
    name: str
    display_name: str | None
    effective_name: str
    type: CategoryType
    color: str | None
    icon: str | None
    is_default: bool
    is_hidden: bool
    monthly_budget_limit: Decimal | None
    is_custom: bool
    created_at: datetime
    updated_at: datetime


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


def list_categories(db: Session, user_id: UUID, *, include_hidden: bool = False) -> list[CategoryView]:
    rows = _fetch_category_rows(db, user_id=user_id, include_hidden=include_hidden)
    return [_map_category_row(category, setting) for category, setting in rows]


def create_category(db: Session, user_id: UUID, payload: CategoryCreate) -> Category:
    existing = db.scalar(
        select(Category).where(
            Category.user_id == user_id,
            func.lower(Category.name) == payload.name.strip().lower(),
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A custom category with this name already exists.",
        )

    category = Category(
        user_id=user_id,
        name=payload.name.strip(),
        type=payload.type,
        color=payload.color,
        icon=payload.icon,
        is_default=False,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category_settings(
    db: Session,
    user_id: UUID,
    category_id: UUID,
    payload: CategorySettingsUpdate,
) -> CategoryView:
    category = get_accessible_category(db, user_id, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found.",
        )

    setting = db.scalar(
        select(UserCategorySetting).where(
            UserCategorySetting.user_id == user_id,
            UserCategorySetting.category_id == category_id,
        )
    )
    if setting is None:
        setting = UserCategorySetting(user_id=user_id, category_id=category_id)
        db.add(setting)

    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(setting, field_name, value)

    db.commit()
    return get_category_view(db, user_id=user_id, category_id=category_id)


def delete_category(db: Session, user_id: UUID, category_id: UUID) -> None:
    category = db.scalar(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == user_id,
        )
    )
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom category not found.",
        )

    db.delete(category)
    db.commit()


def get_category_view(db: Session, *, user_id: UUID, category_id: UUID) -> CategoryView:
    row = db.execute(
        _category_statement(user_id=user_id).where(Category.id == category_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found.",
        )
    category, setting = row
    return _map_category_row(category, setting)


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


def category_name_expression(user_id: UUID):
    return func.coalesce(UserCategorySetting.display_name, Category.name)


def _fetch_category_rows(db: Session, *, user_id: UUID, include_hidden: bool):
    statement = _category_statement(user_id=user_id)
    if not include_hidden:
        statement = statement.where(
            or_(UserCategorySetting.is_hidden.is_(None), UserCategorySetting.is_hidden.is_(False))
        )

    statement = statement.order_by(Category.is_default.desc(), category_name_expression(user_id).asc())
    return db.execute(statement).all()


def _category_statement(*, user_id: UUID):
    return (
        select(Category, UserCategorySetting)
        .outerjoin(
            UserCategorySetting,
            and_(
                UserCategorySetting.category_id == Category.id,
                UserCategorySetting.user_id == user_id,
            ),
        )
        .where(or_(Category.user_id.is_(None), Category.user_id == user_id))
    )


def _map_category_row(category: Category, setting: UserCategorySetting | None) -> CategoryView:
    display_name = setting.display_name if setting else None
    return CategoryView(
        id=category.id,
        user_id=category.user_id,
        name=category.name,
        display_name=display_name,
        effective_name=display_name or category.name,
        type=category.type,
        color=category.color,
        icon=category.icon,
        is_default=category.is_default,
        is_hidden=setting.is_hidden if setting else False,
        monthly_budget_limit=setting.monthly_budget_limit if setting else None,
        is_custom=category.user_id is not None,
        created_at=category.created_at,
        updated_at=setting.updated_at if setting else category.updated_at,
    )
