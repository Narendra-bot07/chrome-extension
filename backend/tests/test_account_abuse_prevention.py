import pytest
import os
import uuid
import datetime
from unittest.mock import MagicMock, patch
from app.services.device_abuse_service import DeviceAbuseService, AbuseDecision
from app.services.turnstile_service import verify_turnstile_token
from app.services.rate_limiter_service import RateLimiterService

@pytest.fixture
def db_conn():
    import psycopg2
    from core.config import settings
    url = os.getenv("DATABASE_URL") or settings.DATABASE_URL
    if not url:
        pytest.skip("DATABASE_URL not set")
    conn = psycopg2.connect(url)
    yield conn
    conn.rollback()
    conn.close()

def create_test_user(conn, email=None):
    if not email:
        email = f"test_{uuid.uuid4()}@example.com"
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO public.users (email, full_name, password_hash, provider, auth_provider, has_password_credential)
               VALUES (%s, 'Test User', 'hash', 'email', 'password', TRUE)
               ON CONFLICT (email) DO UPDATE SET full_name = 'Test User'
               RETURNING id""",
            (email,)
        )
        row = cur.fetchone()
        user_id = str(row[0])
        cur.execute(
            """INSERT INTO public.profiles (id, email, full_name) VALUES (%s, %s, 'Test User')
               ON CONFLICT (id) DO NOTHING""",
            (user_id, email)
        )
        conn.commit()
        return user_id

def test_first_account_receives_trial(db_conn):
    service = DeviceAbuseService(db_conn)
    device_id = f"first_inst_{uuid.uuid4()}"
    ip = f"198.51.101.{uuid.uuid4().int % 200 + 1}"
    email = f"user1_{uuid.uuid4()}@example.com"
    eval_res = service.evaluate_signup_attempt(
        installation_id=device_id,
        ip=ip,
        user_agent="Mozilla/5.0 TestAgent",
        email=email,
        turnstile_token="1x00000000000000000000AA"
    )
    assert eval_res["decision"] == AbuseDecision.ALLOW
    assert eval_res["trial_eligible"] is True

    # Record registration with valid user
    user_id = create_test_user(db_conn, email)
    reg_id = service.record_device_registration(
        user_id=user_id,
        device_hash=eval_res["device_hash"],
        signup_ip_hash=eval_res["signup_ip_hash"],
        user_agent_hash=eval_res["user_agent_hash"],
        grant_trial_now=False
    )
    assert reg_id != ""

    # Verify email triggers trial grant
    granted = service.grant_trial_if_eligible(user_id)
    assert granted is True

def test_second_email_same_device_no_second_trial(db_conn):
    service = DeviceAbuseService(db_conn)
    device_id = f"shared_inst_{uuid.uuid4()}"
    ip = f"198.51.102.{uuid.uuid4().int % 200 + 1}"
    ua = "Mozilla/5.0 SharedAgent"

    # User 1
    email1 = f"u1_{uuid.uuid4()}@example.com"
    eval1 = service.evaluate_signup_attempt(device_id, ip, ua, email1, turnstile_token="1x00000000000000000000AA")
    u1_id = create_test_user(db_conn, email1)
    service.record_device_registration(u1_id, eval1["device_hash"], eval1["signup_ip_hash"], eval1["user_agent_hash"])
    service.grant_trial_if_eligible(u1_id)

    # User 2 on same device
    email2 = f"u2_{uuid.uuid4()}@example.com"
    eval2 = service.evaluate_signup_attempt(device_id, ip, ua, email2, turnstile_token="1x00000000000000000000AA")
    assert eval2["decision"] == AbuseDecision.ALLOW_WITHOUT_TRIAL
    assert eval2["trial_eligible"] is False

    u2_id = create_test_user(db_conn, email2)
    service.record_device_registration(u2_id, eval2["device_hash"], eval2["signup_ip_hash"], eval2["user_agent_hash"])
    granted2 = service.grant_trial_if_eligible(u2_id)
    assert granted2 is False

def test_legitimate_shared_device_users_retain_access(db_conn):
    service = DeviceAbuseService(db_conn)
    device_id = f"multi_inst_{uuid.uuid4()}"
    ip = f"198.51.103.{uuid.uuid4().int % 200 + 1}"
    ua = "Mozilla/5.0 MultiAgent"

    # First user
    eval1 = service.evaluate_signup_attempt(device_id, ip, ua, f"shared1_{uuid.uuid4()}@example.com", turnstile_token="1x00000000000000000000AA")
    assert eval1["decision"] in (AbuseDecision.ALLOW, AbuseDecision.ALLOW_WITHOUT_TRIAL)

    # Second user (e.g. spouse or teammate on shared computer)
    eval2 = service.evaluate_signup_attempt(device_id, ip, ua, f"shared2_{uuid.uuid4()}@example.com", turnstile_token="1x00000000000000000000AA")
    assert eval2["decision"] != AbuseDecision.TEMPORARILY_BLOCK
    assert "creation permitted" in eval2["reason"].lower() or "free trial" in eval2["reason"].lower() or "limit" in eval2["reason"].lower()

def test_repeated_signups_trigger_turnstile(db_conn):
    service = DeviceAbuseService(db_conn)
    device_id = f"rapid_inst_{uuid.uuid4()}"
    ip = f"198.51.104.{uuid.uuid4().int % 200 + 1}"
    ua = "Mozilla/5.0 RapidAgent"

    # Simulate 3 registrations within 24h
    for i in range(3):
        em = f"rapid{i}_{uuid.uuid4()}@example.com"
        u_id = create_test_user(db_conn, em)
        ev = service.evaluate_signup_attempt(device_id, ip, ua, em, turnstile_token="1x00000000000000000000AA")
        service.record_device_registration(u_id, ev["device_hash"], ev["signup_ip_hash"], ev["user_agent_hash"])

    # 4th registration without Turnstile token should be challenged
    eval_chal = service.evaluate_signup_attempt(device_id, ip, ua, f"rapid4_{uuid.uuid4()}@example.com", turnstile_token=None)
    assert eval_chal["decision"] == AbuseDecision.REQUIRE_CHALLENGE
    assert "verification required" in eval_chal["reason"].lower()

def test_rate_limits_work(db_conn):
    limiter = RateLimiterService(db_conn)
    key = f"test_key_{uuid.uuid4()}"
    
    # 2 requests allowed in 10-second window
    assert limiter.is_rate_limited("test_action", key, max_requests=2, window_seconds=10) is False
    assert limiter.is_rate_limited("test_action", key, max_requests=2, window_seconds=10) is False
    # 3rd request should be limited
    assert limiter.is_rate_limited("test_action", key, max_requests=2, window_seconds=10) is True

def test_changing_email_does_not_reset_trial_eligibility(db_conn):
    service = DeviceAbuseService(db_conn)
    device_id = f"email_change_inst_{uuid.uuid4()}"
    ip = f"198.51.105.{uuid.uuid4().int % 200 + 1}"
    ua = "Mozilla/5.0 EmailChangeAgent"

    # Initial registration with email 1
    em1 = f"old_{uuid.uuid4()}@example.com"
    eval1 = service.evaluate_signup_attempt(device_id, ip, ua, em1, turnstile_token="1x00000000000000000000AA")
    u1 = create_test_user(db_conn, em1)
    service.record_device_registration(u1, eval1["device_hash"], eval1["signup_ip_hash"], eval1["user_agent_hash"])
    service.grant_trial_if_eligible(u1)

    # Registration with different email address on same device
    em2 = f"new_{uuid.uuid4()}@example.com"
    eval2 = service.evaluate_signup_attempt(device_id, ip, ua, em2, turnstile_token="1x00000000000000000000AA")
    assert eval2["trial_eligible"] is False
    assert eval2["decision"] == AbuseDecision.ALLOW_WITHOUT_TRIAL

def test_clearing_local_storage_does_not_guarantee_another_trial(db_conn):
    service = DeviceAbuseService(db_conn)
    ip = f"198.51.106.{uuid.uuid4().int % 200 + 1}"
    ua = "Mozilla/5.0 ClearedStorageAgent"

    # Device 1 signup and trial claim
    inst1 = f"inst1_{uuid.uuid4()}"
    em1 = f"orig_{uuid.uuid4()}@example.com"
    eval1 = service.evaluate_signup_attempt(inst1, ip, ua, em1, turnstile_token="1x00000000000000000000AA")
    u1 = create_test_user(db_conn, em1)
    service.record_device_registration(u1, eval1["device_hash"], eval1["signup_ip_hash"], eval1["user_agent_hash"])
    service.grant_trial_if_eligible(u1)

    # Local storage cleared -> missing installation_id, but same IP + UA pattern matches prior trial claim
    inst2 = None
    eval2 = service.evaluate_signup_attempt(inst2, ip, ua, f"cleared_{uuid.uuid4()}@example.com", turnstile_token="1x00000000000000000000AA")
    assert eval2["trial_eligible"] is False

def test_backend_rejects_forged_or_missing_turnstile():
    with patch.dict(os.environ, {"TURNSTILE_SECRET_KEY": "real_secret", "TESTING": "False"}):
        with patch("requests.post") as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {"success": False, "error-codes": ["invalid-input-response"]}

            assert verify_turnstile_token("forged_token", "198.51.100.1") is False
            assert verify_turnstile_token("", "198.51.100.1") is False

def test_blocked_decisions_include_safe_user_facing_reason(db_conn):
    service = DeviceAbuseService(db_conn)
    device_id = f"blocked_inst_{uuid.uuid4()}"
    ip = f"198.51.107.{uuid.uuid4().int % 200 + 1}"
    ua = "Mozilla/5.0 BlockedAgent"

    # Simulate bot rapid signup to trigger temporary block (5 signups in 10 mins)
    for i in range(5):
        u_id = create_test_user(db_conn, f"bot{i}_{uuid.uuid4()}@example.com")
        service.record_device_registration(u_id, service.hash_device_id(device_id), service.hash_ip(ip), service.hash_user_agent(ua))

    eval_blocked = service.evaluate_signup_attempt(device_id, ip, ua, "bot@example.com", turnstile_token="1x00000000000000000000AA")
    assert eval_blocked["decision"] == AbuseDecision.TEMPORARILY_BLOCK
    assert isinstance(eval_blocked["reason"], str)
    assert len(eval_blocked["reason"]) > 10
    assert "password" not in eval_blocked["reason"].lower()
    assert "hash" not in eval_blocked["reason"].lower()
