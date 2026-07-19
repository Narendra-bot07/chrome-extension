import { validateExtractionPlan } from './planValidator.js';

export async function requestAstraPlan({ apiUrl, token, context, evidence, classification, fingerprint, requestId, signal }) {
  const response = await fetch(`${apiUrl}/api/v1/jobs/astra/plan`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ context, evidence, classification, dom_fingerprint: fingerprint, request_id: requestId })
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody?.detail?.code || `ASTRA_PLANNER_HTTP_${response.status}`);
  }
  const payload = await response.json();
  const validation = validateExtractionPlan(payload.plan, context);
  if (!validation.valid) throw new Error(`ASTRA_PLAN_REJECTED:${validation.errors.join('|')}`);
  return { ...payload, plan: validation.normalized };
}
