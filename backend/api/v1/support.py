from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from psycopg2.extras import RealDictCursor
from core.database import get_db_connection
from core.security import verify_supabase_jwt
from schemas.support import FeedbackCreateRequest, SupportTicketCreateRequest
from app.analytics.events.tracking.analytics_service import AnalyticsService

router = APIRouter(prefix="/support", tags=["support"])

@router.post("/feedback")
async def submit_feedback(
    request: FeedbackCreateRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO public.feedback 
                (user_id, rating, category, title, description, screenshot_url, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'OPEN')
                RETURNING *
            """, (
                user["id"],
                request.rating,
                request.category,
                request.title,
                request.description,
                request.screenshot_url
            ))
            record = cur.fetchone()
            conn.commit()
            
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="FEEDBACK_SUBMITTED",
            resource_type="feedback",
            resource_id=str(record["id"]),
            metadata={
                "rating": request.rating,
                "category": request.category
            }
        )
        return {"status": "success", "data": record}
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit feedback: {str(e)}"
        )

@router.post("/ticket")
async def create_support_ticket(
    request: SupportTicketCreateRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO public.support_tickets 
                (user_id, subject, description, priority, status)
                VALUES (%s, %s, %s, %s, 'OPEN')
                RETURNING *
            """, (
                user["id"],
                request.subject,
                request.description,
                request.priority
            ))
            record = cur.fetchone()
            conn.commit()
            
        # Optional: emit event for ticket if requested in future, though requirements mainly focused on feedback/support clicks
        return {"status": "success", "data": record}
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create support ticket: {str(e)}"
        )
