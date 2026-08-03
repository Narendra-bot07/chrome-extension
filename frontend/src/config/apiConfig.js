export const DEFAULT_API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://chrome-extension-lbq5.onrender.com';

export function getApiUrl() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('apiUrl');
    if (stored && stored.trim() && !stored.includes('127.0.0.1:8000') && !stored.includes('localhost:8000')) {
      return stored.trim().replace(/\/+$/, '');
    }
  }
  return DEFAULT_API_URL.replace(/\/+$/, '');
}
