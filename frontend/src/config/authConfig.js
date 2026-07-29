export const AUTH_CONFIG = Object.freeze({
  inactivityLimitMs: 30 * 60 * 1000,
  warningBeforeMs: 2 * 60 * 1000,
  activityThrottleMs: 30 * 1000,
  inactivityCheckMs: 30 * 1000,
  serverActivityThrottleMs: 5 * 60 * 1000,
  refreshBeforeExpiryMs: 2 * 60 * 1000,
});

export const AUTH_STORAGE = Object.freeze({
  accessToken: 'access_token',
  lastActivityAt: 'tailorflow_last_activity_at',
  event: 'tailorflow_auth_event',
});
