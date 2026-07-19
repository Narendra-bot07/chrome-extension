export function validateNormalizedJob(job) {
  const issues = [];
  const title = job.title?.value || '';
  const description = job.description?.value || '';
  if (!title || title.length < 3 || /^(jobs?|careers?|search|home|apply now)$/i.test(title)) issues.push({ field: 'title', code: 'INVALID_TITLE', severity: 'error' });
  if (!description || description.length < 300) issues.push({ field: 'description', code: 'DESCRIPTION_TOO_SHORT', severity: 'error' });
  if (description && !/responsibilit|qualification|requirement|experience|skills|about the (?:job|role)/i.test(description)) issues.push({ field: 'description', code: 'DESCRIPTION_NOT_JOB_LIKE', severity: 'error' });
  if (job.company?.value && /^(jobs?|careers?|unknown|company)$/i.test(job.company.value)) issues.push({ field: 'company', code: 'GENERIC_COMPANY', severity: 'warning' });
  const valid = !issues.some((item) => item.severity === 'error');
  return { valid, requiredFieldsPresent: Boolean(title && description), issues, consistencyScore: valid ? 1 : Math.max(0, 1 - issues.length * 0.3), recoveryHints: issues.some((item) => item.code === 'DESCRIPTION_TOO_SHORT') ? ['DETAIL_PANEL_NOT_MOUNTED'] : [] };
}

export function normalizeJobOutcome(fields, context, classification, fingerprint) {
  return { schemaVersion: 'astra-job-1', ...fields, sourceUrl: context.url.href, extractedAt: new Date().toISOString(), contentHash: fingerprint, classification };
}
