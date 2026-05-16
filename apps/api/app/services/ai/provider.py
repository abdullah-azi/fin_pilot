from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(slots=True)
class AICompletionResult:
    text: str
    provider: str
    model_name: str
    request_metadata: dict[str, Any] | None = None


class AIProvider(Protocol):
    async def generate_finance_guidance(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        response_format: dict[str, Any] | None = None,
    ) -> AICompletionResult:
        ...
