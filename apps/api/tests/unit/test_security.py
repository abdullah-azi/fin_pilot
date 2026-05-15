from datetime import timedelta

import pytest

from app.core.security import (
    create_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)


def test_password_hash_and_verify_round_trip() -> None:
    password = "supersecure123"

    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_password_hash_is_salted() -> None:
    password = "supersecure123"

    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash != second_hash


def test_hash_token_is_stable() -> None:
    token = "sample-refresh-token"

    assert hash_token(token) == hash_token(token)
    assert hash_token(token) != hash_token("different-token")


def test_create_and_decode_token_round_trip() -> None:
    token = create_token(
        secret_key="a-long-random-secret-key-32chars-minimum",
        algorithm="HS256",
        subject="user-123",
        token_type="access",
        session_id="session-123",
        expires_delta=timedelta(minutes=5),
    )

    payload = decode_token(
        token,
        secret_key="a-long-random-secret-key-32chars-minimum",
        algorithm="HS256",
    )

    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"
    assert payload["sid"] == "session-123"

