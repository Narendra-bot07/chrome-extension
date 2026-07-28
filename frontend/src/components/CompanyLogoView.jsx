import React, { memo, useEffect, useMemo, useState } from 'react';
import { getInitials, resolveCompanyDomain } from './companyLogoUtils';

const loadedFavicons = new Set();
const failedFavicons = new Set();
const FAILED_CACHE_KEY = 'tailr4u.failed-company-favicons';

function readFailedFavicons() {
  if (typeof window === 'undefined') return;
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(FAILED_CACHE_KEY) || '[]');
    cached.forEach((src) => failedFavicons.add(src));
  } catch {
    // Private browsing or strict storage policies can disable sessionStorage.
  }
}

function rememberFailedFavicon(src) {
  failedFavicons.add(src);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(FAILED_CACHE_KEY, JSON.stringify([...failedFavicons]));
  } catch {
    // The in-memory cache still prevents repeat requests when storage is unavailable.
  }
}

readFailedFavicons();

function CompanyLogo({
  companyName = 'Company',
  companyDomain = '',
  size = 40,
  className = ''
}) {
  const domain = useMemo(
    () => resolveCompanyDomain(companyDomain, companyName),
    [companyDomain, companyName]
  );
  const src = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
    : '';
  const [loaded, setLoaded] = useState(() => Boolean(src && loadedFavicons.has(src)));
  const [failed, setFailed] = useState(() => Boolean(src && failedFavicons.has(src)));

  useEffect(() => {
    setLoaded(Boolean(src && loadedFavicons.has(src)));
    setFailed(Boolean(src && failedFavicons.has(src)));
  }, [src]);

  const dimension = typeof size === 'number' ? `${size}px` : size;
  const initials = getInitials(companyName);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-extrabold text-teal-700 dark:text-teal-400 ${
        loaded && !failed
          ? 'border border-zinc-200 bg-white shadow-2xs dark:border-zinc-700 dark:bg-zinc-900'
          : 'border border-teal-100 bg-teal-50 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800'
      } ${className}`}
      style={{ width: dimension, height: dimension }}
      aria-label={!loaded || failed ? companyName : undefined}
    >
      <span
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
          loaded && !failed ? 'opacity-0' : 'opacity-100'
        }`}
        aria-hidden={loaded && !failed}
      >
        {initials}
      </span>

      {src && !failed && (
        <img
          src={src}
          alt={`${companyName} logo`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={`absolute inset-0 h-full w-full object-contain p-[18%] transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => {
            loadedFavicons.add(src);
            setLoaded(true);
          }}
          onError={() => {
            rememberFailedFavicon(src);
            setFailed(true);
            setLoaded(false);
          }}
        />
      )}
    </span>
  );
}

export default memo(CompanyLogo);
