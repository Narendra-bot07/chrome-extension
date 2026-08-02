import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

from app.services.email_service import EmailService
from services.notifications.service import EmailDeliveryProcessor

def main():
    service = EmailService()
    print("Testing Resend API Direct Delivery...")
    recipient = "bandinarendra3333@gmail.com"
    success = service.send_notification(
        recipient=recipient,
        title="Reminder: Applied for Google",
        message="Your application for Software Engineer, Google Pay Shopping at Google was updated. Don't forget your scheduled interview prep today!",
        action_label="View in Tailr4U",
        action_url="/job-tracker"
    )
    print(f"1. Direct Resend Notification Email: {'SUCCESS [OK]' if success else 'FAILED [ERR]'}")

    db_url = os.getenv("DATABASE_URL")
    if db_url:
        try:
            conn = psycopg2.connect(db_url)
            processor = EmailDeliveryProcessor(conn, email_service=service)
            processed_count = processor.run_once(limit=10)
            print(f"2. EmailDeliveryProcessor processed {processed_count} queued email notifications.")
            conn.close()
        except Exception as e:
            print(f"DB Notification queue check exception: {e}")

if __name__ == "__main__":
    main()
