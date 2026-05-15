import uuid

from sqlalchemy import Enum, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AIContextType
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AIAdviceLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_advice_logs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    context_type: Mapped[AIContextType] = mapped_column(Enum(AIContextType), nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    request_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    user = relationship("User", back_populates="ai_advice_logs")

