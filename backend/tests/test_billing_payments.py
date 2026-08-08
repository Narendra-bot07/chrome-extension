import pytest
import os
import json
import uuid
from unittest.mock import MagicMock, patch
from app.billing.services.billing_service import BillingService
from app.billing.providers.stripe_provider import StripeProvider
from app.billing.providers.razorpay_provider import RazorpayProvider

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

def test_routing_international_to_stripe():
    service = BillingService()
    provider, name = service._get_provider_for_request(country="US", currency="USD")
    assert name == "stripe"
    assert isinstance(provider, StripeProvider)

    provider_de, name_de = service._get_provider_for_request(country="DE", currency="EUR")
    assert name_de == "stripe"

def test_routing_indian_to_razorpay():
    service = BillingService()
    provider_in, name_in = service._get_provider_for_request(country="IN", currency="INR")
    assert name_in == "razorpay"
    assert isinstance(provider_in, RazorpayProvider)

    provider_in2, name_in2 = service._get_provider_for_request(country="US", currency="INR")
    assert name_in2 == "razorpay"

def test_create_checkout_stripe():
    service = BillingService()
    user = {"id": str(uuid.uuid4()), "email": "international@example.com"}
    plan = {"id": "pro", "code": "pro", "name": "Pro Plan", "price_amount": 19.99}

    res = service.create_checkout(user, plan, country="US", currency="USD")
    assert res["provider"] == "stripe"
    assert "checkout_url" in res
    assert res["checkout_url"] != ""

def test_create_checkout_razorpay():
    service = BillingService()
    user = {"id": str(uuid.uuid4()), "email": "indian@example.com"}
    plan = {"id": "pro", "code": "pro", "name": "Pro Plan", "price_amount": 1499.00}

    res = service.create_checkout(user, plan, country="IN", currency="INR")
    assert res["provider"] == "razorpay"
    assert "checkout_url" in res
    assert res["subscription_id"] is not None

def test_stripe_webhook_verification(monkeypatch):
    # verify_webhook's test-mode bypass (app/billing/providers/stripe_provider.py)
    # only activates when STRIPE_WEBHOOK_SECRET is unset/blank/"dummy" -- reads
    # os.getenv() at call time, not the pre-instantiated settings singleton, so
    # this test previously relied on incidental test-collection ORDER never
    # having loaded a real .env yet. Any test importing enough of the app
    # (e.g. anything reaching app.ai_service, which calls load_dotenv() as a
    # side effect) run first flips this from a coincidence to a real failure.
    # Pin the precondition explicitly instead of depending on import order.
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    provider = StripeProvider()
    payload = json.dumps({"type": "checkout.session.completed", "data": {"object": {"id": "cs_test"}}}).encode('utf-8')
    event = provider.verify_webhook(payload, "dummy_sig")
    assert event["type"] == "checkout.session.completed"

def test_razorpay_webhook_verification(monkeypatch):
    # Same rationale as test_stripe_webhook_verification above --
    # app/billing/providers/razorpay_provider.py's bypass is equally
    # order-dependent on RAZORPAY_WEBHOOK_SECRET being unset.
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    provider = RazorpayProvider()
    payload = json.dumps({"event": "subscription.charged", "payload": {}}).encode('utf-8')
    event = provider.verify_webhook(payload, "dummy_sig")
    assert event["event"] == "subscription.charged"


# Regression tests for the /verify-session Stripe live-status fallback
# (2026-08-08): unlike Razorpay, Stripe's checkout had no live fallback at
# all -- if its webhook was delayed or never configured for a deployment,
# a genuinely completed payment left the frontend's "Payment in Progress"
# modal spinning until its 2-minute poll timeout instead of resolving
# instantly. fetch_checkout_session mirrors razorpay_provider's
# fetch_subscription pattern, using the session_id Stripe's own success AND
# cancel redirect URLs both already carry (see StripeProvider.create_checkout).

