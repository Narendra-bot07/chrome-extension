import { AUTH_CONFIG, AUTH_STORAGE } from '../config/authConfig';

const API_ORIGIN = 'http://localhost:8000';
let refreshPromise = null;
let originalFetch = null;
let installCount = 0;

const isApiRequest = input => {
  const url = typeof input === 'string' ? input : input?.url || '';
  return url.startsWith(API_ORIGIN) || url.startsWith('/api/');
};

export const storeAuthenticatedSession = accessToken => {
  localStorage.setItem(AUTH_STORAGE.accessToken, accessToken);
  localStorage.setItem(AUTH_STORAGE.lastActivityAt, String(Date.now()));
};

export const refreshAccessToken = async () => {
  if (refreshPromise) return refreshPromise;
  const fetchImpl = originalFetch || window.fetch.bind(window);
  refreshPromise = fetchImpl(`${API_ORIGIN}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  }).then(async response => {
    if (!response.ok) throw new Error('refresh_failed');
    const data = await response.json();
    localStorage.setItem(AUTH_STORAGE.accessToken, data.access_token);
    if (import.meta.env?.DEV) console.debug('[auth]', { event: 'token_refreshed' });
    return data.access_token;
  }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

export const installAuthenticatedFetch = onRefreshFailed => {
  installCount += 1;
  if (originalFetch) return () => { installCount -= 1; };
  originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    if (!isApiRequest(input)) return originalFetch(input, init);
    const url = typeof input === 'string' ? input : input.url;
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    const token = localStorage.getItem(AUTH_STORAGE.accessToken);
    if (token && !url.includes('/auth/refresh')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    let response = await originalFetch(input, {
      ...init,
      headers,
      credentials: 'include',
    });
    const isRefreshable = response.status === 401
      && !url.includes('/auth/login')
      && !url.includes('/auth/google')
      && !url.includes('/auth/refresh');
    if (!isRefreshable) return response;
    try {
      const refreshedToken = await refreshAccessToken();
      headers.set('Authorization', `Bearer ${refreshedToken}`);
      response = await originalFetch(input, {
        ...init,
        headers,
        credentials: 'include',
      });
      return response;
    } catch {
      onRefreshFailed?.();
      return response;
    }
  };
  return () => {
    installCount -= 1;
    if (installCount <= 0 && originalFetch) {
      window.fetch = originalFetch;
      originalFetch = null;
      installCount = 0;
    }
  };
};

export const tokenNeedsRefresh = token => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload.exp * 1000) - Date.now() <= AUTH_CONFIG.refreshBeforeExpiryMs;
  } catch {
    return false;
  }
};
