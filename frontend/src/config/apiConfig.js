export const DEFAULT_API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://chrome-extension-lbq5.onrender.com';

export function getApiUrl() {
  // Production web/extension builds must always use the audited compile-time
  // API origin. Allowing any chrome-extension page to trust localStorage made
  // stale development values silently route production admins to an older
  // backend—and therefore an entirely different users table.
  const allowLocalOverride = import.meta.env.DEV;
  if (allowLocalOverride && typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('apiUrl');
    if (stored && stored.trim() && !stored.includes('127.0.0.1:8000') && !stored.includes('localhost:8000')) {
      return stored.trim().replace(/\/+$/, '');
    }
  }
  const apiUrl = DEFAULT_API_URL.replace(/\/+$/, '');
  if (import.meta.env.PROD && !apiUrl.startsWith('https://')) {
    throw new Error('Production VITE_API_BASE_URL must use HTTPS.');
  }
  return apiUrl;
}
