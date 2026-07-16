from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CheckoutRequest(BaseModel):
    plan_id: str
    country: str = "US" # Used for determining provider

class CheckoutResponse(BaseModel):
    checkout_url: str
    provider: str

class PlanSchema(BaseModel):
    id: str
    name: str
    price: float
    currency: str
    credits: int
    billing_cycle: str
    is_active: bool

class SubscriptionSchema(BaseModel):
    id: str
    plan_id: str
    provider: str
    status: str
    started_at: Optional[datetime]
    expires_at: Optional[datetime]
    cancel_at_period_end: bool

class PaymentSchema(BaseModel):
    id: str
    amount: float
    currency: str
    status: str
    invoice_url: Optional[str]
    receipt_url: Optional[str]
    created_at: datetime
    provider: str

class BillingHistoryResponse(BaseModel):
    payments: List[PaymentSchema]
