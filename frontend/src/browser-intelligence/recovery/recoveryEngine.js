export const RECOVERY_REASONS = Object.freeze({
  DOM_LOADING: 'DOM_LOADING', DETAIL_PANEL_NOT_MOUNTED: 'DETAIL_PANEL_NOT_MOUNTED',
  LAZY_CONTENT: 'LAZY_CONTENT', SPA_TRANSITION: 'SPA_TRANSITION', NO_PROGRESS: 'NO_PROGRESS'
});

export function diagnoseRecovery(result) {
  if (!result) return { recoverable: true, reason: RECOVERY_REASONS.DOM_LOADING };
  const length = result.description?.length || result.text?.length || 0;
  if (result.jobId && (!result.title || length < 200)) {
    return { recoverable: true, reason: RECOVERY_REASONS.DETAIL_PANEL_NOT_MOUNTED };
  }
  if (result.pageState === 'extraction_incomplete') {
    return { recoverable: true, reason: RECOVERY_REASONS.LAZY_CONTENT };
  }
  return { recoverable: false, reason: null };
}

export function hasProgress(previous, next) {
  if (!previous) return true;
  const prevLength = previous.description?.length || 0;
  const nextLength = next?.description?.length || 0;
  return nextLength > prevLength || (!previous.title && Boolean(next?.title)) || (!previous.company && Boolean(next?.company));
}

export function recoveryDelay(attempt) {
  return [0, 700, 1400, 2200][attempt] || 2200;
}
