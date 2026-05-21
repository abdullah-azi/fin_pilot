import secrets
from typing import cast
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.user import PasswordChangeRequest, UserCreate, UserPreferenceUpdate, UserUpdate
from app.services.storage import get_storage_backend, resolve_storage_key
ALLOWED_PROFILE_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024


def normalize_email(value: str) -> str:
    return value.strip().lower()


def list_users(db: Session) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .options(selectinload(User.preferences))
            .order_by(User.created_at.desc())
        )
    )


def get_user_or_404(db: Session, user_id: UUID) -> User:
    user = db.scalar(
        select(User).options(selectinload(User.preferences)).where(User.id == user_id)
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


def create_user(db: Session, payload: UserCreate) -> User:
    normalized_email = normalize_email(str(payload.email))
    existing = db.scalar(select(User).where(User.email == normalized_email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    user = User(
        email=normalized_email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        currency=payload.currency.upper(),
        country=payload.country,
    )
    db.add(user)
    db.flush()

    if payload.preferences:
        db.add(
            UserPreference(
                user_id=user.id,
                monthly_income_expected=payload.preferences.monthly_income_expected,
                monthly_savings_target=payload.preferences.monthly_savings_target,
                risk_style=payload.preferences.risk_style,
                preferred_ai_tone=payload.preferences.preferred_ai_tone,
                month_start_day=payload.preferences.month_start_day,
                ai_suggestions_enabled=payload.preferences.ai_suggestions_enabled,
                weekly_digest_enabled=payload.preferences.weekly_digest_enabled,
                savings_reminders_enabled=payload.preferences.savings_reminders_enabled,
                promotions_enabled=payload.preferences.promotions_enabled,
                biometric_enabled=payload.preferences.biometric_enabled,
                appearance=payload.preferences.appearance,
                language=payload.preferences.language,
                notifications_enabled=payload.preferences.notifications_enabled,
                default_currency=(
                    payload.preferences.default_currency.upper()
                    if payload.preferences.default_currency
                    else None
                ),
            )
        )

    db.commit()
    return get_user_or_404(db, cast(UUID, user.id))


def update_user(db: Session, user_id: UUID, payload: UserUpdate) -> User:
    user = get_user_or_404(db, user_id)

    if payload.email and normalize_email(str(payload.email)) != user.email:
        normalized_email = normalize_email(str(payload.email))
        existing = db.scalar(select(User).where(User.email == normalized_email, User.id != user_id))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists.",
            )
        user.email = normalized_email

    if payload.password:
        user.hashed_password = hash_password(payload.password)
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.currency is not None:
        user.currency = payload.currency.upper()
    if payload.country is not None:
        user.country = payload.country
    if payload.is_active is not None:
        user.is_active = payload.is_active

    if payload.preferences is not None:
        _upsert_preferences(user, payload.preferences)

    db.commit()
    return get_user_or_404(db, user_id)


def delete_user(db: Session, user_id: UUID) -> None:
    user = get_user_or_404(db, user_id)
    _delete_profile_image_file(user.profile_image_storage_key, user.profile_image_url)
    db.delete(user)
    db.commit()


def change_password(db: Session, user_id: UUID, payload: PasswordChangeRequest) -> None:
    user = get_user_or_404(db, user_id)

    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )

    user.hashed_password = hash_password(payload.new_password)
    db.commit()


def save_profile_image(
    db: Session,
    user_id: UUID,
    *,
    content_type: str | None,
    file_bytes: bytes,
) -> User:
    user = get_user_or_404(db, user_id)
    storage = get_storage_backend()

    if not content_type or content_type not in ALLOWED_PROFILE_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile image must be a JPG, PNG, or WEBP file.",
        )

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded profile image is empty.",
        )

    if len(file_bytes) > MAX_PROFILE_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile image must be 5 MB or smaller.",
        )

    extension = ALLOWED_PROFILE_IMAGE_TYPES[content_type]
    file_name = f"{user.id}-{secrets.token_hex(8)}{extension}"
    stored_file = storage.save_bytes(
        key=f"profile-images/{file_name}",
        content_type=content_type,
        data=file_bytes,
    )

    _delete_profile_image_file(user.profile_image_storage_key, user.profile_image_url)
    user.profile_image_storage_key = stored_file.key
    user.profile_image_url = stored_file.public_url
    db.commit()
    return get_user_or_404(db, user_id)


def delete_profile_image(db: Session, user_id: UUID) -> User:
    user = get_user_or_404(db, user_id)
    _delete_profile_image_file(user.profile_image_storage_key, user.profile_image_url)
    user.profile_image_storage_key = None
    user.profile_image_url = None
    db.commit()
    return get_user_or_404(db, user_id)


def _upsert_preferences(user: User, payload: UserPreferenceUpdate) -> None:
    preferences = user.preferences
    if preferences is None:
        preferences = UserPreference(user_id=user.id)
        user.preferences = preferences

    updates = payload.model_dump(exclude_unset=True)
    if "default_currency" in updates and updates["default_currency"] is not None:
        updates["default_currency"] = updates["default_currency"].upper()

    for field_name, value in updates.items():
        setattr(preferences, field_name, value)


def _delete_profile_image_file(
    profile_image_storage_key: str | None,
    profile_image_url: str | None,
) -> None:
    storage = get_storage_backend()
    storage_key = resolve_storage_key(
        storage,
        stored_key=profile_image_storage_key,
        public_url=profile_image_url,
    )
    if not storage_key:
        return
    storage.delete(storage_key)
