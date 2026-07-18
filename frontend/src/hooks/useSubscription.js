import { useCallback, useEffect, useState } from 'react';
import { fetchPlans, fetchSubscription } from '../services/subscriptionApi';
import { useApp } from '../context/AppContext';

export function useSubscription() {
  const { apiUrl, session, subscription, setSubscription, usage, setUsage } = useApp();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const token = session?.access_token || localStorage.getItem('access_token');
    setLoading(true);
    setError(null);
    try {
      const [subData, plansData] = await Promise.all([
        token ? fetchSubscription(apiUrl, token) : Promise.resolve(null),
        fetchPlans(apiUrl)
      ]);
      if (subData) {
        setSubscription(subData);
        setUsage(subData.usage || null);
      }
      setPlans(plansData.plans || []);
    } catch (err) {
      setError(err.message || "Failed to load subscription.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, session, setSubscription, setUsage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { subscription, usage, plans, loading, error, refresh };
}

export function useFeatureAccess(featureKey) {
  const { subscription } = useApp();
  const feature = subscription?.features?.[featureKey];
  return {
    enabled: !!feature?.enabled,
    limit: feature?.limit ?? null
  };
}
