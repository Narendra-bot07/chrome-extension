"""Event-driven notification policy and reminder scheduling."""
import json
from datetime import datetime, time, timedelta, timezone
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo
from psycopg2.extras import RealDictCursor
from app.services.email_service import EmailService

TEMPLATES: Dict[str, Dict[str, Any]] = {
    "resume.generated": {"category":"resume","type":"RESUME_GENERATED","priority":"normal","title":"Your tailored resume is ready","message":"Your tailored resume for {company} is ready.","action_label":"Preview","action_url":"/resume-review?resume={resume_id}"},
    "resume.failed": {"category":"resume","type":"RESUME_GENERATION_FAILED","priority":"high","title":"Resume generation was interrupted","message":"Your previous valid version is safe.","action_label":"Retry","action_url":"/tailor?resume={resume_id}"},
    "cover_letter.generated": {"category":"cover_letter","type":"COVER_LETTER_GENERATED","priority":"normal","title":"Your cover letter is ready","message":"Your {company} cover letter is ready.","action_label":"Preview","action_url":"/cover-letter?application={application_id}"},
    "cover_letter.pending": {"category":"cover_letter","type":"COVER_LETTER_MISSING","priority":"high","title":"Cover letter pending","message":"You created a resume for this role, but the cover letter is still pending.","action_label":"Generate Cover Letter","action_url":"/cover-letter?application={application_id}"},
    "application.created": {"category":"application","type":"APPLICATION_ADDED","priority":"normal","title":"Application added","message":"{company} has been added to Job Tracker.","action_label":"Open Application","action_url":"/job-tracker?application={application_id}"},
    "application.stage_changed": {"category":"application","type":"APPLICATION_STAGE_CHANGED","priority":"normal","title":"Application moved","message":"{company} moved from {old_stage} to {new_stage}.","action_label":"View Timeline","action_url":"/job-tracker?application={application_id}&tab=timeline"},
    "interview.scheduled": {"category":"interview","type":"INTERVIEW_SCHEDULED","priority":"normal","title":"Interview scheduled","message":"Interview scheduled with {company} for {scheduled_label}.","action_label":"View Details","action_url":"/job-tracker?application={application_id}&tab=overview"},
    "interview.24h": {"category":"interview","type":"INTERVIEW_IN_24_HOURS","priority":"high","title":"Interview tomorrow","message":"Your {company} interview is tomorrow at {time_label}.","action_label":"Prepare","action_url":"/job-tracker?application={application_id}&tab=notes"},
    "interview.2h": {"category":"interview","type":"INTERVIEW_IN_2_HOURS","priority":"critical","title":"Interview starts in 2 hours","message":"Your {company} interview starts in 2 hours.","action_label":"Open Preparation","action_url":"/job-tracker?application={application_id}&tab=notes"},
    "reminder.due": {"category":"reminder","type":"REMINDER_DUE","priority":"normal","title":"{title}","message":"{description}","action_label":"Open","action_url":"/job-tracker?application={application_id}&reminder={reminder_id}"},
    "reminder.overdue": {"category":"reminder","type":"REMINDER_OVERDUE","priority":"high","title":"Reminder overdue","message":"{title} needs attention.","action_label":"Review","action_url":"/job-tracker?application={application_id}&reminder={reminder_id}"},
    "security.password_changed": {"category":"security","type":"PASSWORD_CHANGED","priority":"high","title":"Password changed","message":"Your password was changed successfully.","action_label":"Review Sessions","action_url":"/settings/security"},
    "security.password_reset_requested": {"category":"security","type":"PASSWORD_RESET_REQUESTED","priority":"high","title":"Password reset requested","message":"A password reset was requested for your account.","action_label":"Review Sessions","action_url":"/settings/security"},
    "security.suspicious_login": {"category":"security","type":"SUSPICIOUS_LOGIN","priority":"critical","title":"Unusual login activity","message":"Unusual login activity was detected.","action_label":"Secure Account","action_url":"/settings/security"},
    "subscription.credits_low": {"category":"subscription","type":"CREDITS_LOW","priority":"high","title":"AI credits are low","message":"You have {credits} AI credits remaining.","action_label":"View Usage","action_url":"/subscription"},
    "product.new_feature": {"category":"product","type":"NEW_FEATURE","priority":"low","title":"New in TailorFlow","message":"{message}","action_label":"Learn More","action_url":"{action_url}"},
}

