from fastapi import APIRouter

router = APIRouter()


@router.get("/summary")
async def insights_summary() -> dict[str, object]:
    return {
        "status": "not_implemented",
        "message": "Insights endpoints will aggregate transaction data and AI guidance.",
    }

