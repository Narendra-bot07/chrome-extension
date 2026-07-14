import psycopg2
from psycopg2.extras import RealDictCursor
from core.config import settings

def get_db_connection():
    """
    Dependency injection provider yielding a raw psycopg2 database connection.
    Uses RealDictCursor so rows are returned as dictionaries (matching Supabase structure).
    """
    if not settings.DATABASE_URL:
        raise ValueError("DATABASE_URL is not set in environment settings.")
    
    conn = psycopg2.connect(settings.DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()