class NotificationService:
    def __init__(self, conn):
        self.conn = conn

    def emit(self, user_id: str, event_type: str, metadata: Optional[Dict[str, Any]] = None,
             related_entity_type: Optional[str] = None, related_entity_id: Optional[str] = None,
             deduplication_key: Optional[str] = None) -> Optional[Dict[str, Any]]:
        metadata = metadata or {}
        policy = TEMPLATES.get(event_type)
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""insert into notification_events
                (user_id,event_type,related_entity_type,related_entity_id,metadata_json,deduplication_key)
                values (%s,%s,%s,%s,%s::jsonb,%s) returning id""",
                (user_id,event_type,related_entity_type,related_entity_id,json.dumps(metadata, default=str),deduplication_key))
            event_id = cur.fetchone()["id"]
            if not policy:
                self.conn.commit()
                return None
            values = dict(metadata)
            values.setdefault("company", "this role")
            values.setdefault("description", "A scheduled action is due.")
            values.setdefault("application_id", "")
            values.setdefault("resume_id", "")
            values.setdefault("reminder_id", related_entity_id or "")
            key = deduplication_key or f"{event_type}:{user_id}:{related_entity_id or event_id}"
            cur.execute("""insert into notifications
                (user_id,event_id,category,notification_type,priority,title,message,action_label,action_url,
                 action_payload_json,related_entity_type,related_entity_id,deduplication_key,expires_at)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s)
                on conflict (user_id,deduplication_key) where deduplication_key is not null
                  and deleted_at is null and status not in ('archived','dismissed','actioned')
                do update set title=excluded.title,message=excluded.message,updated_at=now()
                returning *""", (
                    user_id,event_id,policy["category"],policy["type"],policy["priority"],
                    policy["title"].format_map(values),policy["message"].format_map(values),
                    policy.get("action_label"),policy.get("action_url","").format_map(values),
                    json.dumps(metadata, default=str),related_entity_type,related_entity_id,key,metadata.get("expires_at")))
            notification = cur.fetchone()
            cur.execute("""insert into notification_deliveries(notification_id,channel,status,delivered_at)
                values (%s,'in_app','delivered',now()) on conflict do nothing""", (notification["id"],))
            cur.execute("""select email_enabled from notification_preferences
                where user_id=%s and category=%s""", (user_id, policy["category"]))
            preference = cur.fetchone()
            email_enabled = bool(preference and preference.get("email_enabled"))
            if email_enabled or (policy["category"] == "security" and policy["priority"] == "critical"):
                cur.execute("""insert into notification_deliveries(notification_id,channel,status,next_attempt_at)
                    values (%s,'email','pending',now()) on conflict(notification_id,channel) do nothing""",
                    (notification["id"],))
            self.conn.commit()
            return notification

class ReminderScheduler:
    """Idempotent, row-locking worker; safe to run from cron or a dedicated container."""
    def __init__(self, conn):
        self.conn = conn

    def run_once(self, now: Optional[datetime] = None, limit: int = 100) -> int:
        now = now or datetime.now(timezone.utc)
        processed = 0
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""select * from reminders
                where status in ('scheduled','snoozed','due','overdue')
                  and coalesce(snoozed_until,due_at) <= %s
                  and completed_at is null
                order by coalesce(snoozed_until,due_at) for update skip locked limit %s""", (now, limit))
            reminders = cur.fetchall()
            for reminder in reminders:
                effective_due = reminder["snoozed_until"] or reminder["due_at"]
                overdue = (now - effective_due).total_seconds() >= 3600
                event_type = "reminder.overdue" if overdue else "reminder.due"
                dedup = f"{event_type}:{reminder['id']}:{effective_due.isoformat()}"
                NotificationService(self.conn).emit(
                    str(reminder["user_id"]), event_type,
                    {**dict(reminder), "application_id": str(reminder.get("application_id") or ""),
                     "reminder_id": str(reminder["id"]), "description": reminder.get("description") or "This reminder is due."},
                    "reminder", str(reminder["id"]), dedup)
                cur.execute("""update reminders set status=%s,last_fired_at=%s,
                    overdue_notified_at=case when %s then coalesce(overdue_notified_at,%s) else overdue_notified_at end,
                    updated_at=now() where id=%s""",
                    ("overdue" if overdue else "due",now,overdue,now,reminder["id"]))
                processed += 1
        self.conn.commit()
        return processed


