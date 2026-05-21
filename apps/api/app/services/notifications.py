from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.enums import NotificationChannel
from app.models.notification_delivery_log import NotificationDeliveryLog
from app.models.notification_device import NotificationDevice
from app.models.user import User
from app.services.dashboard import build_dashboard_summary
from app.services.savings_goals import build_goal_summary


@dataclass(slots=True)
class NotificationSendResult:
    attempted_count: int
    delivered_count: int
    failed_count: int
    channel: NotificationChannel


@dataclass(slots=True)
class ExpoPushTicket:
    status: str
    ticket_id: str | None
    message: str | None
    details: dict | None


class ExpoPushClient:
    async def send(self, messages: list[dict]) -> list[ExpoPushTicket]:
        if not messages:
            return []

        async with httpx.AsyncClient(timeout=settings.expo_push_timeout_seconds) as client:
            response = await client.post(
                settings.expo_push_base_url,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            payload = response.json()

        return [
            ExpoPushTicket(
                status=item.get("status", "error"),
                ticket_id=item.get("id"),
                message=item.get("message"),
                details=item.get("details"),
            )
            for item in payload.get("data", [])
        ]


class NotificationService:
    def __init__(self, client: ExpoPushClient | None = None):
        self.client = client or ExpoPushClient()

    async def send_test_notification(
        self,
        db: Session,
        *,
        user: User,
        title: str | None,
        body: str | None,
        data: dict | None = None,
    ) -> NotificationSendResult:
        return await self._send_to_user(
            db,
            user=user,
            channel=NotificationChannel.TEST,
            title=title or "FinPilot test notification",
            body=body or "Push notifications are connected for your FinPilot account.",
            data=data or {"kind": "test"},
            require_global_notifications=True,
        )

    async def send_weekly_digest(self, db: Session, *, user: User) -> NotificationSendResult:
        if not user.preferences or not user.preferences.weekly_digest_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Weekly digest notifications are disabled.",
            )

        dashboard = build_dashboard_summary(db, user.id)
        return await self._send_to_user(
            db,
            user=user,
            channel=NotificationChannel.WEEKLY_DIGEST,
            title=f"Your {dashboard.month_label} money snapshot",
            body=(
                f"Net {dashboard.summary.net}. Income {dashboard.summary.total_income}, "
                f"spent {dashboard.summary.total_expense}. {dashboard.insight}"
            ),
            data={"kind": "weekly_digest"},
            require_global_notifications=True,
        )

    async def send_savings_reminder(self, db: Session, *, user: User) -> NotificationSendResult:
        if not user.preferences or not user.preferences.savings_reminders_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Savings reminders are disabled.",
            )

        summary = build_goal_summary(db, user.id)
        if not summary.goals:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active savings goals found.",
            )

        focus_goal = next((goal for goal in summary.goals if goal.pace_status != "on_track"), summary.goals[0])
        return await self._send_to_user(
            db,
            user=user,
            channel=NotificationChannel.SAVINGS_REMINDER,
            title=f"Savings reminder: {focus_goal.name}",
            body=(
                f"You need about {focus_goal.monthly_required}/month for {focus_goal.name}. "
                f"Status: {focus_goal.pace_label.lower()}."
            ),
            data={"kind": "savings_reminder", "goal_id": str(focus_goal.goal_id)},
            require_global_notifications=True,
        )

    async def _send_to_user(
        self,
        db: Session,
        *,
        user: User,
        channel: NotificationChannel,
        title: str,
        body: str,
        data: dict | None,
        require_global_notifications: bool,
    ) -> NotificationSendResult:
        if require_global_notifications and user.preferences and not user.preferences.notifications_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Notifications are disabled for this account.",
            )

        devices = list_active_notification_devices(db, user.id)
        if not devices:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active notification devices are registered.",
            )

        messages = [
            {
                "to": device.expo_push_token,
                "sound": "default",
                "title": title,
                "body": body,
                "data": {
                    "channel": channel.value,
                    **(data or {}),
                },
            }
            for device in devices
        ]

        tickets = await self.client.send(messages)
        now = datetime.now(UTC)
        delivered_count = 0
        failed_count = 0

        for index, device in enumerate(devices):
            ticket = tickets[index] if index < len(tickets) else ExpoPushTicket(
                status="error",
                ticket_id=None,
                message="No ticket was returned by the push provider.",
                details=None,
            )
            success = ticket.status == "ok"
            if success:
                delivered_count += 1
                device.last_notified_at = now
            else:
                failed_count += 1
                details = ticket.details or {}
                if details.get("error") == "DeviceNotRegistered":
                    device.is_active = False

            db.add(
                NotificationDeliveryLog(
                    user_id=user.id,
                    device_id=device.id,
                    channel=channel,
                    title=title,
                    body=body,
                    status="sent" if success else "failed",
                    provider="expo",
                    provider_ticket_id=ticket.ticket_id,
                    error_message=ticket.message,
                    payload_data=data,
                    provider_response={
                        "status": ticket.status,
                        "details": ticket.details,
                        "message": ticket.message,
                    },
                    sent_at=now,
                )
            )

        db.commit()
        return NotificationSendResult(
            attempted_count=len(devices),
            delivered_count=delivered_count,
            failed_count=failed_count,
            channel=channel,
        )


def list_notification_devices(db: Session, user_id: UUID) -> list[NotificationDevice]:
    return list(
        db.scalars(
            select(NotificationDevice)
            .where(NotificationDevice.user_id == user_id)
            .order_by(NotificationDevice.last_registered_at.desc())
        )
    )


def list_active_notification_devices(db: Session, user_id: UUID) -> list[NotificationDevice]:
    return list(
        db.scalars(
            select(NotificationDevice).where(
                NotificationDevice.user_id == user_id,
                NotificationDevice.is_active.is_(True),
                NotificationDevice.push_enabled.is_(True),
            )
        )
    )


def register_notification_device(
    db: Session,
    *,
    user_id: UUID,
    expo_push_token: str,
    platform,
    device_name: str | None,
    app_build: str | None,
    push_enabled: bool,
) -> NotificationDevice:
    existing = db.scalar(
        select(NotificationDevice).where(NotificationDevice.expo_push_token == expo_push_token)
    )
    now = datetime.now(UTC)

    if existing:
        existing.user_id = user_id
        existing.platform = platform
        existing.device_name = device_name
        existing.app_build = app_build
        existing.push_enabled = push_enabled
        existing.is_active = True
        existing.last_registered_at = now
        db.commit()
        db.refresh(existing)
        return existing

    device = NotificationDevice(
        user_id=user_id,
        expo_push_token=expo_push_token,
        platform=platform,
        device_name=device_name,
        app_build=app_build,
        push_enabled=push_enabled,
        is_active=True,
        last_registered_at=now,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def deactivate_notification_device(db: Session, *, user_id: UUID, expo_push_token: str) -> None:
    device = db.scalar(
        select(NotificationDevice).where(
            NotificationDevice.user_id == user_id,
            NotificationDevice.expo_push_token == expo_push_token,
        )
    )
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification device not found.",
        )

    device.is_active = False
    db.commit()
