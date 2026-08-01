import os
import psycopg2
import dotenv

dotenv.load_dotenv()

def apply_functions():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL is not set.")

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()

    # 1. Create increment_resume_count function
    cur.execute("""
    CREATE OR REPLACE FUNCTION public.increment_resume_count(user_uuid UUID)
    RETURNS VOID AS $$
    BEGIN
        UPDATE public.profiles
        SET resume_count = COALESCE(resume_count, 0) + 1
        WHERE id = user_uuid;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)
    print("[OK] Created public.increment_resume_count(user_uuid UUID)")

    # 2. Create soft_delete_resume function
    cur.execute("""
    CREATE OR REPLACE FUNCTION public.soft_delete_resume(resume_uuid UUID, user_uuid UUID)
    RETURNS BOOLEAN AS $$
    BEGIN
        UPDATE public.resumes
        SET deleted_at = timezone('utc'::text, now())
        WHERE id = resume_uuid AND user_id = user_uuid AND deleted_at IS NULL;
        
        RETURN FOUND;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)
    print("[OK] Created public.soft_delete_resume")

    # 3. Create handle_update_timestamp function
    cur.execute("""
    CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = timezone('utc'::text, now());
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    """)
    print("[OK] Created public.handle_update_timestamp")

    conn.close()

if __name__ == "__main__":
    apply_functions()
