export function formatUserDisplayName(user, profile, parsedResume = null) {
  // 1. Direct profile or metadata full name
  const nameFromProfile = profile?.full_name || profile?.preferred_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
  if (nameFromProfile && nameFromProfile.trim()) {
    return nameFromProfile.trim();
  }

  const nameFromMetadata = user?.user_metadata?.full_name || user?.full_name;
  if (nameFromMetadata && nameFromMetadata.trim()) {
    return nameFromMetadata.trim();
  }

  // 2. Name from parsed resume
  const nameFromResume = parsedResume?.personal_info?.name || parsedResume?.personal_info?.full_name;
  if (nameFromResume && nameFromResume.trim()) {
    return nameFromResume.trim();
  }

  // 3. Clean email handle fallback
  const email = user?.email || '';
  if (email && email.includes('@')) {
    const handle = email.split('@')[0];
    const cleanHandle = handle.replace(/\d+/g, '').replace(/[._-]/g, ' ').trim();
    if (cleanHandle.length >= 2) {
      return cleanHandle.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    return handle;
  }

  return 'User';
}

export function getUserInitials(user, profile, parsedResume = null) {
  const name = formatUserDisplayName(user, profile, parsedResume);
  const clean = String(name || '').trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return 'U';
}
