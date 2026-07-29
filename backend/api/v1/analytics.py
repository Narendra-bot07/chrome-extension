from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Dict, Any, List
from psycopg2.extras import RealDictCursor
from core.database import get_db_connection
from core.security import verify_supabase_jwt

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/performance-signature")
async def get_performance_signature(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection),
):
    """Return the six dashboard radar metrics calculated directly in PostgreSQL."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            WITH app_stats AS (
              SELECT
                COUNT(*)::int AS total,
                COALESCE(AVG(COALESCE(ats_score, resume_match_score)), 0)::numeric AS ats_match,
                COUNT(*) FILTER (
                  WHERE resume_status = 'ready' OR resume_version IS NOT NULL
                )::int AS resume_ready,
                COUNT(*) FILTER (
                  WHERE current_stage <> 'Ready To Apply'
                )::int AS submitted,
                COUNT(*) FILTER (
                  WHERE current_stage IN ('Interview', 'Final Round', 'Offer', 'Accepted')
                )::int AS interviews,
                COUNT(*) FILTER (
                  WHERE current_stage IN ('Offer', 'Accepted')
                )::int AS offers,
                COUNT(*) FILTER (
                  WHERE cover_letter_status = 'ready'
                     OR LOWER(COALESCE(cover_letter_version, '')) ~ '^v?[0-9]+'
                     OR (
                       cover_letter_snapshot IS NOT NULL
                       AND cover_letter_snapshot <> '{}'::jsonb
                       AND LENGTH(TRIM(COALESCE(
                         cover_letter_snapshot->>'content',
                         cover_letter_snapshot->>'body',
                         cover_letter_snapshot->>'letter',
                         ''
                       ))) > 0
                     )
                )::int AS cover_letters,
                COALESCE(AVG(
                  CASE current_stage
                    WHEN 'Ready To Apply' THEN 10
                    WHEN 'Resume Ready' THEN 15
                    WHEN 'Draft' THEN 15
                    WHEN 'Applied' THEN 30
                    WHEN 'Screening' THEN 45
                    WHEN 'Assessment' THEN 50
                    WHEN 'Recruiter' THEN 55
                    WHEN 'Recruiter Contact' THEN 55
                    WHEN 'Interview' THEN 70
                    WHEN 'Final Round' THEN 82
                    WHEN 'Offer' THEN 92
                    WHEN 'Accepted' THEN 100
                    WHEN 'Rejected' THEN 20
                    ELSE 10
                  END
                ), 0)::numeric AS application_progress
              FROM public.applications
              WHERE user_id = %s
            )
            SELECT
              ROUND(LEAST(100, GREATEST(0, a.ats_match)))::int AS ats_match,
              CASE WHEN a.total = 0 THEN 0
                   ELSE ROUND(100.0 * a.resume_ready / a.total)::int END AS resume_ready,
              ROUND(LEAST(100, GREATEST(0, a.application_progress)))::int AS application_progress,
              CASE WHEN a.submitted = 0 THEN 0
                   ELSE ROUND(100.0 * a.interviews / a.submitted)::int END AS interviews,
              CASE WHEN a.total = 0 THEN 0
                   ELSE ROUND(100.0 * a.cover_letters / a.total)::int END AS cover_letter_ready,
              CASE WHEN a.submitted = 0 THEN 0
                   ELSE ROUND(100.0 * a.offers / a.submitted)::int END AS offer_success,
              a.total,
              a.submitted,
              a.resume_ready AS resume_ready_count,
              a.cover_letters AS cover_letter_count,
              a.interviews AS interview_count,
              a.offers AS offer_count
            FROM app_stats a
            """,
            (user["id"],),
        )
        row = cur.fetchone() or {}
        return {
            "metrics": {
                "ats_match": int(row.get("ats_match") or 0),
                "resume_ready": int(row.get("resume_ready") or 0),
                "application_progress": int(row.get("application_progress") or 0),
                "interviews": int(row.get("interviews") or 0),
                "cover_letter_ready": int(row.get("cover_letter_ready") or 0),
                "offer_success": int(row.get("offer_success") or 0),
            },
            "counts": {
                "applications": int(row.get("total") or 0),
                "submitted": int(row.get("submitted") or 0),
                "resume_ready": int(row.get("resume_ready_count") or 0),
                "cover_letters": int(row.get("cover_letter_count") or 0),
                "interviews": int(row.get("interview_count") or 0),
                "offers": int(row.get("offer_count") or 0),
            },
        }


