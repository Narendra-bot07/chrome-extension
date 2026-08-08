from psycopg2.extras import RealDictCursor
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger("app")

class ResumeRepository:
    def __init__(self, conn):
        self.conn = conn

    def _with_metadata_defaults(self, record: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not record:
            return record

        normalized = dict(record)
        parsed_content = normalized.get("parsed_content") or {}
        if isinstance(parsed_content, str):
            try:
                parsed_content = json.loads(parsed_content)
            except Exception:
                parsed_content = {}
        normalized["parsed_content"] = parsed_content

        times_used = normalized.get("times_used")
        tailor_count = normalized.get("tailor_count")
        normalized["times_used"] = times_used if times_used is not None else (tailor_count or 0)
        normalized["tailor_count"] = tailor_count if tailor_count is not None else (times_used or 0)
        normalized["last_used_at"] = normalized.get("last_used_at")
        normalized["upload_source"] = normalized.get("upload_source") or "user_upload"
        normalized["parsing_status"] = (
            normalized.get("parsing_status")
            or parsed_content.get("parse_status")
            or parsed_content.get("parsing_status")
            or "unknown"
        )
        return normalized

    def _enrich_resume_record(self, record: Dict[str, Any], cur) -> Dict[str, Any]:
        """Enrich root resume dict with current version info, scores, and versions count."""
        resume_id = record["id"]

        # Ensure default original version exists
        cur.execute("""
            SELECT id FROM public.resume_versions
            WHERE resume_id = %s AND deleted_at IS NULL
            LIMIT 1
        """, (resume_id,))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO public.resume_versions (
                    resume_id, version_number, version_name, version_type, source_resume_id,
                    content, changes_summary, change_summary_json, is_current, created_by, created_at
                )
                VALUES (%s, 1, 'v1 Original', 'original', %s, %s,
                        'Original uploaded resume', '{"summary":"Original uploaded resume"}'::jsonb,
                        TRUE, %s, NOW())
                RETURNING id
            """, (resume_id, resume_id, json.dumps(record.get("parsed_content") or {}), record.get("user_id")))
            ver_row = cur.fetchone()
            if ver_row:
                cur.execute("UPDATE public.resumes SET active_version_id = %s WHERE id = %s", (ver_row["id"], resume_id))

        # Fetch versions count
        cur.execute("""
            SELECT COUNT(*) AS v_count
            FROM public.resume_versions
            WHERE resume_id = %s AND deleted_at IS NULL
        """, (resume_id,))
        count_row = cur.fetchone()
        record["versions_count"] = count_row["v_count"] if count_row else 1

        # Fetch current version
        cur.execute("""
            SELECT *
            FROM public.resume_versions
            WHERE resume_id = %s AND deleted_at IS NULL
            ORDER BY is_current DESC, version_number DESC
            LIMIT 1
        """, (resume_id,))
        current_ver = cur.fetchone()
        if current_ver:
            record["current_version"] = dict(current_ver)
            record["active_version_id"] = current_ver["id"]
            record["latest_ats_score"] = current_ver.get("ats_score")
            record["latest_match_score"] = current_ver.get("resume_match_score")
        else:
            record["current_version"] = None
            record["latest_ats_score"] = None
            record["latest_match_score"] = None

        # Fetch latest scores from usage events if version scores are missing
        if record["latest_ats_score"] is None or record["latest_match_score"] is None:
            cur.execute("""
                SELECT ats_score, resume_match_score
                FROM public.resume_usage_events
                WHERE resume_id = %s AND (ats_score IS NOT NULL OR resume_match_score IS NOT NULL)
                ORDER BY created_at DESC
                LIMIT 1
            """, (resume_id,))
            usage_score = cur.fetchone()
            if usage_score:
                if record["latest_ats_score"] is None:
                    record["latest_ats_score"] = usage_score.get("ats_score")
                if record["latest_match_score"] is None:
                    record["latest_match_score"] = usage_score.get("resume_match_score")

        return record

    def _enrich_resume_records_batch(self, records: List[Dict[str, Any]], cur) -> List[Dict[str, Any]]:
        """Batch-enrich multiple resume records in 3 query roundtrips instead of N+1 loops."""
        if not records:
            return []

        resume_ids = [r["id"] for r in records if r.get("id")]
        if not resume_ids:
            return records

        cur.execute("""
            SELECT resume_id, COUNT(*) AS v_count
            FROM public.resume_versions
            WHERE resume_id = ANY(%s::uuid[]) AND deleted_at IS NULL
            GROUP BY resume_id
        """, (resume_ids,))
        counts = {str(row["resume_id"]): row["v_count"] for row in cur.fetchall()}

        cur.execute("""
            SELECT DISTINCT ON (resume_id) *
            FROM public.resume_versions
            WHERE resume_id = ANY(%s::uuid[]) AND deleted_at IS NULL
            ORDER BY resume_id, is_current DESC, version_number DESC
        """, (resume_ids,))
        current_versions = {str(row["resume_id"]): dict(row) for row in cur.fetchall()}

        cur.execute("""
            SELECT DISTINCT ON (resume_id) resume_id, ats_score, resume_match_score
            FROM public.resume_usage_events
            WHERE resume_id = ANY(%s::uuid[]) AND (ats_score IS NOT NULL OR resume_match_score IS NOT NULL)
            ORDER BY resume_id, created_at DESC
        """, (resume_ids,))
        usage_scores = {str(row["resume_id"]): row for row in cur.fetchall()}

        for record in records:
            rid = record.get("id")
            if not rid:
                continue
            record["versions_count"] = counts.get(rid, 1)
            current_ver = current_versions.get(rid)
            if current_ver:
                record["current_version"] = current_ver
                record["active_version_id"] = current_ver.get("id")
                record["latest_ats_score"] = current_ver.get("ats_score")
                record["latest_match_score"] = current_ver.get("resume_match_score")
            else:
                record["current_version"] = None
                record["latest_ats_score"] = None
                record["latest_match_score"] = None

            if record["latest_ats_score"] is None or record["latest_match_score"] is None:
                u_score = usage_scores.get(rid)
                if u_score:
                    if record["latest_ats_score"] is None:
                        record["latest_ats_score"] = u_score.get("ats_score")
                    if record["latest_match_score"] is None:
                        record["latest_match_score"] = u_score.get("resume_match_score")

        return records

    def create(
        self,
        user_id: str,
        file_path: str,
        file_name: str,
        file_size: int,
        file_type: str,
        parsed_content: Dict[str, Any],
        source_fingerprint: str | None = None,
    ) -> Dict[str, Any]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            from app.routers.api import normalize_resume_payload
            from services.resume.tailoring_engine import StrictTailoringEngine
            norm = normalize_resume_payload({"parsed_content": parsed_content})
            counts = StrictTailoringEngine.get_section_counts(norm)
            is_complete = counts["experience"] > 0 or counts["education"] > 0 or counts["projects"] > 0

            if is_complete:
                cur.execute(
                    "UPDATE public.resumes SET is_active = FALSE WHERE user_id = %s AND deleted_at IS NULL",
                    (user_id,)
                )

            query = """
                INSERT INTO public.resumes (
                    user_id, file_path, file_name, file_size, file_type,
                    parsed_content, is_active, resume_version,
                    source_fingerprint, fingerprint_algorithm, fingerprinted_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, 'sha256',
                        CASE WHEN %s IS NULL THEN NULL ELSE NOW() END)
                RETURNING *
            """
            cur.execute(
                query,
                (
                    user_id,
                    file_path,
                    file_name,
                    file_size,
                    file_type,
                    json.dumps(parsed_content),
                    is_complete,
                    source_fingerprint,
                    source_fingerprint,
                ),
            )
            record = cur.fetchone()
            
            cur.execute("SAVEPOINT resume_count_increment")
            try:
                cur.execute("SELECT public.increment_resume_count(%s)", (user_id,))
                cur.execute("RELEASE SAVEPOINT resume_count_increment")
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT resume_count_increment")
                cur.execute("RELEASE SAVEPOINT resume_count_increment")

            # Create initial v1 Original version
            ver_row = None
            if record:
                cur.execute("""
                    INSERT INTO public.resume_versions (
                        resume_id, version_number, version_name, version_type, source_resume_id,
                        content, changes_summary, change_summary_json, is_current, created_by, created_at
                    )
                    VALUES (%s, 1, 'v1 Original', 'original', %s, %s,
                            'Original uploaded resume', '{"summary":"Original uploaded resume"}'::jsonb,
                            TRUE, %s, NOW())
                    RETURNING *
                """, (record["id"], record["id"], json.dumps(parsed_content), user_id))
                ver_row = cur.fetchone()
                if ver_row:
                    cur.execute("UPDATE public.resumes SET active_version_id = %s WHERE id = %s", (ver_row["id"], record["id"]))
                    record["active_version_id"] = ver_row["id"]

            self.conn.commit()
            try:
                from services.cache.redis_cache import redis_cache
                redis_cache.delete(f"resumes_list:{user_id}")
            except Exception:
                pass
            created = self._with_metadata_defaults(record) or {}
            # Everything needed for a newly uploaded resume is already known.
            # Re-querying versions/counts/scores here added four remote DB
            # round trips to every upload without changing the response.
            created["versions_count"] = 1
            created["current_version"] = dict(ver_row) if ver_row else None
            created["latest_ats_score"] = None
            created["latest_match_score"] = None
            return created

    def get_active(self, user_id: str) -> Optional[Dict[str, Any]]:
        query = """
            SELECT *
            FROM public.resumes
            WHERE user_id = %s AND is_active = TRUE AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            record = self._with_metadata_defaults(cur.fetchone())
            if not record:
                cur.execute("""
                    SELECT *
                    FROM public.resumes
                    WHERE user_id = %s AND deleted_at IS NULL
                    ORDER BY updated_at DESC
                    LIMIT 1
                """, (user_id,))
                record = self._with_metadata_defaults(cur.fetchone())

            if record:
                try:
                    from app.routers.api import normalize_resume_payload
                    from services.resume.tailoring_engine import StrictTailoringEngine
                    norm = normalize_resume_payload(record)
                    counts = StrictTailoringEngine.get_section_counts(norm)
                    if counts["experience"] == 0 and counts["education"] == 0:
                        cur.execute("""
                            SELECT *
                            FROM public.resumes
                            WHERE user_id = %s AND deleted_at IS NULL AND id != %s
                            ORDER BY created_at ASC
                        """, (user_id, record.get("id")))
                        candidates = cur.fetchall()
                        for cand in candidates:
                            cand_dict = self._with_metadata_defaults(cand)
                            c_norm = normalize_resume_payload(cand_dict)
                            c_counts = StrictTailoringEngine.get_section_counts(c_norm)
                            if c_counts["experience"] > 0 or c_counts["education"] > 0:
                                record = cand_dict
                                break
                except Exception as exc:
                    pass

            if record:
                record = self._enrich_resume_record(record, cur)
            return record

    def get_by_id(self, resume_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (resume_id, user_id))
            record = self._with_metadata_defaults(cur.fetchone())

            if record:
                try:
                    from app.routers.api import normalize_resume_payload
                    from services.resume.tailoring_engine import StrictTailoringEngine
                    norm = normalize_resume_payload(record)
                    counts = StrictTailoringEngine.get_section_counts(norm)
                    if counts["experience"] == 0 and counts["education"] == 0:
                        # Was unbounded (no LIMIT) -- for a user with many resumes,
                        # every request for a still-empty/unparsed record paid the
                        # cost of fetching AND Python-side normalizing every other
                        # resume they own, one at a time, until a non-empty one
                        # turned up (or the loop ran out). Measured at 3s+ for a
                        # single get_by_id call on a real account. A handful of
                        # the user's most recent uploads is enough for this
                        # fallback's actual purpose.
                        cur.execute("""
                            SELECT *
                            FROM public.resumes
                            WHERE user_id = %s AND deleted_at IS NULL AND id != %s
                            ORDER BY created_at ASC
                            LIMIT 10
                        """, (user_id, resume_id))
                        candidates = cur.fetchall()
                        for cand in candidates:
                            cand_dict = self._with_metadata_defaults(cand)
                            c_norm = normalize_resume_payload(cand_dict)
                            c_counts = StrictTailoringEngine.get_section_counts(c_norm)
                            if c_counts["experience"] > 0 or c_counts["education"] > 0:
                                record = cand_dict
                                break
                except Exception as exc:
                    pass

            if record:
                record = self._enrich_resume_record(record, cur)
            return record

    def get_selected_snapshot(
        self, resume_id: str, user_id: str
    ) -> Optional[Dict[str, Any]]:
        query = """
            SELECT id, user_id, file_path, file_name, file_size, file_type,
                   parsed_content, metadata, created_at, updated_at, deleted_at,
                   is_active, resume_version, source_fingerprint,
                   fingerprint_algorithm, fingerprinted_at, active_version_id,
                   times_used, last_used_at
            FROM public.resumes
            WHERE id = %s AND user_id = %s AND deleted_at IS NULL
            LIMIT 1
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (resume_id, user_id))
            record = self._with_metadata_defaults(cur.fetchone())
            if record:
                record = self._enrich_resume_record(record, cur)
            return record

    def set_source_fingerprint_if_missing(
        self,
        resume_id: str,
        user_id: str,
        fingerprint: str,
    ) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE public.resumes
                SET source_fingerprint = %s,
                    fingerprint_algorithm = 'sha256',
                    fingerprinted_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                  AND source_fingerprint IS NULL
                RETURNING *
                """,
                (fingerprint, resume_id, user_id),
            )
            record = cur.fetchone()
            self.conn.commit()
            return self._with_metadata_defaults(record) if record else self.get_selected_snapshot(resume_id, user_id)

    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT *
            FROM public.resumes
            WHERE user_id = %s AND deleted_at IS NULL
            ORDER BY is_active DESC, created_at DESC
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            records = [self._with_metadata_defaults(record) for record in cur.fetchall()]
            return self._enrich_resume_records_batch(records, cur)

    def all_file_paths(self, user_id: str) -> set[str]:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT file_path FROM public.resumes WHERE user_id = %s",
                (user_id,),
            )
            return {row[0] for row in cur.fetchall() if row and row[0]}

    def recover_local_file(
        self,
        user_id: str,
        file_path: str,
        file_name: str,
        file_size: int,
        file_type: str,
        parsed_content: Dict[str, Any],
        uploaded_at: datetime,
        source_fingerprint: str | None = None,
    ) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id FROM public.resumes WHERE user_id = %s AND file_path = %s",
                (user_id, file_path),
            )
            if cur.fetchone():
                return None
            cur.execute(
                """
                INSERT INTO public.resumes (
                    user_id, file_path, file_name, file_size, file_type,
                    parsed_content, is_active, created_at, updated_at,
                    resume_version, source_fingerprint,
                    fingerprint_algorithm, fingerprinted_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, FALSE, %s, %s, 1, %s,
                        'sha256', CASE WHEN %s IS NULL THEN NULL ELSE NOW() END)
                RETURNING *
                """,
                (
                    user_id,
                    file_path,
                    file_name,
                    file_size,
                    file_type,
                    json.dumps(parsed_content),
                    uploaded_at,
                    uploaded_at,
                    source_fingerprint,
                    source_fingerprint,
                ),
            )
            record = cur.fetchone()
            if record:
                cur.execute("""
                    INSERT INTO public.resume_versions (
                        resume_id, version_number, version_name, version_type, source_resume_id,
                        content, changes_summary, change_summary_json, is_current, created_by, created_at
                    )
                    VALUES (%s, 1, 'v1 Original', 'original', %s, %s,
                            'Original uploaded resume', '{"summary":"Original uploaded resume"}'::jsonb,
                            TRUE, %s, %s)
                    RETURNING id
                """, (record["id"], record["id"], json.dumps(parsed_content), user_id, uploaded_at))
                ver_row = cur.fetchone()
                if ver_row:
                    cur.execute("UPDATE public.resumes SET active_version_id = %s WHERE id = %s", (ver_row["id"], record["id"]))
            self.conn.commit()
            return self._with_metadata_defaults(record)

    def get_active(self, user_id: str) -> Optional[Dict[str, Any]]:
        query = """
            SELECT *
            FROM public.resumes
            WHERE user_id = %s AND deleted_at IS NULL AND is_active = TRUE
            ORDER BY created_at DESC
            LIMIT 1
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            record = self._with_metadata_defaults(cur.fetchone())
            if record:
                record = self._enrich_resume_record(record, cur)
            return record

    def activate(self, resume_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL",
                (resume_id, user_id)
            )
            if not cur.fetchone():
                return None
            cur.execute(
                "UPDATE public.resumes SET is_active = FALSE WHERE user_id = %s AND deleted_at IS NULL",
                (user_id,)
            )
            cur.execute(
                """
                UPDATE public.resumes
                SET is_active = TRUE
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                RETURNING *
                """,
                (resume_id, user_id)
            )
            record = cur.fetchone()
            self.conn.commit()
            if record:
                record = self._with_metadata_defaults(record)
                record = self._enrich_resume_record(record, cur)
            return record

    def soft_delete(self, resume_id: str, user_id: str) -> bool:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT is_active FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL",
                (resume_id, user_id)
            )
            target = cur.fetchone()
            if not target:
                return False
            was_active = bool(target.get("is_active"))
            cur.execute(
                """
                UPDATE public.resumes
                SET deleted_at = NOW(), is_active = FALSE
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                RETURNING id
                """,
                (resume_id, user_id)
            )
            success = bool(cur.fetchone())
            if success and was_active:
                cur.execute("""
                    UPDATE public.resumes
                    SET is_active = TRUE
                    WHERE id = (
                        SELECT id
                        FROM public.resumes
                        WHERE user_id = %s AND deleted_at IS NULL
                        ORDER BY created_at DESC
                        LIMIT 1
                    )
                """, (user_id,))
            self.conn.commit()
            return bool(success)

    def update_parsed_content(self, resume_id: str, user_id: str, parsed_content: Dict[str, Any]) -> bool:
        query = """
            UPDATE public.resumes 
            SET parsed_content = %s,
                resume_version = COALESCE(resume_version, 1) + 1,
                updated_at = NOW()
            WHERE id = %s AND user_id = %s AND deleted_at IS NULL
            RETURNING id
        """
        with self.conn.cursor() as cur:
            cur.execute(query, (json.dumps(parsed_content), resume_id, user_id))
            self.conn.commit()
            return bool(cur.fetchone())

    def update_layout(self, resume_id: str, user_id: str, layout: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE public.resumes
                SET parsed_content = jsonb_set(
                        COALESCE(parsed_content, '{}'::jsonb),
                        '{layout_model}',
                        %s::jsonb,
                        TRUE
                    ),
                    updated_at = NOW()
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                RETURNING *
                """,
                (json.dumps(layout), resume_id, user_id),
            )
            record = cur.fetchone()
            self.conn.commit()
            return self._with_metadata_defaults(record)

    def mark_used(self, resume_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = """
            UPDATE public.resumes
            SET last_used_at = NOW(),
                times_used = COALESCE(times_used, 0) + 1,
                tailor_count = COALESCE(tailor_count, 0) + 1,
                updated_at = NOW()
            WHERE id = %s AND user_id = %s AND deleted_at IS NULL
            RETURNING *,
                      COALESCE(times_used, tailor_count, 0) AS times_used,
                      COALESCE(tailor_count, times_used, 0) AS tailor_count
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            try:
                cur.execute(query, (resume_id, user_id))
                record = cur.fetchone()
                if record:
                    # Keep a dated source of truth for dashboard time-series data.
                    # Older flows only incremented tailor_count, which made it
                    # impossible to reconstruct when tailoring happened.
                    cur.execute("""
                        INSERT INTO public.resume_usage_events (
                            user_id, resume_id, version_id, event_type, created_at
                        )
                        SELECT %s, %s, active_version_id, 'tailoring_completed', NOW()
                        FROM public.resumes
                        WHERE id = %s
                          AND to_regclass('public.resume_usage_events') IS NOT NULL
                    """, (user_id, resume_id, resume_id))
                self.conn.commit()
                return self._with_metadata_defaults(record)
            except Exception:
                self.conn.rollback()
                return self.get_by_id(resume_id, user_id)

    # =========================================================================
    # RESUME VERSIONING & USAGE INTELLIGENCE METHODS
    # =========================================================================

    def list_versions(self, resume_id: str, user_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check resume ownership & get parsed content
            cur.execute("SELECT id, user_id, parsed_content, created_at FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL", (resume_id, user_id))
            r_row = cur.fetchone()
            if not r_row:
                return []

            cur.execute("""
                SELECT rv.*
                FROM public.resume_versions rv
                WHERE rv.resume_id = %s AND rv.deleted_at IS NULL
                ORDER BY rv.version_number DESC, rv.created_at DESC
            """, (resume_id,))
            rows = [dict(row) for row in cur.fetchall()]

            if not rows:
                # Ensure default original version is created
                cur.execute("""
                    INSERT INTO public.resume_versions (
                        resume_id, version_number, version_name, version_type, source_resume_id,
                        content, changes_summary, change_summary_json, is_current, created_by, created_at
                    )
                    VALUES (%s, 1, 'v1 Original', 'original', %s, %s,
                            'Original uploaded resume', '{"summary":"Original uploaded resume"}'::jsonb,
                            TRUE, %s, COALESCE(%s, NOW()))
                    RETURNING *
                """, (resume_id, resume_id, json.dumps(r_row.get("parsed_content") or {}), user_id, r_row.get("created_at")))
                v1_ver = cur.fetchone()
                if v1_ver:
                    cur.execute("UPDATE public.resumes SET active_version_id = %s WHERE id = %s", (v1_ver["id"], resume_id))
                    self.conn.commit()
                    rows = [dict(v1_ver)]

            # Same "No ATS Score / No Match Score" gap as compare_versions
            # (see _backfill_version_score) -- Resume Manager's version list
            # reads these columns directly too, so a version whose score was
            # never persisted (created before that write path existed, or
            # the background scorer call silently timed out) showed the
            # same permanent placeholder here, not just in Compare Mode.
            backfilled = False
            for index, row in enumerate(rows):
                updated = self._backfill_version_score(cur, row)
                if updated is not row:
                    rows[index] = updated
                    backfilled = True
            if backfilled:
                self.conn.commit()

            return rows

    def get_version(self, resume_id: str, version_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = """
            SELECT rv.*
            FROM public.resume_versions rv
            JOIN public.resumes r ON r.id = rv.resume_id
            WHERE rv.id = %s AND rv.resume_id = %s AND r.user_id = %s AND rv.deleted_at IS NULL AND r.deleted_at IS NULL
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (version_id, resume_id, user_id))
            row = cur.fetchone()
            return dict(row) if row else None

    def create_version(
        self,
        user_id: str,
        resume_id: str,
        version_name: str,
        version_type: str = "tailored",
        content: Dict[str, Any] = None,
        parent_version_id: str | None = None,
        jd_id: str | None = None,
        job_id: str | None = None,
        ats_score: float | None = None,
        resume_match_score: float | None = None,
        change_summary_json: Dict[str, Any] = None,
        changes_summary: str | None = None,
        file_url: str | None = None,
        is_current: bool = True,
        is_final: bool = False,
        ats_engine_version: str | None = "v2.4",
        match_engine_version: str | None = "v2.4",
        resume_content_hash: str | None = None,
        jd_content_hash: str | None = None,
    ) -> Dict[str, Any]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Verify ownership
            cur.execute("SELECT id FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL", (resume_id, user_id))
            if not cur.fetchone():
                raise ValueError("Resume not found or permission denied.")

            # Calculate next version number
            cur.execute("""
                SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
                FROM public.resume_versions
                WHERE resume_id = %s AND deleted_at IS NULL
            """, (resume_id,))
            next_ver = cur.fetchone()["next_ver"]

            ver_name = version_name or f"v{next_ver} {version_type.replace('_', ' ').title()}"

            if is_current:
                cur.execute("UPDATE public.resume_versions SET is_current = FALSE WHERE resume_id = %s", (resume_id,))

            query = """
                INSERT INTO public.resume_versions (
                    resume_id, parent_version_id, version_number, version_name, version_type,
                    source_resume_id, jd_id, job_id, ats_score, resume_match_score,
                    change_summary_json, changes_summary, content, file_url, is_current,
                    is_final, created_by, ats_engine_version, match_engine_version,
                    resume_content_hash, jd_content_hash, analysis_timestamp, created_at
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, CASE WHEN %s IS NOT NULL OR %s IS NOT NULL THEN NOW() ELSE NULL END, NOW()
                )
                RETURNING *
            """
            cur.execute(
                query,
                (
                    resume_id, parent_version_id, next_ver, ver_name, version_type,
                    resume_id, jd_id, job_id, ats_score, resume_match_score,
                    json.dumps(change_summary_json or {}), changes_summary or "", json.dumps(content or {}),
                    file_url, is_current, is_final, user_id,
                    ats_engine_version, match_engine_version, resume_content_hash, jd_content_hash,
                    ats_score, resume_match_score
                )
            )
            new_version = cur.fetchone()

            if is_current and new_version:
                cur.execute("UPDATE public.resumes SET active_version_id = %s WHERE id = %s", (new_version["id"], resume_id))

            self.conn.commit()
            return dict(new_version)

    def set_current_version(self, resume_id: str, version_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT rv.id
                FROM public.resume_versions rv
                JOIN public.resumes r ON r.id = rv.resume_id
                WHERE rv.id = %s AND rv.resume_id = %s AND r.user_id = %s AND rv.deleted_at IS NULL
            """, (version_id, resume_id, user_id))
            if not cur.fetchone():
                return None

            cur.execute("UPDATE public.resume_versions SET is_current = FALSE WHERE resume_id = %s", (resume_id,))
            cur.execute("""
                UPDATE public.resume_versions
                SET is_current = TRUE, updated_at = NOW()
                WHERE id = %s
                RETURNING *
            """, (version_id,))
            updated_ver = cur.fetchone()

            cur.execute("UPDATE public.resumes SET active_version_id = %s WHERE id = %s", (version_id, resume_id))
            self.conn.commit()
            return dict(updated_ver) if updated_ver else None

    def update_version(
        self,
        resume_id: str,
        version_id: str,
        user_id: str,
        version_name: str | None = None,
        version_type: str | None = None,
    ) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT rv.id
                FROM public.resume_versions rv
                JOIN public.resumes r ON r.id = rv.resume_id
                WHERE rv.id = %s AND rv.resume_id = %s AND r.user_id = %s AND rv.deleted_at IS NULL
            """, (version_id, resume_id, user_id))
            if not cur.fetchone():
                return None

            updates = []
            params = []
            if version_name is not None:
                updates.append("version_name = %s")
                params.append(version_name)
            if version_type is not None:
                updates.append("version_type = %s")
                params.append(version_type)

            if not updates:
                return self.get_version(resume_id, version_id, user_id)

            updates.append("updated_at = NOW()")
            params.extend([version_id, resume_id])
            query = f"UPDATE public.resume_versions SET {', '.join(updates)} WHERE id = %s AND resume_id = %s RETURNING *"
            cur.execute(query, tuple(params))
            updated_ver = cur.fetchone()
            self.conn.commit()
            return dict(updated_ver) if updated_ver else None

    def duplicate_version(self, resume_id: str, version_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        source = self.get_version(resume_id, version_id, user_id)
        if not source:
            return None

        copy_name = f"{source['version_name'] or 'Version'} (Copy)"
        return self.create_version(
            user_id=user_id,
            resume_id=resume_id,
            version_name=copy_name,
            version_type=source.get("version_type") or "manual_edit",
            content=source.get("content") or {},
            parent_version_id=version_id,
            jd_id=source.get("jd_id"),
            job_id=source.get("job_id"),
            ats_score=source.get("ats_score"),
            resume_match_score=source.get("resume_match_score"),
            change_summary_json={"summary": f"Duplicated from v{source.get('version_number')}"},
            changes_summary=f"Duplicated from v{source.get('version_number')}",
            file_url=source.get("file_url"),
            is_current=False
        )

    def restore_version(self, resume_id: str, version_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        source = self.get_version(resume_id, version_id, user_id)
        if not source:
            return None

        restore_name = f"v{source['version_number']} Restored"
        restored = self.create_version(
            user_id=user_id,
            resume_id=resume_id,
            version_name=restore_name,
            version_type="restored",
            content=source.get("content") or {},
            parent_version_id=version_id,
            jd_id=source.get("jd_id"),
            job_id=source.get("job_id"),
            ats_score=source.get("ats_score"),
            resume_match_score=source.get("resume_match_score"),
            change_summary_json={"summary": f"Restored content from v{source.get('version_number')}"},
            changes_summary=f"Restored content from v{source.get('version_number')}",
            file_url=source.get("file_url"),
            is_current=True
        )

        # Update root resume parsed_content to restored content if available
        if source.get("content"):
            self.update_parsed_content(resume_id, user_id, source["content"])

        return restored

    def delete_version(self, resume_id: str, version_id: str, user_id: str) -> Dict[str, Any]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check target version
            cur.execute("""
                SELECT rv.*
                FROM public.resume_versions rv
                JOIN public.resumes r ON r.id = rv.resume_id
                WHERE rv.id = %s AND rv.resume_id = %s AND r.user_id = %s AND rv.deleted_at IS NULL
            """, (version_id, resume_id, user_id))
            target = cur.fetchone()
            if not target:
                return {"success": False, "error": "Version not found."}

            # Original protection: cannot delete if it's the only original version
            if target.get("version_type") == "original":
                cur.execute("""
                    SELECT COUNT(*) AS orig_count
                    FROM public.resume_versions
                    WHERE resume_id = %s AND version_type = 'original' AND deleted_at IS NULL
                """, (resume_id,))
                orig_count = cur.fetchone()["orig_count"]
                if orig_count <= 1:
                    return {"success": False, "error": "Cannot delete the primary original version."}

            was_current = bool(target.get("is_current"))

            # Soft delete
            cur.execute("UPDATE public.resume_versions SET deleted_at = NOW(), is_current = FALSE WHERE id = %s", (version_id,))

            fallback_ver = None
            if was_current:
                # Find latest remaining version
                cur.execute("""
                    SELECT id, version_number, version_name
                    FROM public.resume_versions
                    WHERE resume_id = %s AND deleted_at IS NULL
                    ORDER BY version_number DESC
                    LIMIT 1
                """, (resume_id,))
                fallback_row = cur.fetchone()
                if fallback_row:
                    cur.execute("UPDATE public.resume_versions SET is_current = TRUE WHERE id = %s", (fallback_row["id"],))
                    cur.execute("UPDATE public.resumes SET active_version_id = %s WHERE id = %s", (fallback_row["id"], resume_id))
                    fallback_ver = dict(fallback_row)

            self.conn.commit()
            return {
                "success": True,
                "message": "Version deleted successfully.",
                "was_current": was_current,
                "fallback_version": fallback_ver
            }

    def record_usage_event(
        self,
        user_id: str,
        resume_id: str,
        version_id: str | None = None,
        event_type: str = "jd_comparison",
        jd_id: str | None = None,
        job_id: str | None = None,
        workflow_id: str | None = None,
        idempotency_key: str | None = None,
        ats_score: float | None = None,
        resume_match_score: float | None = None,
        ats_engine_version: str | None = "v2.4",
        match_engine_version: str | None = "v2.4",
        resume_content_hash: str | None = None,
        jd_content_hash: str | None = None,
    ) -> Dict[str, Any]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check resume ownership
            cur.execute("SELECT active_version_id FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL", (resume_id, user_id))
            r_row = cur.fetchone()
            if not r_row:
                raise ValueError("Resume not found.")

            target_ver_id = version_id or r_row.get("active_version_id")
            key = idempotency_key or (f"{workflow_id}:{event_type}:{resume_id}" if workflow_id else None)

            # Insert usage event with idempotency guard
            cur.execute("""
                INSERT INTO public.resume_usage_events (
                    user_id, resume_id, version_id, workflow_id, event_type, jd_id, job_id,
                    idempotency_key, ats_score, resume_match_score, ats_engine_version,
                    match_engine_version, resume_content_hash, jd_content_hash, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING *
            """, (
                user_id, resume_id, target_ver_id, workflow_id, event_type, jd_id, job_id,
                key, ats_score, resume_match_score, ats_engine_version, match_engine_version,
                resume_content_hash, jd_content_hash
            ))
            event_row = cur.fetchone()

            # Recalculate unique workflow usage count and update last_used_at on root resume
            cur.execute("""
                UPDATE public.resumes
                SET times_used = (
                        SELECT COUNT(DISTINCT COALESCE(e.workflow_id::text, e.id::text))
                        FROM public.resume_usage_events e
                        WHERE e.resume_id = %s
                          AND e.event_type != 'resume_created'
                    ),
                    last_used_at = NOW(),
                    last_used_job_id = COALESCE(%s, last_used_job_id),
                    last_used_jd_id = COALESCE(%s, last_used_jd_id),
                    updated_at = NOW()
                WHERE id = %s
            """, (resume_id, job_id, jd_id, resume_id))

            # Update target version last_used_at
            if target_ver_id:
                cur.execute("""
                    UPDATE public.resume_versions
                    SET updated_at = NOW()
                    WHERE id = %s
                """, (target_ver_id,))

            # Update scores on target version if provided
            if target_ver_id and (ats_score is not None or resume_match_score is not None):
                updates = []
                params = []
                if ats_score is not None:
                    updates.append("ats_score = %s")
                    params.append(ats_score)
                if resume_match_score is not None:
                    updates.append("resume_match_score = %s")
                    params.append(resume_match_score)
                if ats_engine_version:
                    updates.append("ats_engine_version = %s")
                    params.append(ats_engine_version)
                if match_engine_version:
                    updates.append("match_engine_version = %s")
                    params.append(match_engine_version)
                if resume_content_hash:
                    updates.append("resume_content_hash = %s")
                    params.append(resume_content_hash)
                if jd_content_hash:
                    updates.append("jd_content_hash = %s")
                    params.append(jd_content_hash)
                updates.append("analysis_timestamp = NOW()")
                params.append(target_ver_id)

                cur.execute(f"UPDATE public.resume_versions SET {', '.join(updates)} WHERE id = %s", tuple(params))

            self.conn.commit()
            return dict(event_row) if event_row else {}

    record_resume_usage = record_usage_event

    def _backfill_version_score(self, cur, version: Dict[str, Any]) -> Dict[str, Any]:
        """Opportunistically recompute a missing ats_score/resume_match_score
        for a version whose score was never persisted (either created before
        that write path existed, or the background scorer call silently
        failed/timed out -- see AppContext.jsx's handleGenerateFinalResume).
        Only possible when the version is linked to a Job Tracker application
        (job_id) with real structured job data (organized_jd) to score
        against; otherwise there is genuinely nothing to compute from, and
        the version's score correctly stays null. Any recovered score is
        persisted back with COALESCE so it's never recomputed twice and can
        never clobber a real, already-stored value."""
        if version.get("ats_score") is not None and version.get("resume_match_score") is not None:
            return version
        job_id = version.get("job_id")
        if not job_id:
            return version
        cur.execute("SELECT organized_jd FROM public.applications WHERE id = %s", (job_id,))
        app_row = cur.fetchone()
        job_payload = (app_row or {}).get("organized_jd") or {}
        if isinstance(job_payload, str):
            try:
                job_payload = json.loads(job_payload)
            except (TypeError, ValueError):
                job_payload = {}
        # Checked on the RAW payload, before normalization below fills every
        # field with an empty default -- organized_jd uses the frontend's
        # job-object field names (job_title/skills), not JobAnalysis's
        # (title/required_skills), so this must look for either.
        has_signal = any(
            job_payload.get(key) for key in ("title", "job_title", "skills", "required_skills")
        )
        if not has_signal:
            return version
        content = version.get("content") or {}
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except (TypeError, ValueError):
                content = {}
        try:
            # Deferred imports: app.routers.api imports ResumeRepository at
            # module load time, so a top-level import here would be circular.
            from services.resume.scoring import ATSScoringEngine
            from app.schemas import ResumeStructure, JobAnalysis
            from app.routers.api import normalize_job_payload, normalize_resume_payload
            resume = ResumeStructure(**normalize_resume_payload(content))
            job = JobAnalysis(**normalize_job_payload(job_payload))
            result = ATSScoringEngine.calculate_score(resume, job)
            ats_score = result.get("ats_score")
            resume_match_score = result.get("resume_match_score")
        except Exception:
            logger.warning("Live ATS score recompute failed for version %s", version.get("id"), exc_info=True)
            return version
        if ats_score is None and resume_match_score is None:
            return version
        cur.execute(
            """
            UPDATE public.resume_versions
            SET ats_score = COALESCE(ats_score, %s),
                resume_match_score = COALESCE(resume_match_score, %s),
                analysis_timestamp = COALESCE(analysis_timestamp, NOW())
            WHERE id = %s
            RETURNING *
            """,
            (ats_score, resume_match_score, version["id"]),
        )
        updated = cur.fetchone()
        return dict(updated) if updated else version

    def compare_versions(self, version_a_id: str, version_b_id: str, user_id: str) -> Dict[str, Any]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT rv.*, r.file_name
                FROM public.resume_versions rv
                JOIN public.resumes r ON r.id = rv.resume_id
                WHERE rv.id IN (%s, %s) AND r.user_id = %s AND rv.deleted_at IS NULL
            """, (version_a_id, version_b_id, user_id))
            rows = {row["id"]: dict(row) for row in cur.fetchall()}

            ver_a = rows.get(version_a_id)
            ver_b = rows.get(version_b_id)
            if not ver_a or not ver_b:
                raise ValueError("One or both versions not found.")

            ver_a = self._backfill_version_score(cur, ver_a)
            ver_b = self._backfill_version_score(cur, ver_b)
            self.conn.commit()

            # Calculate score diffs
            ats_a = float(ver_a.get("ats_score") or 0)
            ats_b = float(ver_b.get("ats_score") or 0)
            ats_diff = ats_b - ats_a if (ver_a.get("ats_score") is not None and ver_b.get("ats_score") is not None) else None

            match_a = float(ver_a.get("resume_match_score") or 0)
            match_b = float(ver_b.get("resume_match_score") or 0)
            match_diff = match_b - match_a if (ver_a.get("resume_match_score") is not None and ver_b.get("resume_match_score") is not None) else None

            # Diff analysis of content
            content_a = ver_a.get("content") or {}
            content_b = ver_b.get("content") or {}

            skills_a = set(content_a.get("skills") or [])
            skills_b = set(content_b.get("skills") or [])
            added_skills = list(skills_b - skills_a)
            removed_skills = list(skills_a - skills_b)

            exp_a = content_a.get("experience") or []
            exp_b = content_b.get("experience") or []

            bullets_a = []
            for item in exp_a:
                if isinstance(item, dict):
                    bullets_a.extend(item.get("highlights") or item.get("bullet_points") or [])

            bullets_b = []
            for item in exp_b:
                if isinstance(item, dict):
                    bullets_b.extend(item.get("highlights") or item.get("bullet_points") or [])

            added_bullets = [b for b in bullets_b if b not in bullets_a]
            removed_bullets = [b for b in bullets_a if b not in bullets_b]

            summary_change = "Rewritten and optimized with tailored keywords" if added_bullets or added_skills else "Minor formatting updates"

            return {
                "version_a": {
                    "id": ver_a["id"],
                    "version_number": ver_a["version_number"],
                    "version_name": ver_a["version_name"],
                    "version_type": ver_a["version_type"],
                    "ats_score": ver_a.get("ats_score"),
                    "resume_match_score": ver_a.get("resume_match_score"),
                },
                "version_b": {
                    "id": ver_b["id"],
                    "version_number": ver_b["version_number"],
                    "version_name": ver_b["version_name"],
                    "version_type": ver_b["version_type"],
                    "ats_score": ver_b.get("ats_score"),
                    "resume_match_score": ver_b.get("resume_match_score"),
                },
                "score_diffs": {
                    "ats_score": {
                        "from": ver_a.get("ats_score"),
                        "to": ver_b.get("ats_score"),
                        "diff": ats_diff
                    },
                    "resume_match_score": {
                        "from": ver_a.get("resume_match_score"),
                        "to": ver_b.get("resume_match_score"),
                        "diff": match_diff
                    }
                },
                "summary": summary_change,
                "added_bullets": added_bullets[:5],
                "removed_bullets": removed_bullets[:5],
                "added_skills": added_skills,
                "removed_skills": removed_skills,
                "experience_improved_count": len(added_bullets),
                "skills_added_count": len(added_skills)
            }

