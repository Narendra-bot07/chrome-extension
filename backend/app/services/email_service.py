import html
import logging
import smtplib
import ssl
from email.message import EmailMessage

from core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    def configured(self) -> bool:
        return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)

    def send(self, recipient: str, subject: str, text_body: str, html_body: str) -> bool:
        if not self.configured():
            logger.warning("Transactional email skipped: SMTP is not configured.")
            return False
        message = EmailMessage()
        message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")
        try:
            if settings.SMTP_PORT == 465:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(
                    settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS, context=context
                ) as client:
                    if settings.SMTP_USERNAME:
                        client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    client.send_message(message)
            else:
                with smtplib.SMTP(
                    settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS
                ) as client:
                    if settings.SMTP_USE_TLS:
                        context = ssl.create_default_context()
                        client.starttls(context=context)
                    if settings.SMTP_USERNAME:
                        client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    client.send_message(message)
            logger.info("Transactional email successfully delivered to %s", recipient)
            return True
        except Exception:
            logger.exception("Transactional email delivery failed to %s", recipient)
            return False

    @staticmethod
    def _shell(title: str, content: str) -> str:
        return f"""<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#18202f">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="560" style="max-width:100%;background:#fff;border:1px solid #e5e9f0;border-radius:18px">
        <tr><td style="padding:30px"><div style="font-weight:800;color:#176b62;margin-bottom:22px">TailorFlow</div>
        <h1 style="font-size:22px;margin:0 0 14px">{html.escape(title)}</h1>{content}
        <p style="font-size:12px;color:#7a8494;margin:26px 0 0">TailorFlow account security</p>
        </td></tr></table></td></tr></table></body></html>"""

    def send_password_reset(self, recipient: str, raw_token: str) -> bool:
        url = f"{settings.FRONTEND_URL.rstrip('/')}/#/reset-password?token={raw_token}"
        content = f"""<p style="line-height:1.6">We received a request to reset your password.</p>
        <p><a href="{html.escape(url)}" style="display:inline-block;padding:12px 18px;background:#168b7e;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Reset password</a></p>
        <p style="font-size:13px;line-height:1.6">This link expires in {settings.PASSWORD_RESET_MINUTES} minutes. If you did not request it, you can ignore this email.</p>
        <p style="font-size:12px;word-break:break-all;color:#687386">{html.escape(url)}</p>"""
        return self.send(
            recipient,
            "Reset your TailorFlow password",
            f"Reset your TailorFlow password: {url}\nThis link expires in {settings.PASSWORD_RESET_MINUTES} minutes. Ignore this email if you did not request it.",
            self._shell("Reset your password", content),
        )

    def send_verification(self, recipient: str, raw_token: str) -> bool:
        url = f"{settings.FRONTEND_URL.rstrip('/')}/#/verify-email?token={raw_token}"
        content = f"""<p style="line-height:1.6">Verify your email to finish securing your TailorFlow account.</p>
        <p><a href="{html.escape(url)}" style="display:inline-block;padding:12px 18px;background:#168b7e;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Verify email</a></p>
        <p style="font-size:13px">This link expires in {settings.EMAIL_VERIFICATION_HOURS} hours.</p>
        <p style="font-size:12px;word-break:break-all;color:#687386">{html.escape(url)}</p>"""
        return self.send(
            recipient, "Verify your TailorFlow email",
            f"Verify your TailorFlow email: {url}", self._shell("Verify your email", content)
        )

    def send_password_changed(self, recipient: str) -> bool:
        return self.send(
            recipient, "Your TailorFlow password was changed",
            "Your TailorFlow password was changed. If this was not you, contact support immediately.",
            self._shell("Password changed", "<p style=\"line-height:1.6\">Your password was changed successfully. If this was not you, contact support immediately.</p>"),
        )
