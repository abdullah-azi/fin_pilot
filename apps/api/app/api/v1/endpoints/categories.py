from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.category import CategoryResponse, CategorySeedResponse
from app.services.categories import list_categories, seed_default_categories

router = APIRouter()


@router.get("/", response_model=list[CategoryResponse])
async def categories_index(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CategoryResponse]:
    return list_categories(db, current_user.id)


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
