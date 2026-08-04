import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useApp } from '../context/AppContext';
import { createCheckoutSession } from '../services/subscriptionApi';
import { PaymentModal } from '../components/PaymentModal';
import { PaymentStatusModal } from '../components/modals/PaymentStatusModal';
import { useTailr4uReducedMotion } from '../motion/MotionSystem';
import { fetchLiveUsdToInrRate, convertUsdToInrSync, formatInrPrice } from '../utils/currencyConverter';
import './SubscriptionPage.css';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPrice(plan, usdToInrRate = 86.5) {
  const interval = plan.billing_interval || 'month';
  const amount = typeof plan.price_amount === 'number' ? plan.price_amount : (typeof plan.price === 'number' ? plan.price : 0);
  if (amount > 0) {
    const formattedUsd = `$${amount.toFixed(2)}`;
    const inrVal = Math.round(amount * usdToInrRate);
    const formattedInr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inrVal);
    return {
      usd: `${formattedUsd}/${interval}`,
      inr: `${formattedInr}/${interval}`
    };
  }
  return { usd: `$0/month`, inr: `₹0/month` };
}

function normalizeFeatures(features) {
  if (Array.isArray(features)) return features;
  return Object.entries(features || {})
    .filter(([, feature]) => feature?.enabled)
    .map(([key, feature]) => ({
      key,
      label: key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      limit: feature.limit,
      enabled: true
    }));
}

