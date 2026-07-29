import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  authDestinationFromSearch,
  loginPathFor,
  safeAuthRedirect
} from './authRedirect.js';

test('accepts internal application destinations', () => {
  assert.equal(safeAuthRedirect('/job-tracker'), '/job-tracker');
  assert.equal(authDestinationFromSearch('?redirect=%2Fresumes'), '/resumes');
});

test('rejects external and malformed destinations', () => {
  assert.equal(safeAuthRedirect('https://example.com'), '/dashboard');
  assert.equal(safeAuthRedirect('//example.com'), '/dashboard');
  assert.equal(safeAuthRedirect('/\\example.com'), '/dashboard');
  assert.equal(safeAuthRedirect('/%2Fexample.com'), '/dashboard');
});

test('creates a login URL that retains the protected destination', () => {
  assert.equal(loginPathFor('/job-tracker'), '/login?redirect=%2Fjob-tracker');
});
