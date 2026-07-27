const FULL_ROUTES = new Set([
  '/tailor', '/job-tracker', '/resume-parse', '/resume-review',
  '/tailor-config', '/tailor-progress', '/review-changes', '/templates',
  '/download', '/cover-letter', '/settings/job-preferences',
  '/onboarding/job-preferences'
]);

const WIDE_ROUTES = new Set([
  '/', '/dashboard', '/resume-detect', '/profile', '/settings/security',
  '/subscription'
]);

const WORKSPACE_ROUTES = new Set([
  '/resume-review', '/review-changes', '/templates', '/download', '/cover-letter'
]);

export function getPageLayout(pathname = '/') {
  if (FULL_ROUTES.has(pathname)) {
    return { mode: 'full', workspace: WORKSPACE_ROUTES.has(pathname) };
  }
  if (WIDE_ROUTES.has(pathname)) {
    return { mode: 'wide', workspace: false };
  }
  return { mode: 'reading', workspace: false };
}
