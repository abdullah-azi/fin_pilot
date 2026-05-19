from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user import (
    PasswordChangeRequest,
    PasswordChangeResponse,
    ProfileImageDeleteResponse,
    ProfileImageUploadResponse,
    UserResponse,
    UserUpdate,
)
from app.services.users import (
    change_password,
    delete_profile_image,
    delete_user,
    get_user_or_404,
    save_profile_image,
    update_user,
)

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def users_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return get_user_or_404(db, current_user.id)


@router.patch("/me", response_model=UserResponse)
async def users_update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return update_user(db, current_user.id, payload)


@router.post("/me/change-password", response_model=PasswordChangeResponse)
async def users_change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PasswordChangeResponse:
    change_password(db, current_user.id, payload)
    return PasswordChangeResponse(status="password_changed")


@router.post("/me/profile-image", response_model=ProfileImageUploadResponse)
async def users_upload_profile_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileImageUploadResponse:
    file_bytes = await file.read()
    updated = save_profile_image(
        db,
        current_user.id,
        content_type=file.content_type,
        file_bytes=file_bytes,
    )
    return ProfileImageUploadResponse(profile_image_url=updated.profile_image_url or "")


@router.delete("/me/profile-image", response_model=ProfileImageDeleteResponse)
async def users_delete_profile_image(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileImageDeleteResponse:
    delete_profile_image(db, current_user.id)
    return ProfileImageDeleteResponse(status="profile_image_deleted")


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def users_delete_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    delete_user(db, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
