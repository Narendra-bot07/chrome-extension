from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Dict, Any, List
from core.config import settings
from core.database import get_db_connection
from core.security import verify_supabase_jwt
from ..models.schemas import CheckoutRequest, CheckoutResponse, PlanSchema, BillingHistoryResponse, PaymentSchema
from ..services.billing_service import BillingService
from ..services.subscription_service import SubscriptionService
from ..services.credit_service import CreditService
from app.analytics.events.tracking.analytics_service import AnalyticsService

_MOCK_SUBSCRIPTION_IDS = {"sub_mock_stripe_123", "sub_mock_razorpay_123"}

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

    checkout_res = billing_svc.create_checkout(
        user=user,
        plan=plan,
        country=req.country,
        currency=req.currency,
        provider_override=req.provider
    )

    # The provider layer (stripe_provider.py / razorpay_provider.py) falls
    # back to a mock, no-real-payment checkout_url whenever it has no live
    # credentials configured or the live API call itself fails -- there is no
    # real payment behind that URL and never will be a signature-verified
    # webhook for it. Only ever "activate" it here, server-side, when a
    # developer has explicitly opted in for local testing (see
    # ALLOW_MOCK_BILLING_ACTIVATION in core/config.py) -- never reachable from
    # a deployed environment unless someone deliberately sets that flag there.
    # This replaces /verify-session's old behavior of activating ANY plan any
    # caller asked for with no proof of payment at all (KNOWN_ISSUES.md
    # ISSUE-015) -- outside this narrow opt-in, only the signature-verified
    # webhook handlers below may ever call activate_subscription.
    is_mock = checkout_res.get("subscription_id") in _MOCK_SUBSCRIPTION_IDS
    if is_mock and settings.ALLOW_MOCK_BILLING_ACTIVATION:
        sub_svc.activate_subscription(
            user["id"], plan["id"], checkout_res["provider"], checkout_res["subscription_id"]
        )

    return CheckoutResponse(
        checkout_url=checkout_res["checkout_url"],
        provider=checkout_res["provider"],
        subscription_id=checkout_res.get("subscription_id"),
        razorpay_order_id=checkout_res.get("razorpay_order_id"),
        key_id=checkout_res.get("key_id")
    )

@router.post("/verify-session")
async def verify_checkout_session(
    req: Dict[str, Any],
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    sub_svc: SubscriptionService = Depends(get_subscription_service)
):
    """
    Read-only status check, polled by the frontend after a checkout redirect.
    This used to unconditionally activate whatever plan the request asked
    for, with no proof any payment happened (KNOWN_ISSUES.md ISSUE-015) --
    activation now only ever happens inside the signature-verified webhook
    handlers below (or create_checkout's narrow, opt-in-only mock path
    above), so this just reports whatever they have -- or haven't -- already
    written.
    """
    current_sub = sub_svc.get_user_subscription(user["id"])
    plan = sub_svc.get_plan(current_sub["plan_id"]) if current_sub else None
    return {
        "status": "active" if current_sub else "none",
        "plan": plan,
        "subscription": current_sub
    }

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
        
        # stripe_provider.create_checkout() sets metadata.plan_id to the actual
        # purchased plan's id when it creates the Checkout Session -- read it
        # back instead of hardcoding "pro" for every successful checkout
        # regardless of what was actually bought (see KNOWN_ISSUES.md ISSUE-015).
        plan_id = (session.get('metadata') or {}).get('plan_id') or "pro"
        
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
        
        # razorpay_provider.create_checkout() sets notes.plan_id to the actual
        # purchased plan's id when it creates the subscription -- read it back
        # instead of hardcoding "pro" for every successful charge regardless
        # of what was actually bought (see KNOWN_ISSUES.md ISSUE-015).
        plan_id = sub_entity.get('notes', {}).get('plan_id') or "pro"
        plan = sub_svc.get_plan(plan_id)
        if plan:
            sub_svc.activate_subscription(user_id, plan_id, "razorpay", sub_entity['id'])
            credit_svc.add_credits(user_id, payment["id"], plan["credits"], "Razorpay Subscription")
            
            # Emit Analytics Events
            analytics = AnalyticsService(conn)
            analytics.emit_event(user_id, "PAYMENT_SUCCESS", metadata={"provider": "razorpay", "amount": amount, "currency": currency})
            analytics.emit_event(user_id, "SUBSCRIPTION_CREATED", metadata={"provider": "razorpay", "plan": plan_id})
            
    return {"status": "success"}
