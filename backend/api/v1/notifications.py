import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from psycopg2.extras import RealDictCursor

from core.database import get_db_connection
from core.security import verify_supabase_jwt
from schemas.notifications import NotificationStateRequest, PreferencesUpdate, ReminderCreate, ReminderUpdate, SnoozeRequest

router = APIRouter(prefix="/notifications", tags=["notifications"])
reminder_router = APIRouter(prefix="/reminders", tags=["reminders"])

def _rows(conn, query, params=(), one=False):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, params)
        return cur.fetchone() if one else cur.fetchall()

@router.get("/")
def list_notifications(category: Optional[str] = None, action_required: bool = False,
                       cursor: Optional[datetime] = None, limit: int = Query(20, ge=1, le=50),
                       user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    clauses = ["user_id=%s", "deleted_at is null", "(expires_at is null or expires_at > now())"]
    params: list[Any] = [user["id"]]
    if category:
        clauses.append("category=%s"); params.append(category)
    if action_required:
        clauses.append("status='unread' and priority in ('critical','high')")
    if cursor:
        clauses.append("created_at < %s"); params.append(cursor)
    params.append(limit + 1)
    rows = _rows(conn, f"""select * from notifications where {' and '.join(clauses)}
        and status not in ('archived','dismissed') order by created_at desc limit %s""", params)
    return {"items": rows[:limit], "next_cursor": rows[limit-1]["created_at"] if len(rows) > limit else None}

@router.get("/unread-count")
def unread_count(user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    row = _rows(conn, """select count(*)::int count from notifications where user_id=%s and status='unread'
        and priority in ('critical','high','normal') and deleted_at is null
        and (expires_at is null or expires_at > now())""", (user["id"],), True)
    return {"count": row["count"], "display": "99+" if row["count"] > 99 else str(row["count"])}

@router.patch("/{notification_id}")
def update_notification(notification_id: str, body: NotificationStateRequest,
                        user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    timestamp_col = {"read":"read_at","archived":"archived_at","dismissed":"dismissed_at","actioned":"actioned_at"}.get(body.status)
    stamp = f", {timestamp_col}=now()" if timestamp_col else ", read_at=null"
    row = _rows(conn, f"""update notifications set status=%s {stamp},updated_at=now()
        where id=%s and user_id=%s returning *""", (body.status,notification_id,user["id"]), True)
    conn.commit()
    if not row: raise HTTPException(404, "Notification not found.")
    return row

@router.post("/mark-all-read")
def mark_all_read(user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    with conn.cursor() as cur:
        cur.execute("""update notifications set status='read',read_at=now(),updated_at=now()
            where user_id=%s and status='unread' and deleted_at is null""", (user["id"],))
        count = cur.rowcount
    conn.commit()
    return {"updated": count}

@router.get("/preferences")
def get_preferences(user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    rows = _rows(conn, "select * from notification_preferences where user_id=%s order by category", (user["id"],))
    return {"categories": rows}

@router.put("/preferences")
def put_preferences(body: PreferencesUpdate, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    with conn.cursor() as cur:
        for item in body.categories:
            category = item["category"]
            security = category == "security"
            cur.execute("""insert into notification_preferences
                (user_id,category,in_app_enabled,email_enabled,push_enabled,digest_enabled,quiet_hours_start,
                 quiet_hours_end,timezone,daily_digest_enabled,digest_time,smart_reminders_enabled)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                on conflict(user_id,category) do update set
                in_app_enabled=excluded.in_app_enabled,email_enabled=excluded.email_enabled,
                push_enabled=excluded.push_enabled,digest_enabled=excluded.digest_enabled,
                quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,
                timezone=excluded.timezone,daily_digest_enabled=excluded.daily_digest_enabled,
                digest_time=excluded.digest_time,smart_reminders_enabled=excluded.smart_reminders_enabled,
                updated_at=now()""", (user["id"],category,True if security else item.get("in_app_enabled",True),
                    True if security else item.get("email_enabled",False),item.get("push_enabled",False),
                    item.get("digest_enabled",False),body.quiet_hours_start,body.quiet_hours_end,body.timezone,
                    body.daily_digest_enabled,body.digest_time,body.smart_reminders_enabled))
    conn.commit()
    return get_preferences(user, conn)

@router.get("/stream")
async def stream_notifications(user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    user_id = user["id"]
    async def events():
        last = datetime.now(timezone.utc)
        yield "event: connected\ndata: {}\n\n"
        while True:
            rows = _rows(conn, """select * from notifications where user_id=%s and created_at>%s
                and deleted_at is null order by created_at""", (user_id,last))
            for row in rows:
                last = max(last, row["created_at"])
                yield f"event: notification\ndata: {json.dumps(row, default=str)}\n\n"
            yield ": keepalive\n\n"
            await asyncio.sleep(15)
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@reminder_router.get("/")
def list_reminders(status: Optional[str] = None, application_id: Optional[str] = None,
                   user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    clauses=["r.user_id=%s"]; params=[user["id"]]
    if status: clauses.append("r.status=%s"); params.append(status)
    if application_id: clauses.append("r.application_id=%s"); params.append(application_id)
    return _rows(conn, f"""select r.*,a.company_name,a.job_title,
        a.next_action,a.next_action_due_at as event_at
        from reminders r left join applications a on a.id=r.application_id
        where {' and '.join(clauses)} order by coalesce(r.snoozed_until,r.due_at)""", params)

@reminder_router.post("/", status_code=201)
def create_reminder(body: ReminderCreate, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    row = _rows(conn, """insert into reminders(user_id,application_id,recruiter_contact_id,interview_id,reminder_type,
        title,description,due_at,timezone,priority,recurrence_rule,created_by)
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning *""",
        (user["id"],body.application_id,body.recruiter_contact_id,body.interview_id,body.reminder_type,
         body.title,body.description,body.due_at,body.timezone,body.priority,body.recurrence_rule,body.created_by), True)
    conn.commit(); return row

@reminder_router.put("/{reminder_id}")
def update_reminder(reminder_id: str, body: ReminderUpdate, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    data = body.dict(exclude_none=True)
    if not data: raise HTTPException(400, "No changes supplied.")
    sets=", ".join(f"{key}=%s" for key in data)
    row=_rows(conn,f"update reminders set {sets},updated_at=now() where id=%s and user_id=%s returning *",
              (*data.values(),reminder_id,user["id"]),True)
    conn.commit()
    if not row: raise HTTPException(404,"Reminder not found.")
    return row

@reminder_router.post("/{reminder_id}/snooze")
def snooze_reminder(reminder_id: str, body: SnoozeRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    row=_rows(conn,"""update reminders set status='snoozed',snoozed_until=%s,updated_at=now()
        where id=%s and user_id=%s and status not in ('completed','cancelled') returning *""",
        (body.until,reminder_id,user["id"]),True)
    if row:
        with conn.cursor() as cur:
            cur.execute("""update notifications set status='dismissed',dismissed_at=now(),updated_at=now()
                where user_id=%s and related_entity_type='reminder' and related_entity_id=%s
                and status in ('unread','read')""",(user["id"],reminder_id))
    conn.commit()
    if not row: raise HTTPException(404,"Active reminder not found.")
    return row

@reminder_router.post("/{reminder_id}/complete")
def complete_reminder(reminder_id: str, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn=Depends(get_db_connection)):
    row=_rows(conn,"""update reminders set status='completed',completed_at=now(),updated_at=now()
        where id=%s and user_id=%s and status not in ('completed','cancelled') returning *""",(reminder_id,user["id"]),True)
    if not row: raise HTTPException(404,"Active reminder not found.")
    with conn.cursor() as cur:
        cur.execute("""update notifications set status='actioned',actioned_at=now(),updated_at=now()
            where user_id=%s and related_entity_type='reminder' and related_entity_id=%s
            and status in ('unread','read')""",(user["id"],reminder_id))
        if row.get("application_id"):
            cur.execute("""update applications set next_action=null,next_action_due_at=null,
                timeline=coalesce(timeline,'[]'::jsonb) || %s::jsonb,updated_at=now()
                where id=%s and user_id=%s""",(json.dumps([{"event":"Reminder completed","timestamp":datetime.now(timezone.utc).isoformat()}]),row["application_id"],user["id"]))
    conn.commit(); return row
