import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { ApplicationLogo } from './ApplicationLogo';

export default function AuthCard({ title, subtitle, children, onClose, showClose = true }) {
  const navigate = useNavigate();

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/login');
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900 dark:bg-[#101216] dark:text-zinc-100 flex items-center justify-center relative">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
        <section className="relative w-full rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-xl shadow-zinc-200/30 dark:border-white/[.06] dark:bg-[#181b21] dark:shadow-black/30">
          {showClose && (
            <button
              onClick={handleClose}
              className="absolute top-6 right-6 p-2 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition cursor-pointer"
              aria-label="Close"
              title="Close"
            >
              <X size={18} />
            </button>
          )}
          <Link to="/login" className="mb-7 inline-flex items-center gap-2 text-sm font-extrabold">
            <ApplicationLogo size={34} />
            tailr4u
          </Link>
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </section>
      </div>
    </main>
  );
}
