const evidence = (id, kind, polarity, weight, confidence, source, reason, extra = {}) => ({ id, kind, polarity, weight, confidence, source, reason, correlationGroup: kind, ...extra });

export function buildPageEvidence(context) {
  const out = [];
  const headings = (context.headings || []).map((item) => item.text).join(' ');
  const actions = context.actions || [];
  const text = (context.textBlocks || []).map((item) => item.text).join('\n');
  const types = (context.jsonLd || []).flatMap((item) => Array.isArray(item.type) ? item.type : [item.type]);
  const jobId = context.url.pathname.match(/\/(?:jobs?|positions?|openings?|details)\/(\d{4,})(?:\/|-|$)/i)?.[1] || '';
  const applyActions = actions.filter((item) => /^(?:easy )?apply(?: now)?$|submit application/i.test(item.text || item.label));
  const sectionMatches = ['responsibilities', 'requirements', 'qualifications', 'about the job', 'about the role', 'skills', 'experience', 'benefits'].filter((label) => text.toLowerCase().includes(label));
  const jobLinks = new Set(actions.map((item) => item.hrefPath).filter((path) => /\/jobs\/\d+(?:\/|$)/i.test(path))).size;
  const jobPostingCount = types.filter((type) => type === 'JobPosting').length;
  if (jobPostingCount === 1) out.push(evidence('jsonld-job', 'JOB_POSTING_SCHEMA', 'positive', 0.95, 0.98, 'json-ld', 'one schema.org JobPosting is present'));
  if (jobPostingCount > 1) out.push(evidence('jsonld-job-list', 'MULTIPLE_JOB_POSTINGS', 'negative', 0.98, 0.99, 'json-ld', `${jobPostingCount} JobPosting records indicate a listing page`, { count: jobPostingCount }));
  if (jobId) out.push(evidence('job-id', 'JOB_ID', 'positive', 0.7, 0.95, 'browser', 'stable job identifier found in the path', { value: jobId }));
  if (applyActions.length) out.push(evidence('apply', 'APPLY_ACTION', 'positive', 0.65, 0.9, 'aria', 'visible application action', { nodeHandle: applyActions[0].handle }));
  if (sectionMatches.length >= 2) out.push(evidence('job-sections', 'JOB_SECTIONS', 'positive', 0.75, Math.min(0.98, 0.55 + sectionMatches.length * 0.06), 'dom', `${sectionMatches.length} independent job sections`, { labels: sectionMatches }));
  if ((context.candidates || []).some((item) => item.textLength >= 500)) out.push(evidence('large-region', 'SUBSTANTIAL_REGION', 'positive', 0.45, 0.8, 'dom', 'large semantic content region'));
  if (jobLinks >= 2) out.push(evidence('job-links', 'REPEATED_JOB_LINKS', 'negative', 0.85, 0.95, 'dom', `${jobLinks} links to individual jobs`, { count: jobLinks }));
  if (/\/(?:content\/[^/]+\/)?(?:locations?|search)(?:\/|$)/i.test(context.url.pathname)) out.push(evidence('listing-route', 'SEARCH_UI', 'negative', 0.9, 0.96, 'browser', 'location/search route indicates an unselected job collection'));
  if (/\b(?:open jobs|filter jobs|job search|jobs for you|recommended jobs)\b/i.test(headings + ' ' + text.slice(0, 1500))) out.push(evidence('search-ui', 'SEARCH_UI', 'negative', 0.8, 0.9, 'dom', 'job search/filter interface detected'));
  if (/\b(?:sign in|log in)\b/i.test(headings) && (context.forms || []).length) out.push(evidence('login', 'LOGIN_FORM', 'negative', 0.95, 0.95, 'dom', 'login heading and form'));
  if ((context.loading || []).length) out.push(evidence('loading', 'LOADING_STATE', 'neutral', 0.3, 0.7, 'dom', 'loading indicator is visible'));
  if (/\/(?:blog|news|article|stories)(?:\/|$)/i.test(context.url.pathname)) out.push(evidence('article-path', 'ARTICLE_CONTEXT', 'negative', 0.75, 0.85, 'browser', 'editorial path'));
  return out;
}