@router.get("/trend")
async def get_activity_trend(
    days: int = Query(30, enum=[7, 30, 90]),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection),
):
    """Return successful JD extractions grouped by the user's local date."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            WITH requested_settings AS (
              SELECT
                COALESCE(NULLIF(timezone, ''), 'UTC') AS requested_timezone
              FROM public.profiles WHERE id=%s
            ),
            profile_settings AS (
              SELECT COALESCE(
                       (
                         SELECT name
                         FROM pg_timezone_names
                         WHERE name = (
                           SELECT requested_timezone FROM requested_settings
                         )
                         LIMIT 1
                       ),
                       'UTC'
                     ) AS timezone
            ),
            date_range AS (
              SELECT
                timezone,
                (NOW() AT TIME ZONE timezone)::date AS end_date,
                (NOW() AT TIME ZONE timezone)::date - (%s - 1) AS start_date
              FROM profile_settings
            ),
            dates AS (
              SELECT generate_series(
                (SELECT start_date FROM date_range),
                (SELECT end_date FROM date_range),
                interval '1 day'
              )::date AS tailored_date
            ),
            usage_activity AS (
              SELECT (
                       ue.created_at AT TIME ZONE
                       (SELECT timezone FROM date_range)
                     )::date AS tailored_date,
                     SUM(ue.quantity)::int AS count
              FROM public.usage_events ue
              WHERE ue.user_id=%s
                AND ue.feature_key = 'jd_extraction'
                AND (
                      ue.created_at AT TIME ZONE
                      (SELECT timezone FROM date_range)
                    )::date BETWEEN
                      (SELECT start_date FROM date_range)
                      AND (SELECT end_date FROM date_range)
              GROUP BY 1
            ),
            daily_series AS (
              SELECT d.tailored_date AS date,
                     COALESCE(u.count, 0)::int AS count
              FROM dates d
              LEFT JOIN usage_activity u USING(tailored_date)
            )
            SELECT date,
                   count,
                   SUM(count) OVER ()::int AS total_in_range,
                   (SELECT timezone FROM date_range) AS timezone
            FROM daily_series
            ORDER BY date
            """,
            (
                user["id"], days,
                user["id"],
            ),
        )
        rows = cur.fetchall()
        timezone = rows[0]["timezone"] if rows else "UTC"
        total_in_range = rows[0]["total_in_range"] if rows else 0
        return {
            "range": f"last_{days}_days",
            "timezone": timezone,
            "total_in_range": total_in_range,
            "series": [
                {"date": row["date"], "count": row["count"]}
                for row in rows
            ],
        }

