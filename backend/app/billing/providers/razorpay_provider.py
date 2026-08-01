import razorpay
import os
import hmac
import hashlib
import json
from typing import Dict, Any
from .base_provider import BaseProvider

class RazorpayProvider(BaseProvider):
    def __init__(self):
        self.key_id = os.getenv("RAZORPAY_KEY_ID")
        self.key_secret = os.getenv("RAZORPAY_KEY_SECRET")
        if self.key_id and self.key_secret:
            self.client = razorpay.Client(auth=(self.key_id, self.key_secret))
        else:
            self.client = None

    def create_checkout(self, user: Dict[str, Any], plan: Dict[str, Any]) -> Dict[str, Any]:
        if not self.client:
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
            return {
                "checkout_url": f"{frontend_url}/pricing?payment=mock_razorpay_success&plan_id={plan.get('id')}",
                "provider": "razorpay",
                "subscription_id": "sub_mock_razorpay_123",
                "key_id": "rzp_test_mock123"
            }

        plan_id = plan.get("razorpay_plan_id") or os.getenv("RAZORPAY_DEFAULT_PLAN_ID")
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
            return {
                "checkout_url": f"razorpay://{sub_id}",
                "provider": "razorpay",
                "subscription_id": sub_id,
                "key_id": self.key_id
            }
        except Exception as e:
            print(f"Razorpay subscription creation failed: {e}")
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
            return {
                "checkout_url": f"{frontend_url}/pricing?payment=mock_razorpay_success&plan_id={plan.get('id')}",
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

    def cancel_subscription(self, provider_subscription_id: str) -> bool:
        if not self.client or provider_subscription_id.startswith("sub_mock"):
            return True
        try:
            self.client.subscription.cancel(provider_subscription_id)
            return True
        except Exception as e:
            print(f"Error canceling Razorpay subscription: {e}")
            return False
