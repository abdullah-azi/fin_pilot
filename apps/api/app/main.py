from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from app.api.router import api_router
from app.core.config import settings
from app.db.bootstrap import create_schema
from app.models import register_models
from app.services.storage import get_local_storage_root, get_storage_backend


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_storage_backend().ensure_ready()
    if settings.app_env != "production":
        try:
            create_schema()
        except OperationalError as exc:
            raise RuntimeError(
                "Database unavailable during startup. "
                f"Could not connect to {settings.database_url!r} within "
                f"{settings.database_connect_timeout_seconds} seconds. "
                "Start Postgres or correct DATABASE_URL, then retry."
            ) from exc
    yield


def create_application() -> FastAPI:
    register_models()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, str]:
        return {
            "app": settings.app_name,
            "message": "FinPilot API is running.",
        }

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    if settings.storage_backend == "local":
        local_mount_directory = get_local_storage_root()
        local_mount_directory.mkdir(parents=True, exist_ok=True)
        app.mount("/uploads", StaticFiles(directory=local_mount_directory), name="uploads")
    return app


app = create_application()
