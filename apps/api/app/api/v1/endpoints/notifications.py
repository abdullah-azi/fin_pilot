from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_notification_service
from app.models.user import User
from app.schemas.notifications import (
    NotificationDeviceActionResponse,
    NotificationDeviceDeactivateRequest,
    NotificationDeviceListResponse,
    NotificationDeviceRegisterRequest,
    NotificationDeviceResponse,
    NotificationSendRequest,
    NotificationSendResponse,
)
from app.services.notifications import (
    NotificationService,
    deactivate_notification_device,
    list_notification_devices,
    register_notification_device,
)

router = APIRouter()


@router.get("/devices", response_model=NotificationDeviceListResponse)
async def notifications_list_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationDeviceListResponse:
    devices = list_notification_devices(db, current_user.id)
    return NotificationDeviceListResponse(items=[NotificationDeviceResponse.model_validate(device) for device in devices])


@router.post("/devices/register", response_model=NotificationDeviceResponse, status_code=status.HTTP_201_CREATED)
async def notifications_register_device(
    payload: NotificationDeviceRegisterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationDeviceResponse:
    device = register_notification_device(
        db,
        user_id=current_user.id,
        expo_push_token=payload.expo_push_token,
        platform=payload.platform,
        device_name=payload.device_name,
        app_build=payload.app_build,
        push_enabled=payload.push_enabled,
    )
    return NotificationDeviceResponse.model_validate(device)


@router.post("/devices/deactivate", response_model=NotificationDeviceActionResponse)
async def notifications_deactivate_device(
    payload: NotificationDeviceDeactivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationDeviceActionResponse:
    deactivate_notification_device(db, user_id=current_user.id, expo_push_token=payload.expo_push_token)
    return NotificationDeviceActionResponse(status="device_deactivated")


@router.post("/test", response_model=NotificationSendResponse)
async def notifications_send_test(
    payload: NotificationSendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service),
) -> NotificationSendResponse:
    result = await notification_service.send_test_notification(
        db,
        user=current_user,
        title=payload.title,
        body=payload.body,
        data=payload.data,
    )
    return NotificationSendResponse(
        status="sent",
        attempted_count=result.attempted_count,
        delivered_count=result.delivered_count,
        failed_count=result.failed_count,
        channel=result.channel,
    )


@router.post("/weekly-digest", response_model=NotificationSendResponse)
async def notifications_send_weekly_digest(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service),
) -> NotificationSendResponse:
    result = await notification_service.send_weekly_digest(db, user=current_user)
    return NotificationSendResponse(
        status="sent",
        attempted_count=result.attempted_count,
        delivered_count=result.delivered_count,
        failed_count=result.failed_count,
        channel=result.channel,
    )


@router.post("/savings-reminder", response_model=NotificationSendResponse)
async def notifications_send_savings_reminder(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    notification_service: NotificationService = Depends(get_notification_service),
) -> NotificationSendResponse:
    result = await notification_service.send_savings_reminder(db, user=current_user)
    return NotificationSendResponse(
        status="sent",
        attempted_count=result.attempted_count,
        delivered_count=result.delivered_count,
        failed_count=result.failed_count,
        channel=result.channel,
    )
