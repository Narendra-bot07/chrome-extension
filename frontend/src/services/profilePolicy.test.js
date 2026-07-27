import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProfileCompleteness,
  isGoogleManagedPassword,
  selectProfileImage
} from './profilePolicy.js';

test('uploaded photo overrides Google photo', () => {
  assert.equal(selectProfileImage({
    uploaded_profile_image_url: 'uploaded',
    google_profile_image_url: 'google'
  }), 'uploaded');
});

test('Google photo is used when no uploaded photo exists', () => {
  assert.equal(selectProfileImage({ google_profile_image_url: 'google' }), 'google');
});

test('profile completeness uses only real required fields', () => {
  assert.equal(calculateProfileCompleteness({ first_name: 'Ada' }), 17);
  assert.equal(calculateProfileCompleteness({
    first_name: 'Ada',
    last_name: 'Lovelace',
    username: 'ada',
    phone_number: '123',
    country: 'UK',
    timezone: 'Europe/London'
  }), 100);
});

test('Google-only accounts expose managed password state', () => {
  assert.equal(isGoogleManagedPassword({
    auth_provider: 'google',
    has_password_credential: false
  }), true);
  assert.equal(isGoogleManagedPassword({
    auth_provider: 'google',
    has_password_credential: true
  }), false);
});
