from typing import Dict, Any, Tuple, Optional
from ..providers.base_provider import BaseProvider
from ..providers.stripe_provider import StripeProvider
from ..providers.razorpay_provider import RazorpayProvider

class BillingService:
    def __init__(self):
        self.stripe_provider = StripeProvider()
        self.razorpay_provider = RazorpayProvider()

    def _get_provider_for_request(
        self,
        country: Optional[str] = None,
        currency: Optional[str] = None,
        provider_override: Optional[str] = None
    ) -> Tuple[BaseProvider, str]:
        """
        Routing logic:
        - If provider_override is specified ('stripe' or 'razorpay'), use that provider.
        - If country is 'IN' or currency is 'INR', use Razorpay (Indian payments).
        - Otherwise, use Stripe (International payments).
        """
        if provider_override and provider_override.lower() in ("stripe", "razorpay"):
            p_name = provider_override.lower()
            return (self.razorpay_provider if p_name == "razorpay" else self.stripe_provider), p_name

        c_upper = (country or "").upper()
        curr_upper = (currency or "").upper()

        if c_upper == "IN" or curr_upper == "INR":
            return self.razorpay_provider, "razorpay"
        
        return self.stripe_provider, "stripe"

    def create_checkout(
        self,
        user: Dict[str, Any],
        plan: Dict[str, Any],
        country: Optional[str] = "US",
        currency: Optional[str] = "USD",
        provider_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Determines provider and creates checkout.
        Returns dict with checkout_url, provider, key_id, etc.
        """
        provider_inst, provider_name = self._get_provider_for_request(country, currency, provider_override)
        if provider_name == "razorpay":
            checkout_res = provider_inst.create_checkout(user, plan, currency=currency or "INR")
            # No Razorpay Plan is configured for this currency (see
            # razorpay_provider.create_checkout) -- an explicit Razorpay
            # request (e.g. the user picked it manually) must still result
            # in a WORKING checkout rather than a silent INR mischarge, so
            # fall back to Stripe, which already handles arbitrary
            # currencies via its own price_data path.
            if isinstance(checkout_res, dict) and checkout_res.get("unsupported_currency"):
                provider_inst = self.stripe_provider
                provider_name = "stripe"
                checkout_res = provider_inst.create_checkout(user, plan)
        else:
            checkout_res = provider_inst.create_checkout(user, plan)

        if isinstance(checkout_res, dict):
            url = checkout_res.get("checkout_url") or checkout_res.get("url") or ""
            sub_id = checkout_res.get("subscription_id")
            order_id = checkout_res.get("razorpay_order_id")
            key_id = checkout_res.get("key_id")
        else:
            url = str(checkout_res)
            sub_id = url.replace("razorpay://", "") if url.startswith("razorpay://") else None
            order_id = None
            key_id = getattr(provider_inst, "key_id", None)

        return {
            "checkout_url": url,
            "provider": provider_name,
            "subscription_id": sub_id,
            "razorpay_order_id": order_id,
            "key_id": key_id
        }

    def verify_stripe_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        return self.stripe_provider.verify_webhook(payload, signature)
        
    def verify_razorpay_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        return self.razorpay_provider.verify_webhook(payload, signature)

    def fetch_razorpay_subscription(self, provider_subscription_id: str) -> Dict[str, Any]:
        return self.razorpay_provider.fetch_subscription(provider_subscription_id)

    def fetch_razorpay_invoice(self, invoice_id: str) -> Dict[str, Any]:
        return self.razorpay_provider.fetch_invoice(invoice_id)

    def fetch_stripe_checkout_session(self, session_id: str) -> Dict[str, Any]:
        return self.stripe_provider.fetch_checkout_session(session_id)

    def cancel_subscription(self, provider: str, provider_subscription_id: str) -> bool:
        if provider == "razorpay":
            return self.razorpay_provider.cancel_subscription(provider_subscription_id)
        return self.stripe_provider.cancel_subscription(provider_subscription_id)
