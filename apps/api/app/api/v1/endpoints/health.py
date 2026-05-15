from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.schemas.health import HealthResponse, LiveResponse, ReadyResponse

router = APIRouter()


@router.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        environment=settings.app_env,
        app_name=settings.app_name,
    )


@router.get("/live", response_model=LiveResponse)
async def live_check() -> LiveResponse:
    return LiveResponse(
        status="alive",
        app_name=settings.app_name,
    )


@router.get("/ready", response_model=ReadyResponse)
async def ready_check() -> ReadyResponse:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not ready.",
        ) from exc

    return ReadyResponse(
        status="ready",
        database="up",
        app_name=settings.app_name,
    )
