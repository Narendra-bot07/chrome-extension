import assert from 'node:assert/strict';
import test from 'node:test';

import { AUTH_CONFIG } from '../config/authConfig.js';
import { getInactivityState } from './inactivity.js';

test('active use keeps the session below the inactivity threshold', () => {
  const now = 2_000_000;
  assert.equal(getInactivityState(now, now - 1_000).expired, false);
});

test('warning begins at the configured warning threshold and not before', () => {
  const now = 2_000_000;
  const threshold = AUTH_CONFIG.inactivityLimitMs - AUTH_CONFIG.warningBeforeMs;
  assert.equal(getInactivityState(now, now - threshold + 1).warning, false);
  assert.equal(getInactivityState(now, now - threshold).warning, true);
});

test('the configured inactivity limit expires the session', () => {
  const now = 2_000_000;
  const state = getInactivityState(now, now - AUTH_CONFIG.inactivityLimitMs);
  assert.equal(state.expired, true);
  assert.equal(state.warning, false);
});

test('timestamp calculation accounts for browser suspension or laptop sleep', () => {
  const beforeSleep = 1_000_000;
  const afterWake = beforeSleep + AUTH_CONFIG.inactivityLimitMs + 1;
  assert.equal(getInactivityState(afterWake, beforeSleep).expired, true);
});
