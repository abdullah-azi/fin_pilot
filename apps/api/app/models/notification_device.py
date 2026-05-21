import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import NotificationPlatform
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class NotificationDevice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notification_devices"
    __table_args__ = (
        UniqueConstraint("expo_push_token", name="uq_notification_devices_expo_push_token"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    expo_push_token: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[NotificationPlatform] = mapped_column(
        Enum(NotificationPlatform),
        default=NotificationPlatform.UNKNOWN,
        nullable=False,
    )
    device_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    app_build: Mapped[str | None] = mapped_column(String(40), nullable=True)
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="notification_devices")
    delivery_logs = relationship(
        "NotificationDeliveryLog",
        back_populates="device",
        cascade="all, delete-orphan",
    )
