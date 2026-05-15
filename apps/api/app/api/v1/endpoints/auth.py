from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, get_current_auth_context, get_db
from app.schemas.auth import AuthResponse, LoginRequest, LogoutResponse, RefreshRequest
from app.schemas.user import UserCreate, UserResponse
from app.services.auth import login, logout, refresh_tokens, signup

router = APIRouter()


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def auth_signup(payload: UserCreate, db: Session = Depends(get_db)) -> AuthResponse:
    result = signup(db, payload)
    return AuthResponse(**result.token_pair.model_dump(), user=result.user)


@router.post("/login", response_model=AuthResponse)
async def auth_login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    result = login(db, payload)
    return AuthResponse(**result.token_pair.model_dump(), user=result.user)


@router.post("/refresh", response_model=AuthResponse)
async def auth_refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> AuthResponse:
    result = refresh_tokens(db, payload)
    return AuthResponse(**result.token_pair.model_dump(), user=result.user)


@router.get("/me", response_model=UserResponse)
async def auth_me(auth: AuthContext = Depends(get_current_auth_context)) -> UserResponse:
    return auth.user


@router.post("/logout", response_model=LogoutResponse)
async def auth_logout(
    auth: AuthContext = Depends(get_current_auth_context),
    db: Session = Depends(get_db),
) -> LogoutResponse:
    logout(db, auth.session.id)
    return LogoutResponse(status="logged_out")
