"""Dedicated, restart-safe reminder worker entrypoint."""
import logging
import argparse
import time
import psycopg2
from psycopg2 import errors
from core.config import settings
from app.services.email_service import EmailService
from services.notifications import EmailDeliveryProcessor, ReminderScheduler

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tailorflow.notification-worker")

def check_configuration():
    with psycopg2.connect(settings.DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("select to_regclass('public.reminders'), to_regclass('public.notification_deliveries')")
            reminders, deliveries = cur.fetchone()
            if reminders is None or deliveries is None:
                raise RuntimeError("Notification schema is incomplete. Run migrate_notifications.py.")
            cur.execute("""select count(*) from notification_deliveries
                where channel='email' and status in ('pending','failed','deferred')
                  and attempt_count < 3""")
            queued = cur.fetchone()[0]
    configured = EmailService().configured()
    log.info(
        "Worker health check passed; SMTP configured=%s, queued email deliveries=%s. No emails sent.",
        configured, queued,
    )
    if not configured:
        log.warning(
            "Set SMTP_HOST and SMTP_FROM_EMAIL (plus SMTP_USERNAME/SMTP_PASSWORD when required) "
            "in backend/.env before starting live email delivery."
        )


def main(once: bool = False):
    while True:
        try:
            with psycopg2.connect(settings.DATABASE_URL) as conn:
                count = ReminderScheduler(conn).run_once()
                email_count = EmailDeliveryProcessor(conn).run_once()
                if count:
                    log.info("Processed %s due reminders", count)
                if email_count:
                    log.info("Processed %s email deliveries", email_count)
                if once and not count and not email_count:
                    log.info("Worker check completed; no reminders or emails are currently due.")
            if once:
                return
        except errors.UndefinedTable:
            log.error(
                "Notification schema is missing. Stop this worker and run "
                "`python migrate_notifications.py` once from the backend directory."
            )
            return
        except Exception:
            log.exception("Reminder worker iteration failed")
        time.sleep(30)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process one batch and exit.")
    parser.add_argument("--check", action="store_true", help="Validate schema and SMTP without sending.")
    args = parser.parse_args()
    check_configuration() if args.check else main(args.once)
