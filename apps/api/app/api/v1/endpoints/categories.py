from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.category import (
    CategoryCreate,
    CategoryResponse,
    CategorySeedResponse,
    CategorySettingsUpdate,
)
from app.services.categories import (
    create_category,
    delete_category,
    get_category_view,
    list_categories,
    seed_default_categories,
    update_category_settings,
)

router = APIRouter()


@router.get("/", response_model=list[CategoryResponse])
async def categories_index(
    include_hidden: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CategoryResponse]:
    return list_categories(db, current_user.id, include_hidden=include_hidden)


@router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def categories_create(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryResponse:
    category = create_category(db, current_user.id, payload)
    return get_category_view(db, user_id=current_user.id, category_id=category.id)


@router.post("/seed-defaults", response_model=CategorySeedResponse, status_code=status.HTTP_201_CREATED)
async def categories_seed_defaults(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategorySeedResponse:
    created_count, skipped_count = seed_default_categories(db)
    return CategorySeedResponse(
        created_count=created_count,
        skipped_count=skipped_count,
        scope="default",
    )


@router.patch("/{category_id}/settings", response_model=CategoryResponse)
async def categories_update_settings(
    category_id: UUID,
    payload: CategorySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryResponse:
    return update_category_settings(db, current_user.id, category_id, payload)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def categories_delete(
    category_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    delete_category(db, current_user.id, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
