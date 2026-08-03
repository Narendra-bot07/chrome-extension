import React, { memo, useMemo, useState } from 'react';
import { selectProfileImage } from '../services/profilePolicy';
import { formatUserDisplayName, getUserInitials } from '../utils/userNameFormatter';
import BrandLogo from './BrandLogo';

export const APPLICATION_LOGO_SRC = `${import.meta.env.BASE_URL || '/'}application-logo.png`;

export const ApplicationLogo = memo(function ApplicationLogo({
  size = 36,
  variant = 'icon',
  className = '',
  alt = 'Tailr4U logo',
  fallbackLabel = 'Tailr4U'
}) {
  return (
    <BrandLogo size={size} variant={variant} className={className} />
  );
});

export const UserAvatar = memo(function UserAvatar({
  user,
  profile,
  parsedResume,
  size = 32,
  className = ''
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = useMemo(
    () => selectProfileImage(profile, user),
    [profile, user]
  );
  const displayName = formatUserDisplayName(user, profile, parsedResume);
  const initials = getUserInitials(user, profile, parsedResume);
  const dimension = typeof size === 'number' ? `${size}px` : size;

  if (photoUrl && !photoFailed) {
    return (
      <img
        src={photoUrl}
        alt={`${displayName} profile`}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: dimension, height: dimension }}
        loading="lazy"
        decoding="async"
        onError={() => setPhotoFailed(true)}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-tf-accent/20 bg-tf-accent/10 font-bold uppercase text-tf-accent ${className}`}
      style={{ width: dimension, height: dimension }}
      aria-label={displayName}
    >
      {initials}
    </span>
  );
});
