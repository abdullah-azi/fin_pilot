from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate
from app.services.users import delete_user, get_user_or_404, update_user

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def users_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return get_user_or_404(db, current_user.id)


@router.patch("/me", response_model=UserResponse)
async def users_update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return update_user(db, current_user.id, payload)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def users_delete_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    delete_user(db, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