export default function SubscriptionPage() {
  const reducedMotion = useTailr4uReducedMotion();
  const [searchParams] = useSearchParams();
  const { apiUrl, session } = useApp();
  const [spreadCards, setSpreadCards] = useState(reducedMotion);
  const { subscription, plans, loading, error, refresh } = useSubscription();
  const [usdToInrRate, setUsdToInrRate] = useState(86.5);

  useEffect(() => {
    fetchLiveUsdToInrRate().then(rate => setUsdToInrRate(rate));
  }, []);

  const [checkoutModalPlan, setCheckoutModalPlan] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [paymentBanner, setPaymentBanner] = useState(null);
  const [paymentStatusModal, setPaymentStatusModal] = useState({
    isOpen: false,
    status: 'pending', // 'pending' | 'success' | 'failed' | 'cancelled'
    targetPlanName: ''
  });

  const jdUsage = subscription?.usage?.jd_extraction;
  const limit = jdUsage?.limit;
  const used = jdUsage?.used || 0;
  const remaining = jdUsage?.remaining;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const currentPlanCode = subscription?.plan?.code || subscription?.plan_code || 'free';
  const currentPlan = plans.find((plan) => plan.code === currentPlanCode);
  const currentSortOrder = currentPlan?.sort_order ?? 0;
  const availablePlans = plans.filter((plan) => {
    const code = (plan.code || '').toLowerCase();
    const price = typeof plan.price_amount === 'number' ? plan.price_amount : (plan.price || 0);
    return code !== 'free' && code !== 'trial' && price > 0;
  });
  const usageItems = [
    ['JD extractions', subscription?.usage?.jd_extraction],
    ['Tailored resumes', subscription?.usage?.resume_generation],
    ['Cover letters', subscription?.usage?.cover_letter_generation],
    ['Resume uploads', subscription?.usage?.resume_upload]
  ];

  // /verify-session is now a read-only status check -- it reports whatever
  // the signature-verified payment webhooks have (or haven't) already
  // written, it never activates anything itself (see KNOWN_ISSUES.md
  // ISSUE-015). So a call here only means "the request didn't error", NOT
  // "the plan is now active" -- only flip the modal to 'success' once the
  // response actually shows the target plan is live. Otherwise leave the
  // status untouched so the existing pending-poll effect (below) keeps
  // retrying and eventually surfaces an honest "unknown" after its timeout,
  // instead of a fabricated success for a payment that never happened.
  const handleVerifyAndActivate = useCallback(async (targetPlanCode) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return false;
    try {
      const res = await fetch(`${apiUrl}/api/v1/billing/verify-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan_code: targetPlanCode || 'pro' })
      });
      const data = await res.json().catch(() => null);
      await refresh();

      const wantedCode = String(targetPlanCode || '').toLowerCase();
      const activeCode = String(data?.plan?.code || data?.plan?.id || '').toLowerCase();
      const matches = Boolean(wantedCode) && Boolean(activeCode) && activeCode === wantedCode;

      if (matches) {
        setPaymentStatusModal(prev => ({
          ...prev,
          status: 'success',
          targetPlanName: data.plan?.name || targetPlanCode || prev.targetPlanName || 'Pro'
        }));
      }
      return matches;
    } catch (e) {
      console.error('Session verify failed:', e);
      refresh();
      return false;
    }
  }, [apiUrl, refresh, session?.access_token]);

  // Check URL parameters & cross-tab events for payment completion.
  // `window.location.search` is ALWAYS empty here -- this whole app uses
  // HashRouter (App.jsx), so a query string on a redirect like
  // /#/subscription?payment=...&plan_id=... lives inside window.location.hash,
  // not before it. Reading it via window.location.search meant this effect
  // could never actually detect a payment redirect; the "Payment in Progress"
  // modal then depended entirely on the 2-second polling fallback (or a
  // cross-tab broadcast from a popup tab) to ever resolve, and could sit on
  // "pending" far longer than necessary -- or indefinitely, if that polling
  // call itself failed. useSearchParams() correctly reads the query string
  // React Router parsed out of the hash.
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success' || paymentStatus?.includes('success')) {
      // A redirect back with payment=success only means the checkout page
      // itself completed (or, for the mock fallback, that there was never a
      // real checkout to complete) -- it is NOT proof the plan is actually
      // active, which only the signature-verified webhook can establish.
      // Say so honestly here; handleVerifyAndActivate (and the pending-poll
      // effect below, already wired to keep calling it) flips the modal to
      // a real 'success' once the webhook has actually landed, or to
      // 'unknown' if it times out without ever landing.
      handleVerifyAndActivate(searchParams.get('plan_id') || 'pro');
      setPaymentBanner({
        type: 'info',
        message: 'Confirming your payment…'
      });
      try {
        const bc = new BroadcastChannel('payment_channel');
        bc.postMessage({ type: 'PAYMENT_SUCCESS', plan: searchParams.get('plan_id') || 'pro' });
        bc.close();
      } catch (e) {}
    } else if (paymentStatus === 'cancelled') {
      setPaymentStatusModal({
        isOpen: true,
        status: 'cancelled',
        targetPlanName: ''
      });
      setPaymentBanner({
        type: 'info',
        message: 'Payment was cancelled. You can retry upgrading anytime.'
      });
    }
  }, [searchParams, handleVerifyAndActivate]);

  // Listen to cross-tab payment broadcasts & storage events
  useEffect(() => {
    let bc;
    try {
      bc = new BroadcastChannel('payment_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'PAYMENT_SUCCESS') {
          handleVerifyAndActivate(event.data?.plan);
        }
      };
    } catch (e) {}

    const handleStorage = (e) => {
      if (e.key === 'payment_event' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.status === 'success') {
            handleVerifyAndActivate(parsed.planName);
          }
        } catch (err) {}
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [handleVerifyAndActivate]);

  // Automatic 2-second background polling & window focus verification while status modal is pending
  useEffect(() => {
    if (!paymentStatusModal.isOpen || paymentStatusModal.status !== 'pending') return undefined;

    // Immediately trigger check on modal open
    handleVerifyAndActivate(paymentStatusModal.targetPlanName);

    // Without a cap, a persistently failing verify call (network hiccup, a
    // stale/expiring token, the backend never receiving the provider's
    // webhook) left this polling forever with the modal stuck on "Payment in
    // Progress" -- handleVerifyAndActivate's catch swallows errors silently,
    // so there was previously no way for the user to ever see anything other
    // than an infinite spinner. Stop after ~2 minutes and surface an honest
    // "couldn't confirm yet" state instead.
    const startedAt = Date.now();
    const TIMEOUT_MS = 120000;
    const interval = setInterval(() => {
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        clearInterval(interval);
        setPaymentStatusModal(prev => (
          prev.status === 'pending' ? { ...prev, status: 'unknown' } : prev
        ));
        return;
      }
      handleVerifyAndActivate(paymentStatusModal.targetPlanName);
    }, 2000);

    const handleFocus = () => {
      handleVerifyAndActivate(paymentStatusModal.targetPlanName);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [handleVerifyAndActivate, paymentStatusModal.isOpen, paymentStatusModal.status, paymentStatusModal.targetPlanName]);

  // Auto-detect plan upgrade completion while status modal is pending
  useEffect(() => {
    if (paymentStatusModal.isOpen && paymentStatusModal.status === 'pending') {
      const code = (subscription?.plan?.code || '').toLowerCase();
      if (code && code !== 'free' && code !== 'trial') {
        setPaymentStatusModal(prev => ({
          ...prev,
          status: 'success',
          targetPlanName: subscription?.plan?.name || prev.targetPlanName
        }));
      }
    }
  }, [subscription, paymentStatusModal.isOpen, paymentStatusModal.status]);

  useEffect(() => {
    if (reducedMotion) {
      setSpreadCards(true);
      return undefined;
    }
    setSpreadCards(false);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setSpreadCards(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, availablePlans.length]);

  const handleOpenCheckoutModal = (plan) => {
    if (plan.code === currentPlanCode) return;
    setCheckoutError(null);
    setCheckoutModalPlan(plan);
  };

  const handleExecutePayment = async ({ planId, country, currency, provider, checkoutTab }) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) {
      if (checkoutTab && !checkoutTab.closed) checkoutTab.close();
      setCheckoutError('Please sign in to upgrade your subscription.');
      return;
    }

    const targetPlan = checkoutModalPlan;
    try {
      // 1. Close payment gateway selection modal on current page
      setCheckoutModalPlan(null);

      // 2. Immediately open Payment Status Modal on current active page
      setPaymentStatusModal({
        isOpen: true,
        status: 'pending',
        targetPlanName: targetPlan?.name || 'Pro'
      });

      const res = await createCheckoutSession(apiUrl, token, {
        planId,
        country,
        currency,
        provider
      });

      // Neither payment provider has real credentials fully wired up for this
      // checkout (see backend/app/billing/providers/*.py's no-API-key or
      // failed-live-API-call fallback branches) -- when that happens,
      // checkout_url just points back at our own /subscription route with a
      // payment=mock_..._success marker; there's no actual external checkout
      // page to send the user to, and no real payment behind it. This used to
      // still open a brand-new tab and navigate it there via a full page
      // load, which was fragile (the tab could be left showing its own
      // placeholder instead of the loaded app) and pointless, since nothing
      // external happens on this path. Handle it entirely in the current tab
      // instead of round-tripping through one -- but do NOT assume success:
      // the backend only actually activates a mock checkout when a developer
      // has explicitly opted in locally (ALLOW_MOCK_BILLING_ACTIVATION, see
      // billing.py) -- everywhere else this correctly reports "no change"
      // (KNOWN_ISSUES.md ISSUE-015), and the pending-poll effect above will
      // honestly surface "unknown" after its timeout since there was never a
      // real payment for a webhook to confirm.
      const isMockCheckout = res.subscription_id === 'sub_mock_razorpay_123'
        || res.subscription_id === 'sub_mock_stripe_123'
        || String(res.checkout_url || '').includes('mock_');
      if (isMockCheckout) {
        if (checkoutTab && !checkoutTab.closed) checkoutTab.close();
        await handleVerifyAndActivate(planId);
        return;
      }

      // Handle Razorpay Inline SDK Checkout in new tab or hosted checkout
      if (res.provider === 'razorpay' && res.subscription_id && (!res.checkout_url || !res.checkout_url.startsWith('http'))) {
        const rzpKey = res.key_id || 'rzp_test_TKlgFVnPx4QCdU';
        const targetWin = (checkoutTab && !checkoutTab.closed) ? checkoutTab : window;
        
        if (!targetWin.Razorpay) {
          const script = targetWin.document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          targetWin.document.body.appendChild(script);
          await new Promise((resolve) => { script.onload = resolve; });
        }

        if (targetWin.Razorpay) {
          const rzp = new targetWin.Razorpay({
            key: rzpKey,
            subscription_id: res.subscription_id,
            name: 'Tailr4U Subscriptions',
            description: `Upgrade to ${targetPlan?.name || 'Pro'}`,
            handler: function (response) {
              if (targetWin !== window && !targetWin.closed) targetWin.close();
              setPaymentStatusModal({
                isOpen: true,
                status: 'success',
                targetPlanName: targetPlan?.name || 'Pro'
              });
              setPaymentBanner({
                type: 'success',
                message: 'Razorpay payment authorized! Refreshing subscription status...'
              });
              setTimeout(refresh, 1500);
            },
            modal: {
              ondismiss: function () {
                if (targetWin !== window && !targetWin.closed) targetWin.close();
                setPaymentStatusModal({
                  isOpen: true,
                  status: 'cancelled',
                  targetPlanName: targetPlan?.name || ''
                });
              }
            },
            prefill: {
              email: session?.user?.email || ''
            },
            theme: {
              color: '#2563eb'
            }
          });
          rzp.open();
          return;
        }
      }

      // Handle Stripe Checkout in separate new tab:
      if (res.checkout_url) {
        if (checkoutTab && !checkoutTab.closed) {
          checkoutTab.location.href = res.checkout_url;
        } else {
          const stripeWindow = window.open(res.checkout_url, '_blank');
          if (!stripeWindow || stripeWindow.closed || typeof stripeWindow.closed === 'undefined') {
            window.location.href = res.checkout_url;
          }
        }
      }
    } catch (err) {
      if (checkoutTab && !checkoutTab.closed) checkoutTab.close();
      setCheckoutModalPlan(null);
      setPaymentStatusModal({
        isOpen: true,
        status: 'failed',
        targetPlanName: targetPlan?.name || ''
      });
      setCheckoutError(err.message || 'Payment initialization failed. Please try again.');
    }
  };

  const ctaLabel = (plan) => {
    if (plan.code === currentPlanCode) return 'Current Plan';
    if ((plan.sort_order ?? 0) > currentSortOrder) return `Upgrade to ${plan.name}`;
    return `Downgrade to ${plan.name}`;
  };

  if (loading && !subscription) {
    return (
      <div className="p-6 space-y-6 overflow-y-auto animate-in fade-in duration-300">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
          <div className="h-4 w-96 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg animate-pulse" />
        </div>

        {/* Current Plan Skeleton Banner */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-3 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse" />
              <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
            </div>
            <div className="h-9 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" />
            <div className="h-4 w-48 bg-zinc-100 dark:bg-zinc-800 rounded-md animate-pulse" />
          </div>
        </div>

        {/* Available Plans Skeleton Cards Grid */}
        <div>
          <div className="h-6 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 flex flex-col space-y-5 min-h-[420px] shadow-sm relative overflow-hidden"
              >
                <div className="flex justify-between items-center">
                  <div className="h-6 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
                  {item === 2 && <div className="h-5 w-20 bg-indigo-100 dark:bg-indigo-950 rounded-full animate-pulse" />}
                </div>
                <div className="h-10 w-36 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
                <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800/80 rounded-md animate-pulse" />
                <div className="space-y-3 flex-1 pt-4">
                  {[1, 2, 3, 4, 5].map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full bg-emerald-100 dark:bg-emerald-950 animate-pulse shrink-0" />
                      <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-md animate-pulse" />
                    </div>
                  ))}
                </div>
                <div className="h-12 w-full bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse mt-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Pricing & Subscriptions</h1>
        <p className="text-sm text-zinc-500 mt-1">Choose the plan that matches your job search pace.</p>
      </div>

      {paymentBanner && (
        <div className={`rounded-xl border p-4 text-sm font-semibold flex items-center justify-between gap-3 ${
          paymentBanner.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
            : 'border-blue-200 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="flex-shrink-0" />
            <span>{paymentBanner.message}</span>
          </div>
          <button onClick={() => setPaymentBanner(null)} className="text-xs underline font-bold">Dismiss</button>
        </div>
      )}

      {(error || checkoutError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span>{checkoutError || error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4 shadow-sm">
        <div className="flex justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400 font-black">Current Plan</div>
            <div className="text-xl font-black text-zinc-900 dark:text-white mt-1">{subscription?.plan?.name || currentPlan?.name || 'Free'}</div>
            <div className="text-sm text-zinc-500 capitalize">{subscription?.status || 'active'}</div>
          </div>
          <button onClick={refresh} className="h-9 px-4 rounded-lg border text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-900">
            Refresh
          </button>
        </div>

        <div>
          <div className="flex justify-between text-sm font-bold mb-2">
            <span>Job description extractions used</span>
            <span>{used}{limit ? ` / ${limit}` : ' / Unlimited'}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-indigo-600" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-sm text-zinc-500 mt-2">
            {limit ? `${remaining} extractions remaining` : 'Unlimited extractions'} · Resets on {formatDate(jdUsage?.period_end || subscription?.current_period_end)}
          </div>
        </div>
        <div className="subscription-usage-grid">
          {usageItems.map(([label, item]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{item?.used || 0} / {item?.limit == null ? '∞' : item.limit}</strong>
              <small>{item?.remaining == null ? 'Unlimited' : `${item.remaining} remaining`}</small>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-black mb-3 text-zinc-900 dark:text-white">Available Plans</h2>
        <div className={`subscription-plans-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 ${spreadCards ? 'is-spread' : 'is-stacked'}`}>
          {availablePlans.map((plan, index) => {
            const isCurrent = plan.code === currentPlanCode;
            const isRecommended = plan.code === 'elite' || plan.code === 'pro';
            const features = normalizeFeatures(plan.features).slice(0, 6);

            return (
              <motion.div
                key={plan.id || plan.code}
                layout={!reducedMotion}
                initial={reducedMotion ? false : { opacity: index === 0 ? 1 : .88, scale: 1 - index * .012 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  layout: { type: 'spring', stiffness: 155, damping: 21, mass: .82, delay: index * .075 },
                  opacity: { duration: .22, delay: index * .075 },
                  scale: { duration: .28, delay: index * .075 }
                }}
                className={`subscription-plan-card subscription-plan-${plan.code} rounded-2xl border bg-white dark:bg-zinc-950 p-5 flex flex-col min-h-[420px] ${
                  isRecommended
                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/10'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xl font-black text-zinc-950 dark:text-white">{plan.name}</h3>
                  {isRecommended && (
                    <span className="rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-1 text-[10px] font-black uppercase tracking-wider">
                      Most Popular
                    </span>
                  )}
                </div>

                <div className="mt-4 text-3xl font-black text-zinc-950 dark:text-white">
                  {formatPrice(plan, usdToInrRate).usd}
                </div>

                <p className="text-sm text-zinc-500 mt-3 min-h-[42px]">{plan.description}</p>

                <ul className="mt-5 space-y-3 text-sm flex-1">
                  {features.map((feature) => (
                    <li key={feature.key} className="flex items-start gap-2 text-zinc-700 dark:text-zinc-250">
                      <Check size={16} className="mt-0.5 text-emerald-500 flex-shrink-0" />
                      <span>{feature.label}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleOpenCheckoutModal(plan)}
                  className={`mt-6 w-full rounded-xl py-3 text-sm font-black transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-md shadow-indigo-500/20'
                  }`}
                  disabled={isCurrent}
                >
                  {ctaLabel(plan)}
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Payment Selection Modal */}
      <PaymentModal
        isOpen={Boolean(checkoutModalPlan)}
        onClose={() => setCheckoutModalPlan(null)}
        plan={checkoutModalPlan}
        onSelectPayment={handleExecutePayment}
      />

      {/* Real-time Payment Status Modal */}
      <PaymentStatusModal
        isOpen={paymentStatusModal.isOpen}
        status={paymentStatusModal.status}
        planName={paymentStatusModal.targetPlanName || checkoutModalPlan?.name || 'Pro'}
        onClose={() => setPaymentStatusModal(prev => ({ ...prev, isOpen: false }))}
        onCheckStatus={() => handleVerifyAndActivate(paymentStatusModal.targetPlanName || checkoutModalPlan?.name || 'pro')}
        onRetry={() => {
          if (availablePlans.length > 0) {
            setCheckoutModalPlan(availablePlans[0]);
          }
        }}
      />
    </div>
  );
}