class EmailDeliveryProcessor:
    """Preference-aware SMTP delivery with quiet hours and bounded retries."""
    MAX_ATTEMPTS = 3
    RETRY_DELAYS = (60, 300, 1800)

    def __init__(self, conn, email_service: Optional[EmailService] = None):
        self.conn = conn
        self.email_service = email_service or EmailService()

    @staticmethod
    def _parse_time(value: Any) -> Optional[time]:
        if value is None or isinstance(value, time):
            return value
        return time.fromisoformat(str(value))

    @classmethod
    def quiet_hours_end(cls, now: datetime, start_value: Any, end_value: Any, tz_name: str) -> Optional[datetime]:
        start, end = cls._parse_time(start_value), cls._parse_time(end_value)
        if not start or not end:
            return None
        try:
            tz = ZoneInfo(tz_name or "UTC")
        except Exception:
            tz = timezone.utc
        local_now = now.astimezone(tz)
        current = local_now.timetz().replace(tzinfo=None)
        in_quiet = (current >= start or current < end) if start > end else start <= current < end
        if not in_quiet:
            return None
        end_date = local_now.date()
        if start > end and current >= start:
            end_date += timedelta(days=1)
        local_end = datetime.combine(end_date, end, tzinfo=tz)
        return local_end.astimezone(timezone.utc)

    def run_once(self, now: Optional[datetime] = None, limit: int = 50) -> int:
        now = now or datetime.now(timezone.utc)
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""select d.*,n.user_id,n.category,n.priority,n.title,n.message,
                    n.action_label,n.action_url,u.email,p.email_enabled,p.quiet_hours_start,
                    p.quiet_hours_end,p.timezone
                from notification_deliveries d
                join notifications n on n.id=d.notification_id
                join users u on u.id=n.user_id
                left join notification_preferences p on p.user_id=n.user_id and p.category=n.category
                where d.channel='email' and d.status in ('pending','failed','deferred')
                  and d.attempt_count < %s and coalesce(d.next_attempt_at,d.created_at) <= %s
                  and n.deleted_at is null and n.status not in ('archived','dismissed')
                  and (n.expires_at is null or n.expires_at > %s)
                order by coalesce(d.next_attempt_at,d.created_at)
                for update of d skip locked limit %s""", (self.MAX_ATTEMPTS, now, now, limit))
            deliveries = cur.fetchall()

        processed = 0
        for delivery in deliveries:
            mandatory_security = delivery["category"] == "security" and delivery["priority"] == "critical"
            if not mandatory_security and not delivery.get("email_enabled"):
                with self.conn.cursor() as cur:
                    cur.execute("""update notification_deliveries set status='cancelled',
                        error_code='preference_disabled',updated_at=now() where id=%s""", (delivery["id"],))
                processed += 1
                continue
            quiet_end = None if mandatory_security else self.quiet_hours_end(
                now, delivery.get("quiet_hours_start"), delivery.get("quiet_hours_end"),
                delivery.get("timezone") or "UTC",
            )
            if quiet_end:
                with self.conn.cursor() as cur:
                    cur.execute("""update notification_deliveries set status='deferred',
                        next_attempt_at=%s,error_code='quiet_hours',updated_at=now() where id=%s""",
                        (quiet_end, delivery["id"]))
                processed += 1
                continue
            attempt = delivery["attempt_count"] + 1
            delivered = self.email_service.send_notification(
                delivery["email"], delivery["title"], delivery["message"],
                delivery.get("action_label"), delivery.get("action_url"),
            )
            with self.conn.cursor() as cur:
                if delivered:
                    cur.execute("""update notification_deliveries set status='delivered',
                        attempt_count=%s,last_attempt_at=%s,delivered_at=%s,next_attempt_at=null,
                        error_code=null,updated_at=now() where id=%s""",
                        (attempt, now, now, delivery["id"]))
                else:
                    terminal = attempt >= self.MAX_ATTEMPTS
                    retry_at = None if terminal else now + timedelta(seconds=self.RETRY_DELAYS[attempt - 1])
                    cur.execute("""update notification_deliveries set status='failed',
                        attempt_count=%s,last_attempt_at=%s,failed_at=%s,next_attempt_at=%s,
                        error_code=%s,updated_at=now() where id=%s""",
                        (attempt, now, now if terminal else None, retry_at,
                         "smtp_failed_final" if terminal else "smtp_failed", delivery["id"]))
            processed += 1
        self.conn.commit()
        return processed
