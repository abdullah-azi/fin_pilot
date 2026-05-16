import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class UserCategorySetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_category_settings"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", name="uq_user_category_settings_user_category"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    monthly_budget_limit: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    user = relationship("User", back_populates="category_settings")
    category = relationship("Category", back_populates="user_settings")
