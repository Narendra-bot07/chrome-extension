from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseProvider(ABC):
    
    @abstractmethod
    def create_checkout(self, user: Dict[str, Any], plan: Dict[str, Any]) -> str:
        """
        Create a checkout session/order and return the URL or ID required by the frontend.
        """
        pass

    @abstractmethod
    def verify_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        """
        Verify the webhook signature and return the parsed event.
        Raises an exception if verification fails.
        """
        pass

    @abstractmethod
    def cancel_subscription(self, provider_subscription_id: str) -> bool:
        """
        Cancel the active subscription at the provider level.
        """
        pass
