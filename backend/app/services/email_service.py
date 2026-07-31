import os
import html
import logging
import smtplib
import ssl
import requests
from email.message import EmailMessage

from core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    def configured(self) -> bool:
        resend_key = (settings.RESEND_API_KEY or os.getenv("RESEND_API_KEY", "")).strip()
        if resend_key:
            return True
        return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)

    def send(self, recipient: str, subject: str, text_body: str, html_body: str) -> bool:
        if not self.configured():
            logger.warning("Transactional email skipped: Neither Resend API Key nor SMTP is configured.")
            return False

        resend_key = (settings.RESEND_API_KEY or os.getenv("RESEND_API_KEY", "")).strip()
        from_email = settings.SMTP_FROM_EMAIL or "onboarding@resend.dev"
        from_name = settings.SMTP_FROM_NAME or "tailr4u"

        # 1. Primary Transport: Resend HTTP REST API
        if resend_key:
            try:
                headers = {
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "from": f"{from_name} <{from_email}>",
                    "to": [recipient],
                    "subject": subject,
                    "html": html_body,
                    "text": text_body,
                }
                response = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=10)
                if response.status_code in [200, 201, 202]:
                    logger.info("Transactional email successfully delivered via Resend API to %s (id=%s)", recipient, response.json().get("id"))
                    return True
                else:
                    logger.warning("Resend API error status %s: %s. Attempting SMTP fallback...", response.status_code, response.text)
            except Exception as e:
                logger.warning("Resend API request exception (%s). Attempting SMTP fallback...", e)

        # 2. Secondary Transport: Standard SMTP Relay
        if not (settings.SMTP_HOST and settings.SMTP_FROM_EMAIL):
            return False

        message = EmailMessage()
        message["From"] = f"{from_name} <{settings.SMTP_FROM_EMAIL}>"
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
            logger.info("Transactional email successfully delivered via SMTP to %s", recipient)
            return True
        except Exception:
            logger.exception("Transactional email delivery failed to %s", recipient)
            return False

    @staticmethod
    def _shell(title: str, content: str) -> str:
        return f"""<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#18202f">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="560" style="max-width:100%;background:#fff;border:1px solid #e5e9f0;border-radius:18px">
        <tr><td style="padding:30px"><div style="font-weight:800;color:#176b62;margin-bottom:22px">tailr4u</div>
        <h1 style="font-size:22px;margin:0 0 14px">{html.escape(title)}</h1>{content}
        <p style="font-size:12px;color:#7a8494;margin:26px 0 0">tailr4u account security</p>
        </td></tr></table></td></tr></table></body></html>"""

    def send_password_reset(self, recipient: str, raw_token: str) -> bool:
        url = f"{settings.FRONTEND_URL.rstrip('/')}/#/reset-password?token={raw_token}"
        content = f"""<p style="line-height:1.6">We received a request to reset your password.</p>
        <p><a href="{html.escape(url)}" style="display:inline-block;padding:12px 18px;background:#168b7e;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Reset password</a></p>
        <p style="font-size:13px;line-height:1.6">This link expires in {settings.PASSWORD_RESET_MINUTES} minutes. If you did not request it, you can ignore this email.</p>
        <p style="font-size:12px;word-break:break-all;color:#687386">{html.escape(url)}</p>"""
        return self.send(
            recipient,
            "Reset your tailr4u password",
            f"Reset your tailr4u password: {url}\nThis link expires in {settings.PASSWORD_RESET_MINUTES} minutes. Ignore this email if you did not request it.",
            self._shell("Reset your password", content),
        )

    def send_verification(self, recipient: str, raw_token: str) -> bool:
        url = f"{settings.FRONTEND_URL.rstrip('/')}/#/verify-email?token={raw_token}"
        content = f"""<p style="line-height:1.6">Verify your email to finish securing your tailr4u account.</p>
        <p><a href="{html.escape(url)}" style="display:inline-block;padding:12px 18px;background:#168b7e;color:#fff;text-decoration:none;border-radius:10px;font-weight:700">Verify email</a></p>
        <p style="font-size:13px">This link expires in {settings.EMAIL_VERIFICATION_HOURS} hours.</p>
        <p style="font-size:12px;word-break:break-all;color:#687386">{html.escape(url)}</p>"""
        return self.send(
            recipient, "Verify your tailr4u email",
            f"Verify your tailr4u email: {url}", self._shell("Verify your email", content)
        )

    def send_password_changed(self, recipient: str) -> bool:
        return self.send(
            recipient, "Your tailr4u password was changed",
            "Your tailr4u password was changed. If this was not you, contact support immediately.",
            self._shell("Password changed", "<p style=\"line-height:1.6\">Your password was changed successfully. If this was not you, contact support immediately.</p>"),
        )

    def send_notification(
        self, recipient: str, title: str, message: str,
        action_label: str | None = None, action_url: str | None = None,
    ) -> bool:
        """Send a privacy-safe notification email using the shared SMTP transport."""
        safe_title = html.escape(title)
        safe_message = html.escape(message)
        content = f'<p style="line-height:1.65">{safe_message}</p>'
        text = f"{title}\n\n{message}"
        if action_label and action_url:
            absolute_url = (
                action_url if action_url.startswith(("http://", "https://"))
                else f"{settings.FRONTEND_URL.rstrip('/')}/#{action_url}"
            )
            content += (
                f'<p><a href="{html.escape(absolute_url)}" '
                'style="display:inline-block;padding:12px 18px;background:#168b7e;'
                'color:#fff;text-decoration:none;border-radius:10px;font-weight:700">'
                f"{html.escape(action_label)}</a></p>"
            )
            text += f"\n\n{action_label}: {absolute_url}"
        return self.send(
            recipient,
            f"{title} | tailr4u",
            text,
            self._shell(title, content),
        )

    def send_account_deletion_otp(self, recipient: str, otp_code: str) -> bool:
        content = f"""<p style="line-height:1.6">We received a request to permanently delete your tailr4u account.</p>
        <p style="font-size:14px;font-weight:600">Your verification OTP code for account deletion is:</p>
        <div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#dc2626;padding:16px 0;text-align:center">{html.escape(otp_code)}</div>
        <p style="font-size:13px;line-height:1.6">This code expires in 10 minutes. If you did not request account deletion, please secure your account immediately.</p>"""
        return self.send(
            recipient,
            "Confirm Account Deletion - OTP Code",
            f"Your tailr4u account deletion OTP code is: {otp_code}\nThis code expires in 10 minutes.",
            self._shell("Confirm Account Deletion", content),
        )
