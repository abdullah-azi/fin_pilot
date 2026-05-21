from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserResponse


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=8)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_token_expires_in: int
    refresh_token_expires_in: int


class AuthResponse(TokenPair):
    user: UserResponse


class LogoutResponse(BaseModel):
    status: str


class ForgotPasswordResponse(BaseModel):
    status: str
    reset_token: str | None = None
    expires_in_seconds: int | None = None


class ResetPasswordResponse(BaseModel):
    status: str
