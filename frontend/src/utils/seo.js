/**
 * Client-side page metadata helper.
 *
 * Honest limitation: this is a client-rendered SPA with no SSR, so calling
 * this only updates the DOM after React mounts and runs effects -- it helps
 * the browser tab title, JS-executing crawlers (Googlebot renders JS), and
 * anything reading the live DOM. It does NOT change what non-JS clients see
 * (curl, most social-preview scrapers, a crawler that skips rendering) --
 * those only ever see index.html's static <head>, which is why that file
 * carries the canonical title/description/OG/Twitter tags for the one real
 * route this app currently serves. Use this for in-app polish and to keep
 * the door open for per-route metadata if the app ever moves to path-based
 * routing with SSR/prerendering.
 */

const DEFAULT_TITLE = 'Tailr4U';
const SITE_URL = 'https://tailr4u.com';

/**
 * Applies (and cleans up) a page's <title> and meta description.
 * Call from a page-level useEffect:
 *
 *   useEffect(() => applyPageMeta({
 *     title: 'Tailr4U — Stronger applications, grounded in your experience',
 *     description: '...'
 *   }), []);
 */
export function applyPageMeta({ title, description } = {}) {
  const previousTitle = document.title;
  if (title) document.title = title;

  let descriptionTag = null;
  let previousDescription = null;
  if (description) {
    descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag) {
      previousDescription = descriptionTag.getAttribute('content');
      descriptionTag.setAttribute('content', description);
    }
  }

  return () => {
    document.title = previousTitle || DEFAULT_TITLE;
    if (descriptionTag && previousDescription != null) {
      descriptionTag.setAttribute('content', previousDescription);
    }
  };
}

/** Builds an absolute production URL for a given app-relative path. */
export function absoluteUrl(path = '/') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** JSON-LD BreadcrumbList generator for nested public pages. */
export function breadcrumbListJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