def test_fetch_checkout_session_without_api_key_returns_empty(monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    provider = StripeProvider()
    assert provider.fetch_checkout_session("cs_test_123") == {}


def test_fetch_checkout_session_rejects_unresolved_placeholder(monkeypatch):
    # Defensive guard: the literal, unsubstituted {CHECKOUT_SESSION_ID}
    # template Stripe fills in on redirect must never be sent to Stripe's
    # API as if it were a real session id.
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")
    provider = StripeProvider()
    assert provider.fetch_checkout_session("{CHECKOUT_SESSION_ID}") == {}
    assert provider.fetch_checkout_session("") == {}


def test_fetch_checkout_session_returns_live_status(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")
    provider = StripeProvider()
    fake_session = {
        "status": "complete",
        "payment_status": "paid",
        "subscription": "sub_live_123",
        "client_reference_id": "user-42",
        "metadata": {"plan_id": "pro"},
    }
    with patch("stripe.checkout.Session.retrieve", return_value=fake_session):
        result = provider.fetch_checkout_session("cs_test_real")
    assert result["status"] == "complete"
    assert result["payment_status"] == "paid"
    assert result["client_reference_id"] == "user-42"


def test_fetch_checkout_session_swallows_provider_errors(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")
    provider = StripeProvider()
    with patch("stripe.checkout.Session.retrieve", side_effect=Exception("network down")):
        assert provider.fetch_checkout_session("cs_test_real") == {}


# Regression tests for Razorpay international (non-INR) currency support
# (2026-08-08): a Razorpay Plan is created in ONE fixed currency on the
# Razorpay dashboard, so a currency-blind create_checkout previously either
# silently charged an international card in INR via the India-only plan_id,
# or would be rejected outright by an account without cross-border payments
# enabled. Non-INR requests now look for a currency-suffixed plan id and,
# if none is configured yet (the real-world Razorpay-dashboard setup step
# this code cannot perform on its own), signal that explicitly so
# BillingService can fall back to Stripe instead of mischarging anyone.

def test_razorpay_checkout_defaults_to_existing_inr_plan_lookup(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_key")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    monkeypatch.setenv("RAZORPAY_PLAN_PRO_MONTHLY", "plan_inr_pro")
    provider = RazorpayProvider()
    user = {"id": "u1", "email": "a@example.com"}
    plan = {"id": "pro"}
    with patch.object(provider.client.subscription, "create", return_value={"id": "sub_1", "short_url": "https://rzp.io/sub_1"}) as mock_create:
        result = provider.create_checkout(user, plan, currency="INR")
    assert result["provider"] == "razorpay"
    assert mock_create.call_args.args[0]["plan_id"] == "plan_inr_pro"


def test_razorpay_checkout_uses_currency_suffixed_plan_when_configured(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_key")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    monkeypatch.setenv("RAZORPAY_PLAN_PRO_MONTHLY_USD", "plan_usd_pro")
    provider = RazorpayProvider()
    user = {"id": "u1", "email": "a@example.com"}
    plan = {"id": "pro"}
    with patch.object(provider.client.subscription, "create", return_value={"id": "sub_2", "short_url": "https://rzp.io/sub_2"}) as mock_create:
        result = provider.create_checkout(user, plan, currency="USD")
    assert result["provider"] == "razorpay"
    assert mock_create.call_args.args[0]["plan_id"] == "plan_usd_pro"


def test_razorpay_checkout_signals_unsupported_currency_without_a_configured_plan(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_key")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    for var in ("RAZORPAY_PLAN_PRO_MONTHLY_USD", "RAZORPAY_DEFAULT_PLAN_ID_USD"):
        monkeypatch.delenv(var, raising=False)
    provider = RazorpayProvider()
    result = provider.create_checkout({"id": "u1"}, {"id": "pro"}, currency="USD")
    assert result == {"unsupported_currency": True, "provider": "razorpay"}


def test_billing_service_falls_back_to_stripe_when_razorpay_currency_unsupported(monkeypatch):
    for var in ("RAZORPAY_PLAN_PRO_MONTHLY_USD", "RAZORPAY_DEFAULT_PLAN_ID_USD"):
        monkeypatch.delenv(var, raising=False)
    service = BillingService()
    with patch.object(service.razorpay_provider, "create_checkout", return_value={"unsupported_currency": True, "provider": "razorpay"}):
        result = service.create_checkout(
            user={"id": "u1", "email": "a@example.com"},
            plan={"id": "pro", "code": "pro", "name": "Pro Plan", "price_amount": 19.99},
            country="US",
            currency="USD",
            provider_override="razorpay",
        )
    assert result["provider"] == "stripe"
    assert result["checkout_url"]
