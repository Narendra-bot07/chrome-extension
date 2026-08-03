export const DEFAULT_API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://chrome-extension-lbq5.onrender.com';

export function getApiUrl() {
  const isExtension = typeof window !== 'undefined' && window.location?.protocol === 'chrome-extension:';
  const allowLocalOverride = import.meta.env.DEV || isExtension;
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
