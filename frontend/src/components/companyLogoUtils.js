export function normalizeDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const hostname = url.hostname.replace(/^www\./, '');
    return hostname.includes('.') && !/\s/.test(hostname) ? hostname : '';
  } catch {
    return '';
  }
}

// Verified aliases support applications saved before company_domain existed.
// This is intentionally explicit: unknown companies must keep the initials fallback.
const VERIFIED_LEGACY_DOMAINS = new Map([
  ['microsoft', 'microsoft.com'],
  ['google', 'google.com'],
  ['nvidia', 'nvidia.com'],
  ['pwc', 'pwc.com'],
  ['pricewaterhousecoopers', 'pwc.com'],
  ['amazon', 'amazon.com'],
  ['apple', 'apple.com'],
  ['meta', 'meta.com'],
  ['netflix', 'netflix.com'],
  ['atlassian', 'atlassian.com'],
  ['oracle', 'oracle.com'],
  ['accenture', 'accenture.com'],
  ['infosys', 'infosys.com'],
  ['tata consultancy services', 'tcs.com']
]);

function normalizeCompanyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(?:corporation|corp|incorporated|inc|limited|ltd|llc|plc)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveCompanyDomain(companyDomain, companyName) {
  const suppliedDomain = normalizeDomain(companyDomain);
  if (suppliedDomain) return suppliedDomain;
  return VERIFIED_LEGACY_DOMAINS.get(normalizeCompanyKey(companyName)) || '';
}

export function getInitials(name) {
  const words = String(name || 'Company').trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] || 'CO').slice(0, 2).toUpperCase();
}
