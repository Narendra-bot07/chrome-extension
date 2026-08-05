import hashlib
import json
import logging
import datetime
from enum import Enum
from typing import Dict, Any, Optional, Tuple
from psycopg2.extras import RealDictCursor
from app.services.turnstile_service import verify_turnstile_token

logger = logging.getLogger("tailr4u.device_abuse")

class AbuseDecision(str, Enum):
    ALLOW = "allow"
    ALLOW_WITHOUT_TRIAL = "allow_without_trial"
    REQUIRE_CHALLENGE = "require_challenge"
    REQUIRE_EMAIL_VERIFICATION = "require_email_verification"
    TEMPORARILY_BLOCK = "temporarily_block"

class DeviceAbuseService:
    def __init__(self, conn):
        self.conn = conn

    @staticmethod
    def hash_value(value: str, salt_prefix: str = "tailr4u_device") -> str:
        if not value:
            return ""
        return hashlib.sha256(f"{salt_prefix}:{value}".encode("utf-8")).hexdigest()

    @staticmethod
    def hash_ip(ip: str) -> str:
        return DeviceAbuseService.hash_value(ip or "127.0.0.1", "ip")

    @staticmethod
    def hash_user_agent(ua: str) -> str:
        return DeviceAbuseService.hash_value(ua or "unknown_agent", "ua")

    @staticmethod
    def hash_device_id(installation_id: str) -> str:
        if not installation_id:
            return ""
        return DeviceAbuseService.hash_value(installation_id, "installation")

    def evaluate_signup_attempt(
        self,
        installation_id: Optional[str],
        ip: str,
        user_agent: str,
        email: str,
        turnstile_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluates a signup attempt against device, IP, and automation rules.
        Returns decision and metadata without storing raw sensitive credentials.
        """
        device_hash = self.hash_device_id(installation_id) if installation_id else ""
        signup_ip_hash = self.hash_ip(ip)
        user_agent_hash = self.hash_user_agent(user_agent)

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # 1. Check if device_hash or IP is currently blocked
            if device_hash:
                cur.execute(
                    """SELECT blocked_at, block_reason FROM public.device_registrations
                       WHERE device_hash = %s AND blocked_at IS NOT NULL
                         AND blocked_at > NOW() - INTERVAL '24 hours'
                       LIMIT 1""",
                    (device_hash,)
                )
                blocked = cur.fetchone()
                if blocked:
                    logger.info(f"Signup blocked for device_hash (reason: {blocked['block_reason']})")
                    return {
                        "decision": AbuseDecision.TEMPORARILY_BLOCK,
                        "reason": blocked["block_reason"] or "Account creation is temporarily restricted on this device. Please try again later.",
                        "device_hash": device_hash,
                        "signup_ip_hash": signup_ip_hash,
                        "user_agent_hash": user_agent_hash,
                        "trial_eligible": False
                    }

            # 2. Automation / Bot Detection (e.g. >= 5 signups within 10 minutes on IP or device)
            cur.execute(
                """SELECT COUNT(*) AS count FROM public.device_registrations
                   WHERE (signup_ip_hash = %s OR (device_hash = %s AND device_hash != ''))
                     AND created_at > NOW() - INTERVAL '10 minutes'""",
                (signup_ip_hash, device_hash)
            )
            recent_rapid = cur.fetchone()["count"]
            if recent_rapid >= 5:
                # Flag and temporarily block
                reason = "Automated high-frequency registration traffic detected."
                logger.warning(f"Bot traffic detected on signup_ip_hash: {recent_rapid} signups in 10m.")
                if device_hash:
                    cur.execute(
                        """UPDATE public.device_registrations SET blocked_at = NOW(), block_reason = %s
                           WHERE device_hash = %s""",
                        (reason, device_hash)
                    )
                    self.conn.commit()
                return {
                    "decision": AbuseDecision.TEMPORARILY_BLOCK,
                    "reason": "Account creation temporarily restricted due to unusual activity. Please try again later.",
                    "device_hash": device_hash,
                    "signup_ip_hash": signup_ip_hash,
                    "user_agent_hash": user_agent_hash,
                    "trial_eligible": False
                }

            # 3. Check signups in last 24h (Threshold: 3 accounts within 24h requires Turnstile)
            cur.execute(
                """SELECT COUNT(*) AS count FROM public.device_registrations
                   WHERE ((device_hash = %s AND device_hash != '') OR signup_ip_hash = %s)
                     AND created_at > NOW() - INTERVAL '24 hours'""",
                (device_hash, signup_ip_hash)
            )
            count_24h = cur.fetchone()["count"]

            if count_24h >= 3:
                # Validate Turnstile token on backend
                turnstile_valid = verify_turnstile_token(turnstile_token, ip)
                if not turnstile_valid:
                    logger.info(f"Turnstile challenge required for count_24h={count_24h}")
                    return {
                        "decision": AbuseDecision.REQUIRE_CHALLENGE,
                        "reason": "Additional verification required before creating an account.",
                        "device_hash": device_hash,
                        "signup_ip_hash": signup_ip_hash,
                        "user_agent_hash": user_agent_hash,
                        "trial_eligible": False
                    }

            # 4. Check signups in last 7 days (Threshold: >= 5 accounts within 7 days denies promotional benefits)
            cur.execute(
                """SELECT COUNT(*) AS count FROM public.device_registrations
                   WHERE (device_hash = %s AND device_hash != '')
                     AND created_at > NOW() - INTERVAL '7 days'""",
                (device_hash,)
            )
            count_7d = cur.fetchone()["count"]

            # 5. Check if any trial was already claimed on this device
            trial_already_claimed = False
            if device_hash:
                cur.execute(
                    """SELECT COUNT(*) AS count FROM public.device_registrations
                       WHERE device_hash = %s AND trial_claimed_at IS NOT NULL""",
                    (device_hash,)
                )
                trial_already_claimed = (cur.fetchone()["count"] > 0)
            else:
                # If local storage was cleared (missing installation_id), match IP + UserAgent pattern
                cur.execute(
                    """SELECT COUNT(*) AS count FROM public.device_registrations
                       WHERE signup_ip_hash = %s AND user_agent_hash = %s AND trial_claimed_at IS NOT NULL""",
                    (signup_ip_hash, user_agent_hash)
                )
                trial_already_claimed = (cur.fetchone()["count"] > 0)

            # Determine trial eligibility & decision
            trial_eligible = not trial_already_claimed and count_7d < 5

            if count_7d >= 5 or trial_already_claimed:
                decision = AbuseDecision.ALLOW_WITHOUT_TRIAL
                reason = "Free trial is limited to 1 per device." if trial_already_claimed else "Registration limit reached for promotional trial eligibility."
            else:
                decision = AbuseDecision.ALLOW
                reason = "Account creation permitted."

            return {
                "decision": decision,
                "reason": reason,
                "device_hash": device_hash or self.hash_value(f"{signup_ip_hash}_{user_agent_hash}", "fallback"),
                "signup_ip_hash": signup_ip_hash,
                "user_agent_hash": user_agent_hash,
                "trial_eligible": trial_eligible,
                "risk_score": 50 if count_7d >= 3 else 0
            }

    @staticmethod
    def mask_email(email: str) -> str:
        """na***a@gm***.com -- enough for the account's owner to recognize
        it, not enough to hand a stranger on a shared device a usable email."""
        if not email or "@" not in email:
            return email or ""
        local, _, domain = email.partition("@")
        domain_name, _, domain_rest = domain.partition(".")
        masked_local = local[:2] + "*" * max(1, len(local) - 2) if len(local) > 2 else local[:1] + "*"
        masked_domain = domain_name[:2] + "*" * max(1, len(domain_name) - 2) if len(domain_name) > 2 else domain_name[:1] + "*"
        return f"{masked_local}@{masked_domain}.{domain_rest}" if domain_rest else f"{masked_local}@{masked_domain}"

    def record_device_sighting(self, user_id: str, device_hash: str, ip_hash: str, user_agent_hash: str) -> None:
        """Upserts a (device_hash, user_id) sighting on every login -- not just
        signup, which is all record_device_registration ever covered. Without
        this, find_other_accounts_on_device below can only ever see devices
        that were present at REGISTER time, missing every account that
        registered before this device_hash pairing existed or that has never
        re-registered from this device."""
        if not device_hash or not user_id:
            return
        with self.conn.cursor() as cur:
            cur.execute(
                """UPDATE public.device_registrations
                   SET last_seen_at = NOW(), signup_ip_hash = %s, user_agent_hash = %s
                   WHERE device_hash = %s AND user_id = %s""",
                (ip_hash, user_agent_hash, device_hash, user_id)
            )
            if cur.rowcount == 0:
                cur.execute(
                    """INSERT INTO public.device_registrations
                       (device_hash, user_id, signup_ip_hash, user_agent_hash, first_seen_at, last_seen_at, risk_score)
                       VALUES (%s, %s, %s, %s, NOW(), NOW(), 0)""",
                    (device_hash, user_id, ip_hash, user_agent_hash)
                )
        self.conn.commit()

    def find_other_accounts_on_device(self, device_hash: str, current_user_id: str) -> list:
        """Distinct other accounts ever seen (login OR signup) on this device,
        for the "you're already logged in with a different account here" notice."""
        if not device_hash:
            return []
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT DISTINCT u.email
                   FROM public.device_registrations dr
                   JOIN public.users u ON u.id = dr.user_id
                   WHERE dr.device_hash = %s AND dr.user_id IS NOT NULL AND dr.user_id != %s
                   ORDER BY u.email LIMIT 3""",
                (device_hash, current_user_id)
            )
            return [self.mask_email(row["email"]) for row in cur.fetchall()]

    def record_device_registration(
        self,
        user_id: str,
        device_hash: str,
        signup_ip_hash: str,
        user_agent_hash: str,
        risk_score: int = 0,
        grant_trial_now: bool = False
    ) -> str:
        """
        Persists a device registration record for an authenticated user.
        """
        trial_claimed_at = datetime.datetime.now(datetime.timezone.utc) if grant_trial_now else None
        with self.conn.cursor() as cur:
            cur.execute(
                """INSERT INTO public.device_registrations
                   (device_hash, user_id, signup_ip_hash, user_agent_hash, trial_claimed_at, risk_score)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (device_hash, user_id, signup_ip_hash, user_agent_hash, trial_claimed_at, risk_score)
            )
            row = cur.fetchone()
            reg_id = str(row[0]) if row else ""
            self.conn.commit()
            return reg_id

    def grant_trial_if_eligible(self, user_id: str) -> bool:
        """
        Called upon email verification (Requirement #7).
        Grants trial ONLY IF email is verified AND the device has not already claimed a trial.
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT id, device_hash, trial_claimed_at FROM public.device_registrations
                   WHERE user_id = %s
                   ORDER BY created_at DESC LIMIT 1""",
                (user_id,)
            )
            reg = cur.fetchone()
            if not reg:
                return False

            if reg["trial_claimed_at"] is not None:
                return False  # Already claimed trial

            device_hash = reg["device_hash"]
            # Check if any other user on this device claimed trial
            cur.execute(
                """SELECT COUNT(*) AS count FROM public.device_registrations
                   WHERE device_hash = %s AND trial_claimed_at IS NOT NULL""",
                (device_hash,)
            )
            if cur.fetchone()["count"] > 0:
                logger.info(f"Device {device_hash} already claimed free trial for another account.")
                return False

            # Update device_registrations trial timestamp
            now = datetime.datetime.now(datetime.timezone.utc)
            cur.execute(
                """UPDATE public.device_registrations SET trial_claimed_at = %s
                   WHERE id = %s""",
                (now, reg["id"])
            )
            
            # Upsert free demo subscription into public.subscriptions table
            cur.execute(
                """INSERT INTO public.subscriptions (user_id, plan_id, status)
                   VALUES (%s, 'free', 'active')
                   ON CONFLICT DO NOTHING""",
                (user_id,)
            )
            self.conn.commit()
            logger.info(f"Free trial successfully granted to user {user_id} on device {device_hash}.")
            return True
