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
