from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.models import register_models
from app.services.users import UPLOAD_ROOT


def create_application() -> FastAPI:
    register_models()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
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
    UPLOAD_ROOT.parent.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT.parent), name="uploads")
    return app


app = create_application()
