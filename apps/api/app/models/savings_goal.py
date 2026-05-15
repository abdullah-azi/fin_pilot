import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import GoalPriority, SavingsGoalStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SavingsGoal(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "savings_goals"
    __table_args__ = (
        CheckConstraint("target_amount > 0", name="target_amount_positive"),
        CheckConstraint("current_amount >= 0", name="current_amount_non_negative"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    current_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[GoalPriority] = mapped_column(
        Enum(GoalPriority),
        default=GoalPriority.MEDIUM,
        nullable=False,
    )
    status: Mapped[SavingsGoalStatus] = mapped_column(
        Enum(SavingsGoalStatus),
        default=SavingsGoalStatus.ACTIVE,
        nullable=False,
    )

    user = relationship("User", back_populates="savings_goals")

