from app.services.email import (
    build_password_reset_email_html,
    build_password_reset_email_text,
    build_password_reset_link,
)


def test_build_password_reset_link_appends_token(monkeypatch) -> None:
    monkeypatch.setattr("app.services.email.settings.password_reset_url_base", "finpilot://reset-password")

    link = build_password_reset_link("abc123")

    assert link == "finpilot://reset-password?token=abc123"


def test_build_password_reset_email_text_includes_token_and_link() -> None:
    body = build_password_reset_email_text(
        reset_token="abc123",
        reset_link="finpilot://reset-password?token=abc123",
        expires_in_seconds=1800,
    )

    assert "abc123" in body
    assert "Open FinPilot: finpilot://reset-password?token=abc123" in body
    assert "30 minutes" in body
    assert "Fallback reset token:" in body


def test_build_password_reset_email_html_includes_branded_cta_and_token() -> None:
    body = build_password_reset_email_html(
        reset_token="abc123",
        reset_link="finpilot://reset-password?token=abc123",
        expires_in_seconds=1800,
    )

    assert "Open FinPilot and reset password" in body
    assert "finpilot://reset-password?token=abc123" in body
    assert "Fallback reset token" in body
    assert "abc123" in body
