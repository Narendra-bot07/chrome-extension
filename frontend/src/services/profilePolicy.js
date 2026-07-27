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
  return profile.uploaded_profile_image_url
    || profile.google_profile_image_url
    || profile.avatar_url
    || profile.photo_url
    || profile.picture
    || user.user_metadata?.avatar_url
    || user.user_metadata?.picture
    || '';
}

export function isGoogleManagedPassword(profile = {}) {
  return profile.auth_provider === 'google' && !profile.has_password_credential;
}
