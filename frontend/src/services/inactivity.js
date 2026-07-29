import { AUTH_CONFIG } from '../config/authConfig.js';

export const getInactivityState = (
  now,
  lastActivityAt,
  config = AUTH_CONFIG,
) => {
  const idleFor = Math.max(0, now - lastActivityAt);
  return {
    idleFor,
    expired: idleFor >= config.inactivityLimitMs,
    warning: idleFor >= config.inactivityLimitMs - config.warningBeforeMs
      && idleFor < config.inactivityLimitMs,
  };
};
