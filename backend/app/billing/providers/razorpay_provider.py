import razorpay
import os
import hmac
import hashlib
import json
from typing import Dict, Any
from .base_provider import BaseProvider

class RazorpayProvider(BaseProvider):
    def __init__(self):
        raw_key = os.getenv("RAZORPAY_KEY_ID") or ""
        self.key_id = raw_key.strip().rstrip(",")
        self.key_secret = (os.getenv("RAZORPAY_KEY_SECRET") or "").strip()
        if self.key_id and self.key_secret:
            self.client = razorpay.Client(auth=(self.key_id, self.key_secret))
        else:
            self.client = None

    def create_checkout(self, user: Dict[str, Any], plan: Dict[str, Any], currency: str = "INR") -> Dict[str, Any]:
        if not self.client:
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
            return {
                "checkout_url": f"{frontend_url}/#/subscription?payment=mock_razorpay_success&plan_id={plan.get('id')}",
                "provider": "razorpay",
                "subscription_id": "sub_mock_razorpay_123",
                "key_id": "rzp_test_mock123"
            }

        plan_key = str(plan.get("id") or "").lower()
        # A Razorpay Plan object is created in ONE fixed currency on the
        # Razorpay dashboard -- there is no per-request currency override on
        # the Subscription API, so a genuinely different-currency checkout
        # needs its own, separately-configured Plan id. Existing
        # RAZORPAY_PLAN_*_MONTHLY vars are INR (the original India-only
        # design); non-INR requests look for a currency-suffixed sibling var
        # instead of silently reusing the INR plan (which would either charge
        # an international card the wrong amount or be rejected outright by
        # an account without cross-border payments enabled).
        currency_upper = (currency or "INR").upper()
        suffix = "" if currency_upper == "INR" else f"_{currency_upper}"
        plan_id = plan.get("razorpay_plan_id") if not suffix else None
        if not plan_id:
            if "basic" in plan_key or "free" in plan_key:
                plan_id = os.getenv(f"RAZORPAY_PLAN_BASIC_MONTHLY{suffix}")
            elif "elite" in plan_key or "premium" in plan_key:
                plan_id = os.getenv(f"RAZORPAY_PLAN_ELITE_MONTHLY{suffix}")
            else:
                plan_id = os.getenv(f"RAZORPAY_PLAN_PRO_MONTHLY{suffix}")
        if not plan_id:
            plan_id = os.getenv(f"RAZORPAY_DEFAULT_PLAN_ID{suffix}")
        if not plan_id:
            if suffix:
                # No Razorpay plan has been configured for this currency yet
                # (a real Razorpay-dashboard setup step, not something this
                # code can create on its own) -- signal it explicitly so the
                # caller can fall back to a provider that DOES support this
                # currency instead of silently defaulting to the INR plan_id
                # below and mischarging/rejecting an international payment.
                return {"unsupported_currency": True, "provider": "razorpay"}
            plan_id = "plan_TKvwof7YNDV9kh"

        try:
            subscription = self.client.subscription.create({
                "plan_id": plan_id,
                "customer_notify": 1,
                "total_count": 12,
                "notes": {
                    "user_id": str(user["id"]),
                    "email": str(user.get("email", "")),
                    "plan_id": str(plan.get("id", "pro"))
                }
            })
            sub_id = subscription["id"]
            short_url = subscription.get("short_url")
            checkout_url = short_url if (short_url and str(short_url).startswith("http")) else f"razorpay://{sub_id}"
            return {
                "checkout_url": checkout_url,
                "provider": "razorpay",
                "subscription_id": sub_id,
                "key_id": self.key_id
            }
        except Exception as e:
            print(f"Razorpay subscription creation failed: {e}")
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
            return {
                "checkout_url": f"{frontend_url}/#/subscription?payment=mock_razorpay_success&plan_id={plan.get('id')}",
                "provider": "razorpay",
                "subscription_id": "sub_mock_razorpay_123",
                "key_id": self.key_id or "rzp_test_mock123"
            }

    def verify_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET")
        if not webhook_secret or webhook_secret == "dummy":
            try:
                return json.loads(payload.decode('utf-8'))
            except Exception:
                raise ValueError("Invalid Razorpay payload format")

        expected_signature = hmac.new(
            webhook_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, signature):
            raise ValueError("Invalid Razorpay webhook signature")

        return json.loads(payload.decode('utf-8'))

    def fetch_subscription(self, provider_subscription_id: str) -> Dict[str, Any]:
        """Fetch the authoritative Razorpay subscription state."""
        if not self.client or not provider_subscription_id or provider_subscription_id.startswith("sub_mock"):
            return {}
        return dict(self.client.subscription.fetch(provider_subscription_id))

    def fetch_invoice(self, invoice_id: str) -> Dict[str, Any]:
        if not self.client or not invoice_id:
            return {}
        return dict(self.client.invoice.fetch(invoice_id))

    def cancel_subscription(self, provider_subscription_id: str) -> bool:
        if not self.client or provider_subscription_id.startswith("sub_mock"):
            return True
        try:
            self.client.subscription.cancel(provider_subscription_id)
            return True
        except Exception as e:
            print(f"Error canceling Razorpay subscription: {e}")
            return False
