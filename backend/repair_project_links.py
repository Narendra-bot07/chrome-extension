"""Repair existing resume project links and write a durable cleanup audit."""

import json
import os

import psycopg2
from dotenv import load_dotenv

from services.resume.composition import clean_and_repair_project_links


def run() -> tuple[int, int]:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set")

    repaired = 0
    audited = 0
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, parsed_content FROM public.resumes "
                "WHERE deleted_at IS NULL AND parsed_content ? 'projects'"
            )
            for resume_id, content in cursor.fetchall():
                source = content if isinstance(content, dict) else json.loads(content or "{}")
                cleaned, entries = clean_and_repair_project_links(source)
                if cleaned != source:
                    cursor.execute(
                        "UPDATE public.resumes SET parsed_content=%s::jsonb, updated_at=NOW() WHERE id=%s",
                        (json.dumps(cleaned), resume_id),
                    )
                    repaired += 1
                for entry in entries:
                    cursor.execute(
                        """
                        INSERT INTO public.project_link_cleanup_audit (
                            resume_id, project_id, project_name, original_url,
                            normalized_url, reason
                        ) VALUES (%s,%s,%s,%s,%s,%s)
                        """,
                        (
                            resume_id,
                            entry.get("project_id"),
                            entry.get("project_name"),
                            entry.get("original_url") or entry.get("removed_url"),
                            entry.get("normalized_url"),
                            entry["reason"],
                        ),
                    )
                    audited += 1
    return repaired, audited


if __name__ == "__main__":
    repaired_count, audit_count = run()
    print(f"Repaired {repaired_count} resumes; wrote {audit_count} audit records.")
