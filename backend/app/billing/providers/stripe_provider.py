import stripe
import os
from typing import Dict, Any, Union
from .base_provider import BaseProvider

class StripeProvider(BaseProvider):
    def __init__(self):
        self.api_key = os.getenv("STRIPE_SECRET_KEY")
        if self.api_key:
            stripe.api_key = self.api_key

    def create_checkout(self, user: Dict[str, Any], plan: Dict[str, Any]) -> Dict[str, Any]:
        if not self.api_key:
            frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
            return {
                "checkout_url": f"{frontend_url}/pricing?payment=mock_stripe_success&plan_id={plan.get('id')}",
                "provider": "stripe",
                "subscription_id": "sub_mock_stripe_123"
            }

        plan_key = str(plan.get("id") or "").lower()
        price_id = plan.get("stripe_price_id")
        if not price_id:
            if "basic" in plan_key or "free" in plan_key:
                price_id = os.getenv("STRIPE_PRICE_BASIC_MONTHLY")
            elif "elite" in plan_key or "premium" in plan_key:
                price_id = os.getenv("STRIPE_PRICE_ELITE_MONTHLY")
            else:
                price_id = os.getenv("STRIPE_PRICE_PRO_MONTHLY")
        if not price_id:
            price_id = os.getenv("STRIPE_DEFAULT_PRICE_ID")

        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        
        session = None
        if price_id:
            try:
                session = stripe.checkout.Session.create(
                    payment_method_types=['card'],
                    line_items=[{'price': price_id, 'quantity': 1}],
                    mode='subscription',
                    success_url=f"{frontend_url}/#/subscription?payment=success&provider=stripe&session_id={{CHECKOUT_SESSION_ID}}",
                    cancel_url=f"{frontend_url}/#/subscription?payment=cancelled",
                    client_reference_id=str(user["id"]),
                    customer_email=user.get("email"),
                    metadata={
                        "user_id": str(user["id"]),
                        "plan_id": str(plan.get("id", "pro")),
                        "email": str(user.get("email", ""))
                    }
                )
            except stripe.error.InvalidRequestError:
                session = None

        if not session:
            amount = int(plan.get("price_amount", 19.99) * 100)
            currency = plan.get("currency", "usd").lower()
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': currency,
                        'product_data': {
                            'name': plan.get("name", "Tailr4U Subscription"),
                        },
                        'unit_amount': amount,
                        'recurring': {'interval': 'month'}
                    },
                    'quantity': 1,
                }],
                mode='subscription',
                success_url=f"{frontend_url}/#/subscription?payment=success&provider=stripe&session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{frontend_url}/#/subscription?payment=cancelled",
                client_reference_id=str(user["id"]),
                customer_email=user.get("email"),
                metadata={
                    "user_id": str(user["id"]),
                    "plan_id": str(plan.get("id", "pro")),
                    "email": str(user.get("email", ""))
                }
            )
        sub_id = getattr(session, "subscription", None) or (session.get("subscription") if hasattr(session, "get") else None)
        checkout_url = getattr(session, "url", "") or (session.get("url") if hasattr(session, "get") else "")
        return {
            "checkout_url": checkout_url,
            "provider": "stripe",
            "subscription_id": sub_id
        }

    def verify_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        if not endpoint_secret or endpoint_secret == "dummy":
            import json
            try:
                data = json.loads(payload.decode('utf-8'))
                return data
            except Exception:
                raise ValueError("Invalid Stripe payload format")

        try:
            event = stripe.Webhook.construct_event(
                payload, signature, endpoint_secret
            )
            return event
        except Exception as e:
            raise ValueError(f"Invalid Stripe payload or signature: {e}")

    def cancel_subscription(self, provider_subscription_id: str) -> bool:
        if not self.api_key or provider_subscription_id.startswith("sub_mock"):
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
