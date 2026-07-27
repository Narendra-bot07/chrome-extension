const JOB_BOARD_HOSTS = new Set([
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com',
  'wellfound.com', 'naukri.com', 'monster.com', 'simplyhired.com',
  'dice.com', 'careerbuilder.com', 'jobvite.com', 'lever.co',
  'greenhouse.io', 'workday.com', 'myworkdayjobs.com', 'bamboohr.com',
  'workable.com', 'ashbyhq.com', 'smartrecruiters.com', 'hiring.cafe',
  'builtin.com', 'ycombinator.com'
]);

export function isJobBoardDomain(domain) {
  if (!domain) return false;
  const clean = String(domain).toLowerCase().trim().replace(/^www\./, '');
  if (JOB_BOARD_HOSTS.has(clean)) return true;
  for (const host of JOB_BOARD_HOSTS) {
    if (clean.endsWith(`.${host}`) || clean.includes('workday') || clean.includes('greenhouse') || clean.includes('lever')) {
      return true;
    }
  }
  return false;
}

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
const VERIFIED_LEGACY_DOMAINS = new Map([
  ['microsoft', 'microsoft.com'],
  ['google', 'google.com'],
  ['nvidia', 'nvidia.com'],
  ['pwc', 'pwc.com'],
  ['pricewaterhousecoopers', 'pwc.com'],
  ['tata consultancy services', 'tcs.com'],
  ['tcs', 'tcs.com'],
  ['amazon', 'amazon.com'],
  ['apple', 'apple.com'],
  ['meta', 'meta.com'],
  ['netflix', 'netflix.com'],
  ['atlassian', 'atlassian.com'],
  ['oracle', 'oracle.com'],
  ['accenture', 'accenture.com'],
  ['infosys', 'infosys.com'],
  ['wipro', 'wipro.com'],
  ['cognizant', 'cognizant.com'],
  ['capgemini', 'capgemini.com'],
  ['deloitte', 'deloitte.com'],
  ['ey', 'ey.com'],
  ['ernst young', 'ey.com'],
  ['kpmg', 'kpmg.com'],
  ['ibm', 'ibm.com'],
  ['salesforce', 'salesforce.com'],
  ['adobe', 'adobe.com'],
  ['uber', 'uber.com'],
  ['airbnb', 'airbnb.com'],
  ['stripe', 'stripe.com'],
  ['paypal', 'paypal.com'],
  ['goldman sachs', 'goldmansachs.com'],
  ['jpmorgan', 'jpmorganchase.com'],
  ['jp morgan', 'jpmorganchase.com'],
  ['morgan stanley', 'morganstanley.com'],
  ['intel', 'intel.com'],
  ['amd', 'amd.com'],
  ['qualcomm', 'qualcomm.com'],
  ['cisco', 'cisco.com']
]);

function normalizeCompanyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(?:corporation|corp|incorporated|inc|limited|ltd|llc|plc|private|pvt)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveCompanyDomain(companyDomain, companyName, jobUrl) {
  // 1. Try supplied companyDomain first if it's not a job board
  const supplied = normalizeDomain(companyDomain);
  if (supplied && !isJobBoardDomain(supplied)) return supplied;

  // 2. Check verified legacy map
  const cleanKey = normalizeCompanyKey(companyName);
  if (VERIFIED_LEGACY_DOMAINS.has(cleanKey)) {
    return VERIFIED_LEGACY_DOMAINS.get(cleanKey);
  }

  // 3. Try jobUrl if valid and NOT a job board (e.g. nvidia.com/careers/job1)
  const jobDomain = normalizeDomain(jobUrl);
  if (jobDomain && !isJobBoardDomain(jobDomain)) return jobDomain;

  // 4. Default clean company domain guess if valid single word
  if (cleanKey && !cleanKey.includes(' ') && cleanKey.length >= 3) {
    const candidate = `${cleanKey}.com`;
    if (!isJobBoardDomain(candidate)) return candidate;
  }

  return '';
}

export function getInitials(name) {
  const clean = String(name || 'Company').trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] || 'CO').slice(0, 2).toUpperCase();
}
