export const AUTH_CONFIG = Object.freeze({
  inactivityLimitMs: 12 * 60 * 60 * 1000,
  warningBeforeMs: 5 * 60 * 1000,
  activityThrottleMs: 30 * 1000,
  inactivityCheckMs: 60 * 1000,
  serverActivityThrottleMs: 5 * 60 * 1000,
  refreshBeforeExpiryMs: 5 * 60 * 1000,
});

export const AUTH_STORAGE = Object.freeze({
  accessToken: 'access_token',
  lastActivityAt: 'tailr4u_last_activity_at',
  event: 'tailr4u_auth_event',
});
