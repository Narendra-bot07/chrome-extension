import stripe
import os
from typing import Dict, Any
from .base_provider import BaseProvider

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

class StripeProvider(BaseProvider):
    
    def create_checkout(self, user: Dict[str, Any], plan: Dict[str, Any]) -> str:
        if not stripe.api_key:
            return "https://buy.stripe.com/test_dummy" # Fallback for local testing if no keys

        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price': plan.get("stripe_price_id") or os.getenv("STRIPE_DEFAULT_PRICE_ID"),
                'quantity': 1,
            }],
            mode='subscription',
            success_url=f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/profile?payment=success",
            cancel_url=f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/profile?payment=cancelled",
            client_reference_id=user["id"],
            customer_email=user["email"]
        )
        return session.url

    def verify_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        if not endpoint_secret:
            raise ValueError("Stripe webhook secret not configured")
        
        try:
            event = stripe.Webhook.construct_event(
                payload, signature, endpoint_secret
            )
            return event
        except Exception as e:
            raise ValueError(f"Invalid Stripe payload or signature: {e}")

    def cancel_subscription(self, provider_subscription_id: str) -> bool:
        if not stripe.api_key:
            return True
        try:
            stripe.Subscription.modify(
                provider_subscription_id,
                cancel_at_period_end=True
            )
            return True
        except Exception as e:
            print(f"Error canceling Stripe subscription: {e}")
            return False
