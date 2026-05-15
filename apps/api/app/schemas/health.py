from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    environment: str
    app_name: str


class LiveResponse(BaseModel):
    status: str
    app_name: str


class ReadyResponse(BaseModel):
    status: str
    database: str
    app_name: str
