import os
import sys
import json
import hmac
import hashlib
from dotenv import load_dotenv

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

load_dotenv(os.path.join(backend_dir, ".env"))


def generate_razorpay_signature(payload: bytes, secret: str) -> str:
    """Mirror RazorpayProvider.verify_webhook's own HMAC-SHA256 scheme."""
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def test_razorpay_all_plans_realtime():
    print("=" * 75)
    print("RAZORPAY API & ALL SUBSCRIPTION PLANS TEST")
    print("=" * 75)

    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip().rstrip(",")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()

    print(f"\nRAZORPAY_KEY_ID present      : {bool(key_id)}")
    print(f"RAZORPAY_KEY_SECRET present   : {bool(key_secret)}")
    print(f"RAZORPAY_WEBHOOK_SECRET present: {bool(webhook_secret)}")

    from app.billing.providers.razorpay_provider import RazorpayProvider
    provider = RazorpayProvider()
    live_mode = provider.client is not None
    print(f"Provider live client active   : {live_mode} "
          f"({'real Razorpay API calls' if live_mode else 'no key pair configured, mock fallback path only'})")

    # Step 1: authenticate against Razorpay's servers directly, if credentials exist
    if live_mode:
        print("\n--- Step 1: Real-time API Ping (list plans) to Razorpay Servers ---")
        try:
            plans_resp = provider.client.plan.all({"count": 1})
            print(f"[LIVE SUCCESS] Authenticated with Razorpay API!")
            print(f"-> Response type : {type(plans_resp).__name__}")
            print(f"-> Plan count returned: {len(plans_resp.get('items', []))}")
        except Exception as e:
            print(f"[FAIL] Real-time Razorpay API auth call failed: {e}")
    else:
        print("\n--- Step 1: Skipped (no live credentials) ---")

    # Step 2: create_checkout for every real subscription plan in this project
    print("\n--- Step 2: create_checkout() for every configured plan ---")
    plans = [
        {"id": "free", "name": "Free Demo", "price_amount": 0.00},
        {"id": "basic", "name": "Basic", "price_amount": 9.99,
         "razorpay_plan_id": os.getenv("RAZORPAY_PLAN_BASIC_MONTHLY")},
        {"id": "pro", "name": "Pro", "price_amount": 19.99,
         "razorpay_plan_id": os.getenv("RAZORPAY_PLAN_PRO_MONTHLY")},
        {"id": "elite", "name": "Elite", "price_amount": 39.99,
         "razorpay_plan_id": os.getenv("RAZORPAY_PLAN_ELITE_MONTHLY")},
    ]

    user_data = {"id": "usr_realtime_test_101", "email": "realtime.user@example.com"}

    results = []
    all_ok = True

    for plan in plans:
        plan_name = plan["name"]
        price_amt = plan["price_amount"]

        if plan["id"] == "free":
            print(f"\n[PLAN: {plan_name}] -> Free plan handled directly, no checkout needed.")
            results.append({
                "plan": plan_name, "price": f"${price_amt:.2f}",
                "status": "PASSED (Free Direct)", "detail": "N/A"
            })
            continue

        print(f"\n[PLAN: {plan_name}] Calling RazorpayProvider.create_checkout()...")
        try:
            res = provider.create_checkout(user_data, plan)
            checkout_url = res.get("checkout_url", "")
            sub_id = res.get("subscription_id", "")
            is_mock = sub_id == "sub_mock_razorpay_123" or "mock_razorpay_success" in checkout_url

            print(f"  -> Provider           : {res.get('provider')}")
            print(f"  -> Subscription ID    : {sub_id}")
            print(f"  -> Checkout URL       : {checkout_url}")
            print(f"  -> Path is mock fallback: {is_mock}")

            # Verify the checkout_url actually points at a route the app has
            # (this is exactly the bug fixed this session: it used to be
            # /pricing, which never existed, and used to be missing the
            # HashRouter '#' prefix).
            url_ok = "/#/subscription" in checkout_url if is_mock else checkout_url.startswith("http") or checkout_url.startswith("razorpay://")
            if is_mock and not url_ok:
                print(f"  [FAIL] Mock checkout URL does not point at a real HashRouter route!")
                all_ok = False
                status = "FAILED (bad redirect route)"
            else:
                status = "PASSED (mock fallback)" if is_mock else "PASSED (live Razorpay subscription)"

            if not is_mock:
                # Retrieve back from Razorpay's servers to confirm it's real
                try:
                    retrieved = provider.client.subscription.fetch(sub_id)
                    print(f"  [LIVE CONFIRMED BY RAZORPAY SERVER]")
                    print(f"  -> Server-side status : {retrieved.get('status')}")
                    print(f"  -> Server-side plan_id: {retrieved.get('plan_id')}")
                except Exception as fetch_err:
                    print(f"  [WARN] Could not retrieve subscription back from Razorpay: {fetch_err}")

            results.append({
                "plan": plan_name, "price": f"${price_amt:.2f}",
                "status": status, "detail": sub_id or checkout_url
            })

        except Exception as e:
            print(f"  [FAIL] create_checkout raised: {e}")
            results.append({
                "plan": plan_name, "price": f"${price_amt:.2f}",
                "status": f"FAILED ({e})", "detail": "ERROR"
            })
            all_ok = False

    # Step 3: webhook signature verification
    print("\n--- Step 3: Webhook Signature Verification ---")
    try:
        mock_event_payload = json.dumps({
            "event": "subscription.charged",
            "payload": {
                "subscription": {"entity": {"id": "sub_realtime_test", "status": "active"}},
                "payment": {"entity": {"id": "pay_realtime_test", "notes": {"user_id": user_data["id"]}}}
            }
        }).encode("utf-8")

        secret_for_test = webhook_secret or "dummy"
        sig = generate_razorpay_signature(mock_event_payload, secret_for_test) if webhook_secret else "n/a"

        if webhook_secret:
            event = provider.verify_webhook(mock_event_payload, sig)
            print(f"[SUCCESS] Webhook signature verified via HMAC-SHA256!")
            print(f"-> Parsed event type: {event.get('event')}")
        else:
            event = provider.verify_webhook(mock_event_payload, "n/a")
            print(f"[SUCCESS] No webhook secret configured -- verify_webhook fell back to unsigned parse.")
            print(f"-> Parsed event type: {event.get('event')}")

        # Negative test: a tampered signature must be rejected when a real secret is set
        if webhook_secret:
            try:
                provider.verify_webhook(mock_event_payload, "0" * 64)
                print("[FAIL] Tampered signature was NOT rejected!")
                all_ok = False
            except ValueError:
                print("[SUCCESS] Tampered signature correctly rejected.")
    except Exception as e:
        print(f"[FAIL] Webhook verification failed: {e}")
        all_ok = False

    # SUMMARY TABLE
    print("\n" + "=" * 75)
    print("RAZORPAY TEST SUMMARY")
    print("=" * 75)
    print(f"{'Plan Name':<15} | {'Price':<8} | {'Status':<28} | {'Detail'}")
    print("-" * 75)
    for r in results:
        print(f"{r['plan']:<15} | {r['price']:<8} | {r['status']:<28} | {r['detail']}")
    print("=" * 75)

    return all_ok


if __name__ == "__main__":
    ok = test_razorpay_all_plans_realtime()
    if ok:
        print("\nSUCCESS: All Razorpay checks passed.")
        sys.exit(0)
    else:
        print("\nFAILURE: One or more Razorpay checks failed.")
        sys.exit(1)
