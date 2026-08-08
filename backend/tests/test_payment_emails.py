"""Regression tests for payment-status transactional emails.

Feature (2026-08-08): the user should get an email regardless of whether
their payment succeeded or failed, and founder@tailr4u.com should get a
heads-up on every real purchase. These are unit tests against EmailService
itself (mocking the actual `send` transport so no real email goes out);
webhook-level wiring is exercised by hand against Stripe/Razorpay's test
webhooks rather than here, since fully mocking both providers' webhook
payload shapes end-to-end adds more mocking than signal.
"""

from unittest.mock import patch

from app.services.email_service import EmailService


def test_send_payment_success_includes_plan_and_amount():
    service = EmailService()
    with patch.object(EmailService, "send", return_value=True) as mock_send:
        result = service.send_payment_success("buyer@example.com", "Pro", 19.99, "USD")

    assert result is True
    recipient, subject, text_body, html_body = mock_send.call_args.args
    assert recipient == "buyer@example.com"
    assert "Pro" in subject
    assert "Pro" in text_body
    assert "USD 19.99" in html_body


def test_send_payment_success_handles_missing_amount():
    service = EmailService()
    with patch.object(EmailService, "send", return_value=True) as mock_send:
        service.send_payment_success("buyer@example.com", "Pro", None, None)

    _, _, text_body, html_body = mock_send.call_args.args
    # Must not render a garbled "None" amount anywhere a user would see it.
    assert "None" not in text_body
    assert "None" not in html_body


def test_send_payment_failed_includes_reason_when_given():
    service = EmailService()
    with patch.object(EmailService, "send", return_value=True) as mock_send:
        service.send_payment_failed("buyer@example.com", "Elite", reason="card_declined")

    recipient, subject, text_body, html_body = mock_send.call_args.args
    assert recipient == "buyer@example.com"
    assert "Elite" in subject
    assert "card_declined" in html_body


def test_send_payment_failed_without_reason_omits_reason_line():
    service = EmailService()
    with patch.object(EmailService, "send", return_value=True) as mock_send:
        service.send_payment_failed("buyer@example.com", "Elite")

    _, _, _, html_body = mock_send.call_args.args
    assert "Reason:" not in html_body


def test_send_purchase_notification_to_owner_uses_owner_address_not_buyer():
    service = EmailService()
    with patch.object(EmailService, "send", return_value=True) as mock_send:
        service.send_purchase_notification_to_owner(
            "founder@tailr4u.com", "buyer@example.com", "Pro", 19.99, "USD", "stripe",
        )

    recipient, subject, text_body, html_body = mock_send.call_args.args
    assert recipient == "founder@tailr4u.com"
    assert "buyer@example.com" in html_body
    assert "Pro" in subject
    assert "Stripe" in subject
