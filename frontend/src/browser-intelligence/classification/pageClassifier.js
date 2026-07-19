export function classifyPage(context, evidence) {
  const kinds = new Map(evidence.map((item) => [item.kind, item]));
  const has = (kind) => kinds.has(kind);
  const specificTitle = (context.headings || []).some((item) => item.tag === 'h1' && item.text.length >= 4 && !/^(jobs?|careers?|search|home)$/i.test(item.text));
  const selectedDetail = has('JOB_ID') && specificTitle;
  const semanticDetail = specificTitle && has('JOB_SECTIONS') && has('SUBSTANTIAL_REGION');
  let primary = 'UNKNOWN';
  let confidence = 0.4;
  let reason = 'Insufficient independent evidence';
  let composite;
  if (has('LOGIN_FORM')) { primary = 'LOGIN'; confidence = 0.95; reason = 'Login evidence'; }
  else if ((has('MULTIPLE_JOB_POSTINGS') || has('REPEATED_JOB_LINKS') || has('SEARCH_UI')) && !selectedDetail) { primary = 'JOB_SEARCH'; confidence = 0.94; reason = 'Multiple jobs with no selected detail'; }
  else if (has('JOB_POSTING_SCHEMA') || selectedDetail || semanticDetail) {
    primary = 'JOB_DETAIL'; confidence = has('JOB_POSTING_SCHEMA') ? 0.98 : selectedDetail ? 0.9 : 0.78;
    reason = has('JOB_POSTING_SCHEMA') ? 'Structured JobPosting' : selectedDetail ? 'Stable job identity and specific title' : 'Specific title and structured JD sections';
    if (has('MULTIPLE_JOB_POSTINGS') || has('REPEATED_JOB_LINKS') || has('SEARCH_UI')) composite = { shell: 'JOB_SEARCH', detail: 'JOB_DETAIL' };
  } else if (has('ARTICLE_CONTEXT')) { primary = 'ARTICLE'; confidence = 0.85; reason = 'Editorial evidence'; }
  return { primary, confidence, reason, evidenceIds: evidence.map((item) => item.id), composite, probabilities: { [primary]: confidence, UNKNOWN: 1 - confidence } };
}
