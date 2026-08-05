import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { applyPageMeta } from '../utils/seo';

/**
 * There was previously no catch-all route at all -- an unmatched hash path
 * rendered nothing (a blank page) rather than a real "not found" state.
 *
 * Note on HTTP status: this is a client-rendered SPA served through a
 * catch-all rewrite to index.html (see vercel.json), so the server always
 * responds 200 regardless of the hash fragment -- there is no server-side
 * routing layer here that could return a genuine HTTP 404 for an invalid
 * in-app path. This is the standard, accepted tradeoff for a client-only
 * SPA; getting a real 404 status would require server-side routing
 * (Next.js-style SSR, or a Vercel Edge Middleware layer), which is a
 * bigger architectural change than this pass makes. This route at least
 * fixes the broken (blank) UX and marks itself noindex.
 */
export default function NotFoundPage() {
  useEffect(() => applyPageMeta({
    title: 'Page not found — Tailr4U',
    description: 'The page you requested could not be found.'
  }), []);

  useEffect(() => {
    const robots = document.querySelector('meta[name="robots"]');
    const previous = robots?.getAttribute('content');
    robots?.setAttribute('content', 'noindex, nofollow');
    return () => { if (previous) robots?.setAttribute('content', previous); };
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-white dark:bg-zinc-950">
      <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white">Page not found</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link
        to="/"
        className="mt-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition"
      >
        Back to homepage
      </Link>
    </main>
  );
}
