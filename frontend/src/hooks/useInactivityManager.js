import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTH_CONFIG, AUTH_STORAGE } from '../config/authConfig';
import {
  installAuthenticatedFetch,
  refreshAccessToken,
  tokenNeedsRefresh,
} from '../services/authSession';
import { getInactivityState } from '../services/inactivity';

const ACTIVITY_EVENTS = [
  'pointerdown', 'mousedown', 'touchstart', 'keydown', 'scroll', 'wheel',
  'dragstart', 'dragend', 'input', 'change',
];

export function useInactivityManager({ accessToken, apiUrl, onLogout }) {
  const [showWarning, setShowWarning] = useState(false);
  const observedActivityRef = useRef(0);
  const persistedActivityRef = useRef(0);
  const serverActivityRef = useRef(0);
  const logoutRef = useRef(onLogout);
  logoutRef.current = onLogout;

  const readActivity = useCallback(() => {
    const stored = Number(localStorage.getItem(AUTH_STORAGE.lastActivityAt)) || 0;
    return Math.max(stored, observedActivityRef.current);
  }, []);

  const recordActivity = useCallback((force = false) => {
    const now = Date.now();
    observedActivityRef.current = now;
    setShowWarning(false);
    if (!force && now - persistedActivityRef.current < AUTH_CONFIG.activityThrottleMs) return;
    persistedActivityRef.current = now;
    localStorage.setItem(AUTH_STORAGE.lastActivityAt, String(now));
    if (import.meta.env.DEV) console.debug('[auth]', { event: 'activity_recorded' });
    if (now - serverActivityRef.current >= AUTH_CONFIG.serverActivityThrottleMs) {
      serverActivityRef.current = now;
      window.fetch(`${apiUrl}/api/v1/auth/activity`, {
        method: 'POST',
        headers: {
          'X-User-Initiated': 'true',
          Authorization: `Bearer ${localStorage.getItem(AUTH_STORAGE.accessToken) || ''}`,
        },
        credentials: 'include',
      }).catch(() => {});
    }
  }, [apiUrl]);

  const checkInactivity = useCallback(() => {
    const state = getInactivityState(Date.now(), readActivity());
    const { idleFor } = state;
    if (import.meta.env.DEV) console.debug('[auth]', { event: 'inactivity_checked', idleFor });
    if (state.expired) {
      logoutRef.current('inactivity');
      return;
    }
    setShowWarning(state.warning);
    if (document.visibilityState === 'visible' && tokenNeedsRefresh(
      localStorage.getItem(AUTH_STORAGE.accessToken) || ''
    )) {
      refreshAccessToken().catch(e => console.warn('[AUTH] Background refresh deferred:', e));
    }
  }, [readActivity]);

  useEffect(() => {
    if (!accessToken) {
      setShowWarning(false);
      return undefined;
    }
    const stored = Number(localStorage.getItem(AUTH_STORAGE.lastActivityAt));
    if (!Number.isFinite(stored) || stored <= 0) recordActivity(true);
    else {
      observedActivityRef.current = stored;
      persistedActivityRef.current = stored;
    }
    const removeFetchInterceptor = installAuthenticatedFetch(
      () => {}
    );
    const activityHandler = () => recordActivity(false);
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') checkInactivity();
    };
    const storageHandler = event => {
      if (event.key === AUTH_STORAGE.lastActivityAt) {
        const timestamp = Number(event.newValue) || 0;
        observedActivityRef.current = Math.max(observedActivityRef.current, timestamp);
        setShowWarning(false);
      } else if (event.key === AUTH_STORAGE.event && event.newValue) {
        const message = JSON.parse(event.newValue);
        if (message.type === 'LOGOUT') logoutRef.current(message.reason, { broadcast: false });
      }
    };
    const routeHandler = () => recordActivity(true);
    ACTIVITY_EVENTS.forEach(name => window.addEventListener(name, activityHandler, { passive: true }));
    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('focus', checkInactivity);
    window.addEventListener('storage', storageHandler);
    window.addEventListener('hashchange', routeHandler);
    window.addEventListener('popstate', routeHandler);
    const checkTimer = window.setInterval(checkInactivity, AUTH_CONFIG.inactivityCheckMs);
    checkInactivity();
    return () => {
      window.clearInterval(checkTimer);
      removeFetchInterceptor();
      ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, activityHandler));
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.removeEventListener('focus', checkInactivity);
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener('hashchange', routeHandler);
      window.removeEventListener('popstate', routeHandler);
    };
  }, [accessToken, checkInactivity, recordActivity]);

  const staySignedIn = useCallback(async () => {
    recordActivity(true);
    try {
      await refreshAccessToken();
    } catch (e) {
      console.warn('[AUTH] Manual refresh deferred:', e);
    }
  }, [recordActivity]);

  return { showWarning, staySignedIn };
}
