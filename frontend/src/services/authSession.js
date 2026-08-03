import { AUTH_CONFIG, AUTH_STORAGE } from '../config/authConfig';
import { getApiUrl } from '../config/apiConfig';

const getApiOrigin = () => getApiUrl();
let refreshPromise = null;
let originalFetch = null;
let installCount = 0;

const isApiRequest = input => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const currentOrigin = getApiUrl();
  return url.startsWith(currentOrigin) || url.startsWith('http://127.0.0.1:8000') || url.startsWith('http://localhost:8000') || url.startsWith('/api/');
};

export const storeAuthenticatedSession = (accessToken, refreshToken = null) => {
  localStorage.setItem(AUTH_STORAGE.accessToken, accessToken);
  if (refreshToken) {
    localStorage.setItem('refresh_token', refreshToken);
  }
  localStorage.setItem(AUTH_STORAGE.lastActivityAt, String(Date.now()));
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const payload = { access_token: accessToken };
    if (refreshToken) payload.refresh_token = refreshToken;
    chrome.storage.local.set(payload);
  }
};

export const refreshAccessToken = async () => {
  if (refreshPromise) return refreshPromise;
  const storedRefreshToken = localStorage.getItem('refresh_token');
  const storedAccessToken = localStorage.getItem(AUTH_STORAGE.accessToken);
  const fetchImpl = originalFetch || window.fetch.bind(window);
  const headers = { 'Content-Type': 'application/json' };
  if (storedAccessToken) {
    headers['Authorization'] = `Bearer ${storedAccessToken}`;
  }

  const attemptRefresh = () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    return fetchImpl(`${getApiOrigin()}/api/v1/auth/refresh`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ refresh_token: storedRefreshToken || '' }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
  };

  refreshPromise = (async () => {
    let response = null;
    // A failed refresh here logs the user out entirely (see AppContext's
    // checkSession confirmed-401 branch) — so a single transient network
    // blip or a slow/cold-starting backend must not be indistinguishable
    // from an actually-invalid refresh token. Retry transient failures;
    // give up immediately only on a definitive 401/403 (the refresh token
    // itself was rejected — retrying with the same token can't help).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await attemptRefresh();
        if (response.ok || response.status === 401 || response.status === 403) break;
      } catch (err) {
        response = null;
      }
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    if (!response || !response.ok) throw new Error('refresh_failed');
    const data = await response.json();
    if (data.access_token) {
      localStorage.setItem(AUTH_STORAGE.accessToken, data.access_token);
    }
    if (data.refresh_token) {
      localStorage.setItem('refresh_token', data.refresh_token);
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const updatePayload = {};
      if (data.access_token) updatePayload.access_token = data.access_token;
      if (data.refresh_token) updatePayload.refresh_token = data.refresh_token;
      chrome.storage.local.set(updatePayload);
    }
    return data.access_token;
  })().finally(() => {
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
      console.warn("[AUTH] Refresh failed gracefully without kicking user out.");
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
