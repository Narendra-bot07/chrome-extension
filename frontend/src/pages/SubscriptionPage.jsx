import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';
import { useApp } from '../context/AppContext';
import { createCheckoutSession } from '../services/subscriptionApi';
import { PaymentModal } from '../components/PaymentModal';
import { useTailr4uReducedMotion } from '../motion/MotionSystem';
import './SubscriptionPage.css';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPrice(plan) {
  const interval = plan.billing_interval || 'month';
  const amount = typeof plan.price_amount === 'number' ? plan.price_amount : plan.price;
  if (typeof amount === 'number') {
    const formatted = amount === 0 ? '0' : amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `$${formatted}/${interval}`;
  }
  if (plan.price_display) return `${plan.price_display}/${interval}`;
  return `$0/month`;
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
  const { apiUrl, session } = useApp();
  const [spreadCards, setSpreadCards] = useState(reducedMotion);
  const { subscription, plans, loading, error, refresh } = useSubscription();

  const [checkoutModalPlan, setCheckoutModalPlan] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [paymentBanner, setPaymentBanner] = useState(null);

  const jdUsage = subscription?.usage?.jd_extraction;
  const limit = jdUsage?.limit;
  const used = jdUsage?.used || 0;
  const remaining = jdUsage?.remaining;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const currentPlanCode = subscription?.plan?.code || subscription?.plan_code || 'free';
  const currentPlan = plans.find((plan) => plan.code === currentPlanCode);
  const currentSortOrder = currentPlan?.sort_order ?? 0;
  const availablePlans = plans.filter((plan) => plan.code !== 'free');
  const usageItems = [
    ['JD extractions', subscription?.usage?.jd_extraction],
    ['Tailored resumes', subscription?.usage?.resume_generation],
    ['Cover letters', subscription?.usage?.cover_letter_generation],
    ['Resume uploads', subscription?.usage?.resume_upload]
  ];

  useEffect(() => {
    // Check URL parameters for payment notifications
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus === 'success' || paymentStatus?.includes('success')) {
      setPaymentBanner({
        type: 'success',
        message: 'Payment completed successfully! Your subscription features and credits are now active.'
      });
      refresh();
    } else if (paymentStatus === 'cancelled') {
      setPaymentBanner({
        type: 'info',
        message: 'Payment was cancelled. You can retry upgrading anytime.'
      });
    }
  }, [refresh]);

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

  const handleExecutePayment = async ({ planId, country, currency, provider }) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) {
      setCheckoutError('Please sign in to upgrade your subscription.');
      return;
    }

    try {
      const res = await createCheckoutSession(apiUrl, token, {
        planId,
        country,
        currency,
        provider
      });

      setCheckoutModalPlan(null);

      // Handle Razorpay Inline SDK Checkout
      if (res.provider === 'razorpay' && res.subscription_id && !res.checkout_url.startsWith('http')) {
        const rzpKey = res.key_id || 'rzp_test_mock123';
        
        // Dynamically load Razorpay SDK if not present
        if (!window.Razorpay) {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          document.body.appendChild(script);
          await new Promise((resolve) => { script.onload = resolve; });
        }

        if (window.Razorpay) {
          const rzp = new window.Razorpay({
            key: rzpKey,
            subscription_id: res.subscription_id,
            name: 'Tailr4U Subscriptions',
            description: `Upgrade to ${checkoutModalPlan?.name || 'Pro'}`,
            handler: function (response) {
              setPaymentBanner({
                type: 'success',
                message: 'Razorpay payment authorized! Refreshing subscription status...'
              });
              setTimeout(refresh, 1500);
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

      // Redirect for Stripe or Hosted Payment URL
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      }
    } catch (err) {
      setCheckoutError(err.message || 'Payment initialization failed. Please try again.');
    }
  };

  const ctaLabel = (plan) => {
    if (plan.code === currentPlanCode) return 'Current Plan';
    if ((plan.sort_order ?? 0) > currentSortOrder) return `Upgrade to ${plan.name}`;
    return `Downgrade to ${plan.name}`;
  };

  if (loading && !subscription) {
    return <div className="p-6 text-sm text-zinc-500">Loading pricing...</div>;
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
                  {formatPrice(plan)}
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
    </div>
  );
}
