export const EXTRACTION_STATUSES = Object.freeze({
  SUCCESS: 'success', PARTIAL: 'partial', UNCERTAIN: 'uncertain',
  NON_TARGET: 'non_target', INCOMPLETE: 'incomplete', FAILED: 'failed', CANCELLED: 'cancelled'
});

export function assertExtractionResult(value) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_EXTRACTION_RESULT');
  if (typeof value.classification !== 'string') throw new Error('MISSING_CLASSIFICATION');
  if (!Number.isFinite(Number(value.confidence))) throw new Error('INVALID_CONFIDENCE');
  if (value.description != null && typeof value.description !== 'string') throw new Error('INVALID_DESCRIPTION');
  return value;
}

export function createExtractionSession({ tabId, url, navigationKey, engineVersion = 'bie-1' }) {
  const controller = new AbortController();
  return {
    sessionId: crypto.randomUUID?.() || `bie-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    attemptId: 0,
    tabId,
    url,
    navigationKey,
    engineVersion,
    startedAt: new Date().toISOString(),
    controller,
    signal: controller.signal
  };
}
