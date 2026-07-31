import os
import sys
import psycopg2
from dotenv import load_dotenv
import requests

load_dotenv()

def test_credentials():
    db_url = os.getenv("DATABASE_URL", "").strip()
    supa_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()

    results = {}

    print("========================================")
    print("      SUPABASE CREDENTIALS TEST         ")
    print("========================================")

    # 1. Test DATABASE_URL
    if not db_url or "localhost" in db_url:
        results["DATABASE_URL"] = "NOT TESTED: Local database URL is currently in .env. Please update DATABASE_URL with your Supabase Postgres connection string."
    else:
        try:
            conn = psycopg2.connect(db_url, connect_timeout=5)
            with conn.cursor() as cur:
                cur.execute("SELECT version();")
                version = cur.fetchone()[0]
            conn.close()
            results["DATABASE_URL"] = f"SUCCESS! Connected to Supabase Postgres: {version[:50]}..."
        except Exception as e:
            results["DATABASE_URL"] = f"FAIL: Connection error: {e}"

    # 2. Test SUPABASE_URL & ANON_KEY
    if not supa_url or not anon_key:
        results["SUPABASE_URL_ANON"] = "NOT TESTED: SUPABASE_URL or SUPABASE_ANON_KEY is empty in .env."
    else:
        try:
            resp = requests.get(f"{supa_url.rstrip('/')}/rest/v1/", headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}, timeout=5)
            if resp.status_code in [200, 404, 401]:
                results["SUPABASE_URL_ANON"] = f"SUCCESS! Supabase API endpoint responding (Status {resp.status_code})."
            else:
                results["SUPABASE_URL_ANON"] = f"FAIL: Status code {resp.status_code} - {resp.text[:100]}"
        except Exception as e:
            results["SUPABASE_URL_ANON"] = f"FAIL: {e}"

    # 3. Test SUPABASE_SERVICE_ROLE_KEY & Storage Access
    if not supa_url or not service_key:
        results["SUPABASE_SERVICE_ROLE_KEY"] = "NOT TESTED: SUPABASE_SERVICE_ROLE_KEY is empty in .env."
    else:
        try:
            resp = requests.get(f"{supa_url.rstrip('/')}/storage/v1/bucket", headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"}, timeout=5)
            if resp.status_code == 200:
                buckets = [b.get("name") for b in resp.json()]
                results["SUPABASE_SERVICE_ROLE_KEY"] = f"SUCCESS! Storage Admin API authenticated. Existing buckets: {buckets}"
            else:
                results["SUPABASE_SERVICE_ROLE_KEY"] = f"FAIL: Status code {resp.status_code} - {resp.text[:100]}"
        except Exception as e:
            results["SUPABASE_SERVICE_ROLE_KEY"] = f"FAIL: {e}"

    print("\n---------------- RESULTS SUMMARY ----------------")
    for key, val in results.items():
        print(f"  [{key}] => {val}")
    print("========================================\n")

if __name__ == "__main__":
    test_credentials()
