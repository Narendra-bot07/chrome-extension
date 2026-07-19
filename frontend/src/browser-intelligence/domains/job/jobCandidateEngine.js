const clean = (value = '') => String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const candidate = (field, value, source, confidence, reasons, nodeHandle) => ({ candidateId: `${field}:${source}:${nodeHandle || 'metadata'}`, field, value: clean(value), normalizedValue: clean(value), source, confidence, reasons, nodeHandle, evidenceIds: [] });

export function discoverJobCandidates(context) {
  const fields = { title: [], company: [], location: [], description: [], jobId: [], applicationUrl: [] };
  for (const item of context.jsonLd || []) {
    if ((Array.isArray(item.type) ? item.type : [item.type]).includes('JobPosting')) {
      if (item.summary?.title) fields.title.push(candidate('title', item.summary.title, 'json-ld', 0.98, ['JobPosting title']));
      if (item.summary?.organization) fields.company.push(candidate('company', item.summary.organization, 'json-ld', 0.97, ['JobPosting hiring organization']));
    }
  }
  for (const heading of context.headings || []) {
    if (heading.tag === 'h1' && !/^(jobs?|careers?|search|home)$/i.test(heading.text)) fields.title.push(candidate('title', heading.text, 'dom', 0.86, ['visible H1'], heading.handle));
    if (/^(?:location|job location)$/i.test(heading.label) && heading.text) fields.location.push(candidate('location', heading.text, 'aria', 0.75, ['location ARIA label'], heading.handle));
  }
  const descriptionRegions = (context.candidates || []).filter((item) => item.textLength >= 300 && /responsibilit|qualification|requirement|about the (?:job|role)|experience|skills/i.test(item.text));
  for (const region of descriptionRegions) fields.description.push(candidate('description', region.text, 'dom', Math.min(0.9, 0.55 + region.score * 0.3), ['large semantic region with job headings'], region.handle));
  const jobId = context.url.pathname.match(/\/(?:jobs?|positions?|openings?|details)\/(\d{4,})(?:\/|-|$)/i)?.[1];
  if (jobId) fields.jobId.push(candidate('jobId', jobId, 'browser', 0.95, ['stable identifier in path']));
  const apply = (context.actions || []).find((item) => /^(?:easy )?apply(?: now)?$|submit application/i.test(item.text || item.label));
  if (apply?.hrefPath) fields.applicationUrl.push(candidate('applicationUrl', apply.hrefPath, 'dom', 0.8, ['visible application action'], apply.handle));
  return fields;
}

export function selectJobFields(candidateSet) {
  const result = {};
  for (const [field, candidates] of Object.entries(candidateSet)) {
    const selected = [...candidates].sort((a, b) => b.confidence - a.confidence || b.normalizedValue.length - a.normalizedValue.length)[0];
    result[field] = selected ? { value: selected.normalizedValue, confidence: selected.confidence, candidateId: selected.candidateId, method: selected.source, reasons: selected.reasons, evidenceIds: selected.evidenceIds, validation: [] } : { value: null, confidence: 0, method: 'none', reasons: ['No candidate'], evidenceIds: [], validation: [] };
  }
  return result;
}
