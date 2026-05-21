import secrets
from logging import getLogger
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.security import create_token, decode_token, hash_password, hash_token, verify_password
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TokenPair,
)
from app.schemas.user import UserCreate
from app.services.categories import seed_default_categories
from app.services.email import send_password_reset_email
from app.services.users import create_user, get_user_or_404, normalize_email

logger = getLogger(__name__)


@dataclass
class AuthResult:
    user: User
    token_pair: TokenPair


@dataclass
class ForgotPasswordResult:
    status: str
    reset_token: str | None = None
    expires_in_seconds: int | None = None


def signup(db: Session, payload: UserCreate) -> AuthResult:
    seed_default_categories(db)
    user = create_user(db, payload)
    return _issue_session_tokens(db, user)


def login(db: Session, payload: LoginRequest) -> AuthResult:
    normalized_email = normalize_email(str(payload.email))
    user = db.scalar(
        select(User).options(selectinload(User.preferences)).where(User.email == normalized_email)
    )
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )
    return _issue_session_tokens(db, user)


def refresh_tokens(db: Session, payload: RefreshRequest) -> AuthResult:
    try:
        token_payload = decode_token(
            payload.refresh_token,
            secret_key=settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        ) from exc

    if token_payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required.",
        )

    user_id = UUID(token_payload["sub"])
    session_id = UUID(token_payload["sid"])
    session = db.scalar(select(UserSession).where(UserSession.id == session_id))
    if not session or session.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh session is not active.",
        )

    if session.refresh_token_hash != hash_token(payload.refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token does not match the active session.",
        )

    if session.expires_at <= datetime.now(UTC):
        session.revoked_at = datetime.now(UTC)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired.",
        )

    session.revoked_at = datetime.now(UTC)
    db.commit()

    user = get_user_or_404(db, user_id)
    return _issue_session_tokens(db, user)


def logout(db: Session, session_id: UUID) -> None:
    session = db.scalar(select(UserSession).where(UserSession.id == session_id))
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        db.commit()


def forgot_password(db: Session, payload: ForgotPasswordRequest) -> ForgotPasswordResult:
    normalized_email = normalize_email(str(payload.email))
    user = db.scalar(select(User).where(User.email == normalized_email))
    expires_in_seconds = settings.password_reset_token_expire_minutes * 60

    if not user or not user.is_active:
        return ForgotPasswordResult(
            status="password_reset_requested",
            reset_token=None,
            expires_in_seconds=expires_in_seconds,
        )

    now = datetime.now(UTC)
    active_tokens = db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    ).scalars().all()
    for token in active_tokens:
        token.used_at = now

    raw_token = secrets.token_urlsafe(32)
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=now + timedelta(minutes=settings.password_reset_token_expire_minutes),
    )
    db.add(reset_token)
    db.commit()

    if settings.resend_enabled:
        try:
            send_password_reset_email(
                to_email=user.email,
                reset_token=raw_token,
                expires_in_seconds=expires_in_seconds,
            )
        except HTTPException:
            if settings.app_env == "production":
                raise
            logger.warning("Password reset email delivery failed in %s mode.", settings.app_env)

    return ForgotPasswordResult(
        status="password_reset_requested",
        reset_token=raw_token if settings.app_env != "production" else None,
        expires_in_seconds=expires_in_seconds,
    )


def reset_password(db: Session, payload: ResetPasswordRequest) -> ResetPasswordResponse:
    reset_token = db.scalar(
        select(PasswordResetToken)
        .options(selectinload(PasswordResetToken.user))
        .where(PasswordResetToken.token_hash == hash_token(payload.token))
    )
    if not reset_token or reset_token.used_at is not None or reset_token.expires_at <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )

    user = reset_token.user
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset is not available for this account.",
        )

    now = datetime.now(UTC)
    user.hashed_password = hash_password(payload.new_password)
    reset_token.used_at = now

    active_sessions = db.execute(
        select(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
        )
    ).scalars().all()
    for session in active_sessions:
        session.revoked_at = now

    db.commit()
    return ResetPasswordResponse(status="password_reset")


def _issue_session_tokens(db: Session, user: User) -> AuthResult:
    now = datetime.now(UTC)
    access_expires = timedelta(minutes=settings.access_token_expire_minutes)
    refresh_expires = timedelta(days=settings.refresh_token_expire_days)

    session = UserSession(
        user_id=user.id,
        refresh_token_hash="pending",
        expires_at=now + refresh_expires,
    )
    db.add(session)
    db.flush()

    access_token = create_token(
        secret_key=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        subject=str(user.id),
        token_type="access",
        session_id=str(session.id),
        expires_delta=access_expires,
    )
    refresh_token = create_token(
        secret_key=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        subject=str(user.id),
        token_type="refresh",
        session_id=str(session.id),
        expires_delta=refresh_expires,
    )

    session.refresh_token_hash = hash_token(refresh_token)
    db.commit()

    refreshed_user = get_user_or_404(db, user.id)
    token_pair = TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        access_token_expires_in=int(access_expires.total_seconds()),
        refresh_token_expires_in=int(refresh_expires.total_seconds()),
    )
    return AuthResult(user=refreshed_user, token_pair=token_pair)