@router.get("/dashboard")
async def get_dashboard_metrics(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    try:
        metrics = {}
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. Get user billing metrics
            cur.execute(
                "SELECT current_plan, credits_remaining, credits_used, subscription_status FROM public.users WHERE id = %s", 
                (user["id"],)
            )
            user_data = cur.fetchone()
            if user_data:
                metrics["current_plan"] = user_data["current_plan"]
                metrics["credits_remaining"] = user_data["credits_remaining"]
                metrics["credits_used"] = user_data["credits_used"]
                metrics["subscription_status"] = user_data["subscription_status"]

            # 2. Count resumes actually tailored and saved
            cur.execute(
                """
                SELECT COUNT(*) as count
                FROM public.tailored_resumes
                WHERE user_id = %s AND deleted_at IS NULL
                """,
                (user["id"],)
            )
            metrics["resumes_tailored"] = cur.fetchone()["count"]

            # 3. Count applications actually tracked
            cur.execute(
                "SELECT COUNT(*) as count FROM public.applications WHERE user_id = %s",
                (user["id"],)
            )
            metrics["applications_tracked"] = cur.fetchone()["count"]

            # 4. Success rates and conversions from current application stages
            cur.execute(
                """
                SELECT COUNT(*) as count
                FROM public.applications
                WHERE user_id = %s AND current_stage IN ('Interview', 'Final Round')
                """,
                (user["id"],)
            )
            interviews_count = cur.fetchone()["count"]
            
            cur.execute(
                """
                SELECT COUNT(*) as count
                FROM public.applications
                WHERE user_id = %s AND current_stage = 'Accepted'
                """,
                (user["id"],)
            )
            accepted_count = cur.fetchone()["count"]
            
            metrics["success_rate"] = 0
            if metrics["applications_tracked"] > 0:
                metrics["success_rate"] = round((accepted_count / metrics["applications_tracked"]) * 100)
            
            metrics["interviews"] = interviews_count
            
            cur.execute(
                """
                SELECT COUNT(*) as count
                FROM public.applications
                WHERE user_id = %s AND current_stage = 'Rejected'
                """,
                (user["id"],)
            )
            metrics["rejected"] = cur.fetchone()["count"]

            # 5. Average ATS score from persisted application/tailoring records only
            cur.execute(
                """
                SELECT AVG(score) AS avg_score
                FROM (
                    SELECT ats_score::numeric AS score
                    FROM public.applications
                    WHERE user_id = %s AND ats_score IS NOT NULL
                    UNION ALL
                    SELECT ats_score::numeric AS score
                    FROM public.tailored_resumes
                    WHERE user_id = %s AND deleted_at IS NULL AND ats_score IS NOT NULL
                ) scores
                """,
                (user["id"], user["id"])
            )
            avg = cur.fetchone()
            metrics["avg_ats_score"] = round(avg["avg_score"]) if avg and avg["avg_score"] is not None else 0

            # 6. Downloads / generated docs
            cur.execute("SELECT to_regclass('public.downloads') AS table_name")
            downloads_table = cur.fetchone()
            if downloads_table and downloads_table["table_name"]:
                cur.execute(
                    """
                    SELECT COUNT(*) as count
                    FROM public.downloads
                    WHERE user_id = %s
                    """,
                    (user["id"],)
                )
                metrics["downloads"] = cur.fetchone()["count"]
            else:
                metrics["downloads"] = 0

        return metrics
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard metrics: {str(e)}"
        )

@router.get("/activity")
async def get_recent_activity(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Rebuild activity stream from user_events table for rich timeline!
            cur.execute("""
                SELECT 
                    event_type as action,
                    metadata->>'company_name' as company,
                    metadata->>'job_title' as role,
                    metadata->>'new_stage' as stage,
                    created_at as timestamp
                FROM public.user_events 
                WHERE user_id = %s 
                AND event_type IN ('APPLICATION_CREATED', 'RESUME_TAILORED', 'APPLICATION_MOVED', 'OFFER_ACCEPTED')
                ORDER BY created_at DESC 
                LIMIT 20
            """, (user["id"],))
            
            rows = cur.fetchall()
            activity_list = []
            
            for row in rows:
                desc = "Performed an action"
                if row["action"] == 'APPLICATION_CREATED':
                    desc = f"Started tracking application for {row['company'] or 'a company'}"
                elif row["action"] == 'RESUME_TAILORED':
                    desc = f"Tailored a resume for {row['role'] or 'a role'}"
                elif row["action"] == 'APPLICATION_MOVED':
                    desc = f"Moved application to {row['stage'] or 'next stage'}"
                elif row["action"] == 'OFFER_ACCEPTED':
                    desc = f"Accepted offer!"
                    
                activity_list.append({
                    "action": desc,
                    "timestamp": row["timestamp"],
                    "icon_type": row["action"]
                })
                
            return activity_list
    except Exception as e:
        return [] # fail silently for activity so dashboard loads
