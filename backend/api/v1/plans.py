from fastapi import APIRouter, Depends
from core.database import get_db_connection
from services.subscriptions.plan_service import PlanService

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("")
async def list_plans(conn = Depends(get_db_connection)):
    plans = PlanService(conn).list_active_plans()
    return {"plans": plans}
