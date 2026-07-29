const DEFAULT_AUTH_DESTINATION = '/dashboard';

export function safeAuthRedirect(value, fallback = DEFAULT_AUTH_DESTINATION) {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  if (candidate.includes('\\') || /[\r\n]/.test(candidate)) return fallback;

  try {
    const decoded = decodeURIComponent(candidate);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return candidate;
}

export function authDestinationFromSearch(search, fallback = DEFAULT_AUTH_DESTINATION) {
  return safeAuthRedirect(new URLSearchParams(search || '').get('redirect'), fallback);
}

export function loginPathFor(destination) {
  return `/login?redirect=${encodeURIComponent(safeAuthRedirect(destination))}`;
}
