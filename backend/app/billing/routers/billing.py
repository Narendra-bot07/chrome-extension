from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Dict, Any, List
from core.database import get_db_connection
from core.security import verify_supabase_jwt
from ..models.schemas import CheckoutRequest, CheckoutResponse, PlanSchema, BillingHistoryResponse, PaymentSchema
from ..services.billing_service import BillingService
from ..services.subscription_service import SubscriptionService
from ..services.credit_service import CreditService
from app.analytics.events.tracking.analytics_service import AnalyticsService

router = APIRouter(prefix="/billing", tags=["billing"])

def get_billing_service():
    return BillingService()

def get_subscription_service(conn = Depends(get_db_connection)):
    return SubscriptionService(conn)

def get_credit_service(conn = Depends(get_db_connection)):
    return CreditService(conn)

@router.get("/plans", response_model=List[PlanSchema])
async def get_plans(sub_svc: SubscriptionService = Depends(get_subscription_service)):
    return sub_svc.get_all_plans()

@router.post("/create-checkout", response_model=CheckoutResponse)
async def create_checkout(
    req: CheckoutRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    billing_svc: BillingService = Depends(get_billing_service),
    sub_svc: SubscriptionService = Depends(get_subscription_service)
):
    plan = sub_svc.get_plan(req.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    checkout_url, provider = billing_svc.create_checkout(user, plan, req.country)
    return CheckoutResponse(checkout_url=checkout_url, provider=provider)

@router.get("/history", response_model=BillingHistoryResponse)
async def get_history(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    sub_svc: SubscriptionService = Depends(get_subscription_service)
):
    payments = sub_svc.get_payment_history(user["id"])
    return BillingHistoryResponse(payments=payments)

@router.post("/cancel")
async def cancel_subscription(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    billing_svc: BillingService = Depends(get_billing_service),
    sub_svc: SubscriptionService = Depends(get_subscription_service)
):
    sub = sub_svc.get_user_subscription(user["id"])
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found")
        
    success = billing_svc.cancel_subscription(sub["provider"], sub["provider_subscription_id"])
    if success:
        sub_svc.cancel_subscription(sub["provider_subscription_id"])
        return {"status": "success", "message": "Subscription canceled"}
    else:
        raise HTTPException(status_code=500, detail="Failed to cancel with provider")

@router.post("/webhook/stripe")
async def stripe_webhook(
    request: Request,
    billing_svc: BillingService = Depends(get_billing_service),
    sub_svc: SubscriptionService = Depends(get_subscription_service),
    credit_svc: CreditService = Depends(get_credit_service),
    conn = Depends(get_db_connection)
):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    try:
        event = billing_svc.verify_stripe_webhook(payload, sig_header)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # Handle event
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session.get('client_reference_id')
        
        # Payment details
        payment_intent = session.get('payment_intent', 'pi_unknown')
        amount = session.get('amount_total', 0) / 100.0
        currency = session.get('currency', 'usd').upper()
        
        # Try to find plan_id. In real scenarios, usually pass plan_id in metadata
        # For simplicity, assuming PRO plan on success unless specified
        plan_id = "pro"
        
        # Log payment idempotently
        payment = sub_svc.create_payment(
            user_id=user_id,
            provider="stripe",
            payment_id=payment_intent,
            amount=amount,
            currency=currency,
            status="success"
        )
        
        plan = sub_svc.get_plan(plan_id)
        if plan:
            sub_id = session.get('subscription', f'sub_mock_{payment_intent}')
            sub_svc.activate_subscription(user_id, plan_id, "stripe", sub_id)
            credit_svc.add_credits(user_id, payment["id"], plan["credits"], "Stripe Subscription")
            
            # Emit Analytics Events
            analytics = AnalyticsService(conn)
            analytics.emit_event(user_id, "PAYMENT_SUCCESS", metadata={"provider": "stripe", "amount": amount, "currency": currency})
            analytics.emit_event(user_id, "SUBSCRIPTION_CREATED", metadata={"provider": "stripe", "plan": plan_id})
            
    return {"status": "success"}

@router.post("/webhook/razorpay")
async def razorpay_webhook(
    request: Request,
    billing_svc: BillingService = Depends(get_billing_service),
    sub_svc: SubscriptionService = Depends(get_subscription_service),
    credit_svc: CreditService = Depends(get_credit_service),
    conn = Depends(get_db_connection)
):
    payload = await request.body()
    sig_header = request.headers.get("x-razorpay-signature")
    
    try:
        event = billing_svc.verify_razorpay_webhook(payload, sig_header)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # Example handling for Razorpay
    if event.get('event') == 'subscription.charged':
        sub_entity = event['payload']['subscription']['entity']
        payment_entity = event['payload']['payment']['entity']
        
        # Retrieve user from notes
        user_id = sub_entity.get('notes', {}).get('user_id')
        if not user_id:
            return {"status": "ignored"}
            
        amount = payment_entity.get('amount', 0) / 100.0
        currency = payment_entity.get('currency', 'INR').upper()
        
        payment = sub_svc.create_payment(
            user_id=user_id,
            provider="razorpay",
            payment_id=payment_entity['id'],
            amount=amount,
            currency=currency,
            status="success"
        )
        
        # Assuming we passed plan logic or mapped via Razorpay Plan ID
        plan_id = "pro"
        plan = sub_svc.get_plan(plan_id)
        if plan:
            sub_svc.activate_subscription(user_id, plan_id, "razorpay", sub_entity['id'])
            credit_svc.add_credits(user_id, payment["id"], plan["credits"], "Razorpay Subscription")
            
            # Emit Analytics Events
            analytics = AnalyticsService(conn)
            analytics.emit_event(user_id, "PAYMENT_SUCCESS", metadata={"provider": "razorpay", "amount": amount, "currency": currency})
            analytics.emit_event(user_id, "SUBSCRIPTION_CREATED", metadata={"provider": "razorpay", "plan": plan_id})
            
    return {"status": "success"}
