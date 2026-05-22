import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AIAdviceTone, RiskStyle, db_enum
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class UserPreference(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    monthly_income_expected: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    monthly_savings_target: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    risk_style: Mapped[RiskStyle | None] = mapped_column(db_enum(RiskStyle, name="riskstyle"), nullable=True)
    preferred_ai_tone: Mapped[AIAdviceTone | None] = mapped_column(
        db_enum(AIAdviceTone, name="aiadvicetone"),
        nullable=True,
    )
    month_start_day: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    ai_suggestions_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    weekly_digest_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    savings_reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    promotions_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    biometric_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    appearance: Mapped[str] = mapped_column(String(20), default="dark", nullable=False)
    language: Mapped[str] = mapped_column(String(20), default="English", nullable=False)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    default_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    user = relationship("User", back_populates="preferences")
