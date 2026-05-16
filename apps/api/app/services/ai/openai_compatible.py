from typing import Any

import httpx

from app.core.config import settings
from app.services.ai.provider import AICompletionResult, AIProvider


class OpenAICompatibleProvider(AIProvider):
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model_name: str,
        provider_name: str,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.provider_name = provider_name
        self.timeout_seconds = timeout_seconds

    async def generate_finance_guidance(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        response_format: dict[str, Any] | None = None,
    ) -> AICompletionResult:
        payload = self._build_payload(
            messages=messages,
            temperature=temperature,
            response_format=response_format,
        )

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            body = response.json()

        text = extract_openai_compatible_text(body)
        return AICompletionResult(
            text=text,
            provider=self.provider_name,
            model_name=self.model_name,
            request_metadata={
                "endpoint": "chat/completions",
                "temperature": temperature,
                "message_count": len(messages),
                "response_id": body.get("id"),
                "finish_reason": (
                    body.get("choices", [{}])[0].get("finish_reason")
                    if body.get("choices")
                    else None
                ),
            },
        )

    def _build_payload(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float,
        response_format: dict[str, Any] | None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
        }
        if response_format is not None:
            payload["response_format"] = response_format
        return payload


def extract_openai_compatible_text(body: dict[str, Any]) -> str:
    choices = body.get("choices") or []
    if not choices:
        raise ValueError("AI provider response did not include choices.")

    first_choice = choices[0]
    message = first_choice.get("message") or {}
    content = message.get("content")

    if isinstance(content, str) and content.strip():
        return content.strip()

    if isinstance(content, list):
        text_parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                text_parts.append(part["text"])
        text = "\n".join(part for part in text_parts if part.strip()).strip()
        if text:
            return text

    raise ValueError("AI provider response did not include text content.")


def build_default_provider() -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key=settings.active_ai_api_key,
        base_url=settings.ai_base_url,
        model_name=settings.ai_model,
        provider_name=settings.ai_provider,
        timeout_seconds=settings.ai_timeout_seconds,
    )
