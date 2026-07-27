import React from 'react';
import { Link } from 'react-router-dom';
import { ApplicationLogo } from './ApplicationLogo';

export default function AuthCard({ title, subtitle, children }) {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900 dark:bg-[#101216] dark:text-zinc-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-xl shadow-zinc-200/30 dark:border-white/[.06] dark:bg-[#181b21] dark:shadow-black/30">
          <Link to="/login" className="mb-7 inline-flex items-center gap-2 text-sm font-extrabold">
            <ApplicationLogo size={34} />
            TailorFlow
          </Link>
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </section>
      </div>
    </main>
  );
}
