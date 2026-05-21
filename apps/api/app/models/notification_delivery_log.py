import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import NotificationChannel
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class NotificationDeliveryLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notification_delivery_logs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notification_devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    channel: Mapped[NotificationChannel] = mapped_column(Enum(NotificationChannel), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, default="expo")
    provider_ticket_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    provider_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="notification_delivery_logs")
    device = relationship("NotificationDevice", back_populates="delivery_logs")
