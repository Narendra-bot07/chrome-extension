import test from 'node:test';
import assert from 'node:assert/strict';
import { getInitials, normalizeDomain, resolveCompanyDomain } from './companyLogoUtils.js';

test('normalizes only valid supplied company domains', () => {
  assert.equal(normalizeDomain('https://www.microsoft.com/careers'), 'microsoft.com');
  assert.equal(normalizeDomain('google.com'), 'google.com');
  assert.equal(normalizeDomain('Microsoft'), '');
  assert.equal(normalizeDomain(''), '');
});

test('creates a stable initials fallback', () => {
  assert.equal(getInitials('Microsoft'), 'MI');
  assert.equal(getInitials('Price Waterhouse Coopers'), 'PW');
  assert.equal(getInitials(''), 'CO');
});

test('uses verified domains for legacy applications without guessing unknown companies', () => {
  assert.equal(resolveCompanyDomain('', 'Microsoft Corporation'), 'microsoft.com');
  assert.equal(resolveCompanyDomain('', 'NVIDIA Corporation'), 'nvidia.com');
  assert.equal(resolveCompanyDomain('', 'PwC'), 'pwc.com');
  assert.equal(resolveCompanyDomain('', 'Google'), 'google.com');
  assert.equal(resolveCompanyDomain('', 'Acme Widgets'), '');
  assert.equal(resolveCompanyDomain('careers.example.org', 'Microsoft'), 'careers.example.org');
});
