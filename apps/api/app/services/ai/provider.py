from typing import Protocol


class AIProvider(Protocol):
    async def generate_finance_guidance(self, prompt: str) -> str:
        ...

