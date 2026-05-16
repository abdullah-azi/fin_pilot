from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.ai_advice_log import AIAdviceLog
from app.models.enums import AIContextType
from app.services.ai.provider import AICompletionResult


def log_ai_advice(
    db: Session,
    *,
    user_id: UUID,
    question: str,
    context_type: AIContextType,
    result: AICompletionResult,
    request_metadata: dict[str, Any] | None = None,
) -> AIAdviceLog:
    merged_metadata = dict(result.request_metadata or {})
    if request_metadata:
        merged_metadata.update(request_metadata)

    log = AIAdviceLog(
        user_id=user_id,
        question=question,
        context_type=context_type,
        response=result.text,
        provider=result.provider,
        model_name=result.model_name,
        request_metadata=merged_metadata or None,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
