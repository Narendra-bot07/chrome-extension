from typing import Dict, Any, Tuple
from ..providers.base_provider import BaseProvider
from ..providers.stripe_provider import StripeProvider
from ..providers.razorpay_provider import RazorpayProvider

class BillingService:
    def __init__(self):
        self.stripe_provider = StripeProvider()
        self.razorpay_provider = RazorpayProvider()

    def _get_provider_for_country(self, country: str) -> Tuple[BaseProvider, str]:
        """
        Routing logic: India uses Razorpay, rest of the world uses Stripe.
        """
        if country.upper() == "IN":
            return self.razorpay_provider, "razorpay"
        return self.stripe_provider, "stripe"

    def create_checkout(self, user: Dict[str, Any], plan: Dict[str, Any], country: str = "US") -> Tuple[str, str]:
        """
        Determines provider and creates checkout.
        Returns Tuple[checkout_url, provider_name]
        """
        provider, provider_name = self._get_provider_for_country(country)
        checkout_url = provider.create_checkout(user, plan)
        return checkout_url, provider_name

    def verify_stripe_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        return self.stripe_provider.verify_webhook(payload, signature)
        
    def verify_razorpay_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        return self.razorpay_provider.verify_webhook(payload, signature)

    def cancel_subscription(self, provider: str, provider_subscription_id: str) -> bool:
        if provider == "razorpay":
            return self.razorpay_provider.cancel_subscription(provider_subscription_id)
        return self.stripe_provider.cancel_subscription(provider_subscription_id)
