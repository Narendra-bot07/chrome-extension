import { useCallback, useEffect, useState } from 'react';
import { fetchPlans, fetchSubscription } from '../services/subscriptionApi';
import { useApp } from '../context/AppContext';

const FALLBACK_PLANS = [
  {
    id: 'basic', code: 'basic', name: 'Basic', description: 'For active job hunting.',
    price_amount: 9.99, currency: 'USD', price_display: '$9.99', sort_order: 2,
    features: {
      jd_extraction: { enabled: true, limit: 100 },
      resume_upload: { enabled: true, limit: 3 },
      resume_generation: { enabled: true, limit: 50 },
      cover_letter_generation: { enabled: true, limit: 30 }
    }
  },
  {
    id: 'pro', code: 'pro', name: 'Pro', description: 'For serious job hunters.',
    price_amount: 19.99, currency: 'USD', price_display: '$19.99', sort_order: 3,
    features: {
      jd_extraction: { enabled: true, limit: 500 },
      resume_upload: { enabled: true, limit: null },
      resume_generation: { enabled: true, limit: 150 },
      cover_letter_generation: { enabled: true, limit: 100 }
    }
  },
  {
    id: 'elite', code: 'elite', name: 'Elite', description: 'For power users and teams.',
    price_amount: 39.99, currency: 'USD', price_display: '$39.99', sort_order: 4,
    features: {
      jd_extraction: { enabled: true, limit: 1200 },
      resume_upload: { enabled: true, limit: null },
      resume_generation: { enabled: true, limit: 1000 },
      cover_letter_generation: { enabled: true, limit: 700 }
    }
  }
];

export function useSubscription() {
  const { apiUrl, session, subscription, setSubscription, usage, setUsage } = useApp();
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const token = session?.access_token || localStorage.getItem('access_token');
    setLoading(true);
    setError(null);
    try {
      const [subData, plansData] = await Promise.all([
        token ? fetchSubscription(apiUrl, token).catch(() => null) : Promise.resolve(null),
        fetchPlans(apiUrl).catch(() => null)
      ]);

      if (subData) {
        setSubscription(subData);
        setUsage(subData.usage || null);
      }

      if (plansData?.plans && Array.isArray(plansData.plans) && plansData.plans.length > 0) {
        setPlans(plansData.plans);
      } else {
        setPlans(FALLBACK_PLANS);
      }
    } catch (err) {
      setError(err.message || "Failed to load subscription.");
      setPlans(FALLBACK_PLANS);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, session, setSubscription, setUsage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { subscription, usage, plans: plans.length > 0 ? plans : FALLBACK_PLANS, loading, error, refresh };
}

export function useFeatureAccess(featureKey) {
  const { subscription } = useApp();
  const feature = subscription?.features?.[featureKey];
  return {
    enabled: !!feature?.enabled,
    limit: feature?.limit ?? null
  };
}
