from contextlib import contextmanager
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

# Short-lived connection for use OUTSIDE the request-scoped Depends() chain.
# get_subscription_service/get_credit_service below resolve via
# Depends(get_db_connection), which FastAPI caches per-request -- fine for a
# route that only ever does DB work, but every route in this file that also
# calls out to Stripe/Razorpay (real outbound HTTPS, hundreds of ms to
# seconds) held that same pooled connection idle for the whole call. See
# docs/KNOWN_ISSUES.md ISSUE-005 -- this file was the one area that incident's
# sweep never covered. Routes with an external call in the middle now open
# one of these around just the DB work on each side instead.
_db_context = contextmanager(get_db_connection)

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
):
    with _db_context() as conn:
        plan = SubscriptionService(conn).get_plan(req.plan_id)
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
        with _db_context() as conn:
            SubscriptionService(conn).activate_subscription(
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
    billing_svc: BillingService = Depends(get_billing_service),
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
    checkout_status = "pending"
    provider = str(req.get("provider") or "").lower()
    provider_subscription_id = str(req.get("subscription_id") or "")

    # The frontend polls with the exact checkout identifier returned by this
    # API. Query Razorpay as a fallback to asynchronous webhooks so failed,
    # cancelled and expired checkouts do not remain visually pending. Never
    # expose another customer's checkout: its signed provider-side notes must
    # identify the authenticated user before its state is accepted.
    if provider == "razorpay" and provider_subscription_id.startswith("sub_"):
        try:
            provider_sub = billing_svc.fetch_razorpay_subscription(provider_subscription_id)
            notes = provider_sub.get("notes") or {}
            if provider_sub and str(notes.get("user_id") or "") == str(user["id"]):
                provider_status = str(provider_sub.get("status") or "").lower()
                if provider_status in {"active", "authenticated"}:
                    checkout_status = "success"
                elif provider_status in {"cancelled", "expired"}:
                    checkout_status = "cancelled"
                elif provider_status in {"halted"}:
                    checkout_status = "failed"
                else:
                    checkout_status = "pending"
        except Exception:
            # Webhook/database state below remains the safe fallback when the
            # provider API is temporarily unavailable.
            pass

        with _db_context() as conn:
            recorded_payment = SubscriptionService(conn).get_checkout_payment(
                user["id"], "razorpay", provider_subscription_id
            )
        if recorded_payment and str(recorded_payment.get("status") or "").lower() == "failed":
            checkout_status = "failed"

    with _db_context() as conn:
        sub_svc = SubscriptionService(conn)
        current_sub = sub_svc.get_user_subscription(user["id"])
        plan = sub_svc.get_plan(current_sub["plan_id"]) if current_sub else None
    requested_plan = str(req.get("plan_code") or "").lower()
    active_plan = str((plan or {}).get("code") or (plan or {}).get("id") or "").lower()
    if requested_plan and active_plan == requested_plan:
        checkout_status = "success"
    return {
        "status": "active" if current_sub else "none",
        "checkout_status": checkout_status,
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
):
    with _db_context() as conn:
        sub = SubscriptionService(conn).get_user_subscription(user["id"])
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found")

    success = billing_svc.cancel_subscription(sub["provider"], sub["provider_subscription_id"])
    if success:
        with _db_context() as conn:
            SubscriptionService(conn).cancel_subscription(sub["provider_subscription_id"])
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
):
    payload = await request.body()
    sig_header = request.headers.get("x-razorpay-signature")

    try:
        event = billing_svc.verify_razorpay_webhook(payload, sig_header)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    event_name = event.get('event')

    if event_name == 'payment.failed':
        payment_entity = ((event.get('payload') or {}).get('payment') or {}).get('entity') or {}
        provider_subscription_id = None
        invoice_id = payment_entity.get('invoice_id')
        if invoice_id:
            try:
                invoice = billing_svc.fetch_razorpay_invoice(invoice_id)
                provider_subscription_id = invoice.get('subscription_id')
            except Exception:
                provider_subscription_id = None

        if provider_subscription_id:
            try:
                provider_sub = billing_svc.fetch_razorpay_subscription(provider_subscription_id)
            except Exception:
                provider_sub = {}
            user_id = str((provider_sub.get('notes') or {}).get('user_id') or '')
            # Both Razorpay lookups above are now fully resolved -- open the
            # DB connection only for the write, not while those two outbound
            # HTTPS calls were in flight.
            if user_id:
                with _db_context() as conn:
                    SubscriptionService(conn).create_payment(
                        user_id=user_id,
                        provider="razorpay",
                        payment_id=payment_entity.get('id') or f"failed_{provider_subscription_id}",
                        provider_order_id=provider_subscription_id,
                        amount=payment_entity.get('amount', 0) / 100.0,
                        currency=payment_entity.get('currency', 'INR').upper(),
                        status="failed"
                    )
                    analytics = AnalyticsService(conn)
                    analytics.emit_event(user_id, "PAYMENT_FAILED", metadata={
                        "provider": "razorpay",
                        "reason": payment_entity.get('error_reason') or payment_entity.get('error_code')
                    })

    # Successful subscription charge activates access and grants credits.
    # No outbound HTTP calls in this branch -- one connection for the whole
    # branch is fine, same as stripe_webhook above.
    elif event_name == 'subscription.charged':
        sub_entity = event['payload']['subscription']['entity']
        payment_entity = event['payload']['payment']['entity']

        # Retrieve user from notes
        user_id = sub_entity.get('notes', {}).get('user_id')
        if not user_id:
            return {"status": "ignored"}

        amount = payment_entity.get('amount', 0) / 100.0
        currency = payment_entity.get('currency', 'INR').upper()

        with _db_context() as conn:
            sub_svc = SubscriptionService(conn)
            credit_svc = CreditService(conn)
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
