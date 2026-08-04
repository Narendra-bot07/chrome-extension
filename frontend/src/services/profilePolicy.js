export const REQUIRED_PROFILE_FIELDS = [
  'first_name', 'last_name', 'username', 'phone_number', 'country', 'timezone'
];

export function calculateProfileCompleteness(profile = {}) {
  const completed = REQUIRED_PROFILE_FIELDS.filter(
    field => String(profile[field] || '').trim()
  ).length;
  return Math.round((completed / REQUIRED_PROFILE_FIELDS.length) * 100);
}

export function selectProfileImage(profile = {}, user = {}) {
  // Default params only cover `undefined` -- the unauthenticated Playwright
  // PDF-render context genuinely passes `user: null` (AppContext's logged-out
  // state), which skips the default and previously crashed the whole render
  // tree on `null.user_metadata` for every profilePhoto-enabled template.
  const safeProfile = profile || {};
  const safeUser = user || {};
  return safeProfile.uploaded_profile_image_url
    || safeProfile.google_profile_image_url
    || safeProfile.avatar_url
    || safeProfile.photo_url
    || safeProfile.picture
    || safeUser.user_metadata?.avatar_url
    || safeUser.user_metadata?.picture
    || '';
}

export function isGoogleManagedPassword(profile = {}) {
  return profile.auth_provider === 'google' && !profile.has_password_credential;
}
