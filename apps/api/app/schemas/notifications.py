from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import NotificationChannel, NotificationPlatform


class NotificationDeviceRegisterRequest(BaseModel):
    expo_push_token: str = Field(min_length=8, max_length=255)
    platform: NotificationPlatform = NotificationPlatform.UNKNOWN
    device_name: str | None = Field(default=None, max_length=120)
    app_build: str | None = Field(default=None, max_length=40)
    push_enabled: bool = True


class NotificationDeviceDeactivateRequest(BaseModel):
    expo_push_token: str = Field(min_length=8, max_length=255)


class NotificationDeviceResponse(BaseModel):
    id: UUID
    expo_push_token: str
    platform: NotificationPlatform
    device_name: str | None
    app_build: str | None
    push_enabled: bool
    is_active: bool
    last_registered_at: datetime
    last_notified_at: datetime | None

    model_config = {"from_attributes": True}


class NotificationDeviceListResponse(BaseModel):
    items: list[NotificationDeviceResponse]


class NotificationDeviceActionResponse(BaseModel):
    status: str


class NotificationSendRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    body: str | None = Field(default=None, min_length=1, max_length=500)
    data: dict | None = None


class NotificationSendResponse(BaseModel):
    status: str
    attempted_count: int
    delivered_count: int
    failed_count: int
    channel: NotificationChannel
