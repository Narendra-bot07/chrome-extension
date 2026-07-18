import React from 'react';
import { Check } from 'lucide-react';
import { useSubscription } from '../hooks/useSubscription';

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
  const { subscription, plans, loading, error, refresh } = useSubscription();
  const jdUsage = subscription?.usage?.jd_extraction;
  const limit = jdUsage?.limit;
  const used = jdUsage?.used || 0;
  const remaining = jdUsage?.remaining;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const currentPlanCode = subscription?.plan?.code || subscription?.plan_code || 'free';
  const currentPlan = plans.find((plan) => plan.code === currentPlanCode);
  const currentSortOrder = currentPlan?.sort_order ?? 0;

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
        <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Pricing</h1>
        <p className="text-sm text-zinc-500 mt-1">Choose the plan that matches your job search pace.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4">
        <div className="flex justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400 font-black">Current Plan</div>
            <div className="text-xl font-black text-zinc-900 dark:text-white mt-1">{subscription?.plan?.name || currentPlan?.name || 'Free'}</div>
            <div className="text-sm text-zinc-500 capitalize">{subscription?.status || 'active'}</div>
          </div>
          <button onClick={refresh} className="h-9 px-4 rounded-lg border text-sm font-bold">
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
      </section>

      <section>
        <h2 className="text-lg font-black mb-3">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrent = plan.code === currentPlanCode;
            const isRecommended = plan.code === 'pro';
            const features = normalizeFeatures(plan.features).slice(0, 6);

            return (
              <div
                key={plan.id || plan.code}
                className={`rounded-2xl border bg-white dark:bg-zinc-950 p-5 flex flex-col min-h-[380px] ${
                  isRecommended
                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/10'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xl font-black text-zinc-950 dark:text-white">{plan.name}</h3>
                  {isRecommended && (
                    <span className="rounded-full bg-indigo-50 text-indigo-600 px-2 py-1 text-[10px] font-black uppercase tracking-wider">
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
                  className={`mt-6 w-full rounded-xl py-3 text-sm font-black ${
                    isCurrent
                      ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  disabled
                  title={isCurrent ? 'This is your current plan' : `${ctaLabel(plan)} is not connected to checkout yet`}
                >
                  {ctaLabel(plan)}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
