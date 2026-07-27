import React, { memo, useMemo, useState } from 'react';
import { getInitials } from './companyLogoUtils';

export const APPLICATION_LOGO_SRC = `${import.meta.env.BASE_URL || '/'}application-logo.png`;

export const ApplicationLogo = memo(function ApplicationLogo({
  size = 40,
  className = '',
  alt = 'TailorFlow logo',
  fallbackLabel = 'TailorFlow'
}) {
  const [failed, setFailed] = useState(false);
  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: dimension, height: dimension }}
      aria-label={failed ? fallbackLabel : undefined}
    >
      {failed ? (
        <span className="font-extrabold">{getInitials(fallbackLabel)}</span>
      ) : (
        <img
          src={APPLICATION_LOGO_SRC}
          alt={alt}
          className="h-full w-full object-contain"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
});

export const UserAvatar = memo(function UserAvatar({
  user,
  profile,
  size = 32,
  className = ''
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = useMemo(
    () => profile?.avatar_url
      || profile?.photo_url
      || profile?.picture
      || user?.user_metadata?.avatar_url
      || user?.user_metadata?.picture
      || '',
    [profile, user]
  );
  const displayName = profile?.full_name
    || user?.user_metadata?.full_name
    || user?.email?.split('@')[0]
    || 'User';
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
    <ApplicationLogo
      size={size}
      className={className}
      alt="TailorFlow profile placeholder"
      fallbackLabel={displayName}
    />
  );
});
