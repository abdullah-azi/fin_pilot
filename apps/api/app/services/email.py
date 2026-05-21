from __future__ import annotations

from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


def send_password_reset_email(*, to_email: str, reset_token: str, expires_in_seconds: int) -> None:
    if not settings.resend_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset email delivery is not configured.",
        )

    reset_link = build_password_reset_link(reset_token)
    subject = f"{settings.app_name} password reset"
    html = build_password_reset_email_html(reset_token=reset_token, reset_link=reset_link, expires_in_seconds=expires_in_seconds)
    text = build_password_reset_email_text(reset_token=reset_token, reset_link=reset_link, expires_in_seconds=expires_in_seconds)

    payload: dict[str, object] = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
    }
    if settings.resend_reply_to_email:
        payload["reply_to"] = settings.resend_reply_to_email

    try:
        response = httpx.post(
            f"{settings.resend_base_url}/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Password reset email could not be sent.",
        ) from exc

    if response.status_code >= 400:
        detail = "Password reset email could not be sent."
        try:
            payload = response.json()
            if isinstance(payload, dict):
                message = payload.get("message") or payload.get("error")
                if isinstance(message, str) and message.strip():
                    detail = message
        except ValueError:
            pass

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        )


def build_password_reset_link(reset_token: str) -> str | None:
    if not settings.password_reset_url_base:
        return None

    separator = "&" if "?" in settings.password_reset_url_base else "?"
    return f"{settings.password_reset_url_base}{separator}token={quote(reset_token)}"


def build_password_reset_email_html(*, reset_token: str, reset_link: str | None, expires_in_seconds: int) -> str:
    expiry_minutes = max(1, expires_in_seconds // 60)
    link_block = (
        (
            "<p style=\"margin:20px 0 18px;\">"
            f'<a href="{reset_link}" style="display:inline-block;padding:12px 18px;background:#7C3AED;color:#FFFFFF;text-decoration:none;border-radius:10px;font-weight:700;">Open FinPilot and reset password</a>'
            "</p>"
        )
        if reset_link
        else ""
    )
    link_help_block = (
        f'<p style="margin:0 0 14px;color:#505463;font-size:14px;">If the button does not open the app, copy this link into your device browser:<br /><span style="color:#7C3AED;">{reset_link}</span></p>'
        if reset_link
        else ""
    )
    return (
        "<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#16161A;background:#F7F6FB;padding:24px;\">"
        "<div style=\"max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E0F3;border-radius:18px;padding:28px;\">"
        f'<p style="margin:0 0 10px;color:#7C3AED;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">{settings.app_name}</p>'
        "<h2 style=\"margin:0 0 12px;font-size:24px;line-height:1.2;color:#16161A;\">Reset your password</h2>"
        "<p style=\"margin:0 0 12px;color:#505463;font-size:15px;\">We received a request to reset your password. Open the link below in FinPilot to continue.</p>"
        f"{link_block}"
        f"{link_help_block}"
        "<div style=\"margin:18px 0;padding:14px 16px;background:#F4F0FF;border:1px solid #E6E0F3;border-radius:12px;\">"
        "<p style=\"margin:0 0 8px;color:#505463;font-size:13px;font-weight:700;\">Fallback reset token</p>"
        f'<p style="margin:0;color:#16161A;font-size:14px;word-break:break-all;"><strong>{reset_token}</strong></p>'
        "</div>"
        f"<p style=\"margin:0 0 10px;color:#505463;font-size:14px;\">This reset token expires in {expiry_minutes} minute{'s' if expiry_minutes != 1 else ''}.</p>"
        "<p style=\"margin:0;color:#7A7F90;font-size:13px;\">If you did not request this, you can safely ignore this email.</p>"
        "</div>"
        "</div>"
    )


def build_password_reset_email_text(*, reset_token: str, reset_link: str | None, expires_in_seconds: int) -> str:
    expiry_minutes = max(1, expires_in_seconds // 60)
    lines = [
        f"{settings.app_name} password reset",
        "",
        "We received a request to reset your password.",
        "Use the link below to open FinPilot and continue.",
    ]
    if reset_link:
        lines.extend(["", f"Open FinPilot: {reset_link}"])
    lines.extend(
        [
            "",
            "Fallback reset token:",
            reset_token,
            "",
            f"This token expires in {expiry_minutes} minute{'s' if expiry_minutes != 1 else ''}.",
            "",
            "If you did not request this, you can ignore this email.",
        ]
    )
    return "\n".join(lines)
