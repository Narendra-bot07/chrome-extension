import razorpay
import os
import hmac
import hashlib
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

    def create_checkout(self, user: Dict[str, Any], plan: Dict[str, Any]) -> str:
        # Razorpay handles subscriptions differently. Usually we create a subscription
        # and then return the subscription ID to the frontend to open the Razorpay Checkout modal.
        # For uniformity, we'll return a special URL format or just the ID.
        if not self.client:
            return "razorpay://dummy_sub_id"
            
        try:
            subscription = self.client.subscription.create({
                "plan_id": plan.get("razorpay_plan_id") or os.getenv("RAZORPAY_DEFAULT_PLAN_ID"),
                "customer_notify": 1,
                "total_count": 12, # E.g., 1 year
                "notes": {
                    "user_id": user["id"],
                    "email": user["email"]
                }
            })
            # We return a custom scheme URL that the frontend will interpret to open Razorpay modal
            return f"razorpay://{subscription['id']}"
        except Exception as e:
            print(f"Razorpay subscription creation failed: {e}")
            return "razorpay://error"

    def verify_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET")
        if not webhook_secret:
            raise ValueError("Razorpay webhook secret not configured")
        
        expected_signature = hmac.new(
            webhook_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected_signature, signature):
            raise ValueError("Invalid Razorpay webhook signature")
            
        import json
        return json.loads(payload.decode('utf-8'))

    def cancel_subscription(self, provider_subscription_id: str) -> bool:
        if not self.client:
            return True
        try:
            self.client.subscription.cancel(provider_subscription_id)
            return True
        except Exception as e:
            print(f"Error canceling Razorpay subscription: {e}")
            return False
