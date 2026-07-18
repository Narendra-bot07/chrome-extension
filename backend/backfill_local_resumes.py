import os
from pathlib import Path
from datetime import datetime, timezone
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json

from services.resume.parser import ResumeParser

load_dotenv("backend/.env")
DB_URL = os.getenv("DATABASE_URL")
BASE_DIR = Path("backend/local_uploads/original-resumes")


def display_name_from_storage_name(name: str) -> str:
    parts = name.split("_", 1)
    if len(parts) == 2 and len(parts[0]) == 36 and parts[0].count("-") == 4:
        return parts[1]
    return name


def backfill():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set")
    if not BASE_DIR.exists():
        print("No local resume uploads directory found.")
        return

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    inserted = 0

    for file_path in sorted(BASE_DIR.glob("*/*"), key=lambda p: p.stat().st_mtime, reverse=True):
      if not file_path.is_file():
          continue
      user_id = file_path.parent.name
      relative_path = f"{user_id}/{file_path.name}"
      cur.execute(
          "SELECT id FROM public.resumes WHERE file_path = %s AND user_id = %s AND deleted_at IS NULL",
          (relative_path, user_id)
      )
      if cur.fetchone():
          continue

      data = file_path.read_bytes()
      uploaded_at = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)
      try:
          raw_text = ResumeParser.extract_text(data, file_path.name)
      except Exception:
          raw_text = ""

      cur.execute(
          """
          INSERT INTO public.resumes (
              user_id, file_path, file_name, file_size, file_type, parsed_content, is_active, created_at, updated_at
          )
          VALUES (%s, %s, %s, %s, %s, %s, FALSE, %s, %s)
          """,
          (
              user_id,
              relative_path,
              display_name_from_storage_name(file_path.name),
              len(data),
              file_path.suffix.replace(".", "").upper() or "PDF",
              Json({"raw_text": raw_text, "parse_status": "pending"}),
              uploaded_at,
              uploaded_at,
          )
      )
      inserted += 1

    for file_path in BASE_DIR.glob("*/*"):
      if not file_path.is_file():
          continue
      user_id = file_path.parent.name
      relative_path = f"{user_id}/{file_path.name}"
      uploaded_at = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)
      cur.execute(
          """
          UPDATE public.resumes
          SET file_name = %s, created_at = %s, updated_at = %s
          WHERE user_id = %s AND file_path = %s AND deleted_at IS NULL
          """,
          (display_name_from_storage_name(file_path.name), uploaded_at, uploaded_at, user_id, relative_path)
      )

    cur.execute("""
        UPDATE public.resumes
        SET is_active = FALSE
        WHERE deleted_at IS NULL;
    """)
    cur.execute("""
        WITH latest AS (
            SELECT DISTINCT ON (user_id) id
            FROM public.resumes
            WHERE deleted_at IS NULL
            ORDER BY user_id, created_at DESC
        )
        UPDATE public.resumes r
        SET is_active = TRUE
        FROM latest
        WHERE r.id = latest.id;
    """)
    conn.commit()
    cur.close()
    conn.close()
    print(f"Backfilled {inserted} local resume file(s).")


if __name__ == "__main__":
    backfill()
