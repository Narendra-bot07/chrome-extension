import React from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import BrandLogo from '../BrandLogo';

export function PaymentStatusModal({ isOpen, status, planName, onClose, onRetry, onCheckStatus }) {
  if (!isOpen || typeof document === 'undefined') return null;

  const isPending = status === 'pending' || status === 'processing';
  const isSuccess = status === 'success';
  const isFailed = status === 'failed' || status === 'cancelled';
  const isUnknown = status === 'unknown';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-md my-auto max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-6 sm:p-7 shadow-2xl overflow-y-auto space-y-5">
        
        {/* Header with Close */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-indigo-600 dark:text-indigo-400" size={20} />
            <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Payment Status</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Content */}
        {isPending && (
          <div className="text-center space-y-4 py-4">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 animate-spin" />
              <BrandLogo size={28} variant="icon" className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-950 dark:text-white tracking-tight">Payment in Progress</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Please complete your checkout in the payment window for <strong className="text-zinc-800 dark:text-zinc-200">{planName}</strong>.
              </p>
            </div>
          </div>
        )}

        {isSuccess && (
          <div className="text-center space-y-4 py-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-950 dark:text-white">Payment Successful! 🎉</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Your subscription to <strong className="text-emerald-600 dark:text-emerald-400">{planName}</strong> is now active!
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
              All higher limits and premium features have been unlocked for your account.
            </div>
          </div>
        )}

        {isFailed && (
          <div className="text-center space-y-4 py-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <AlertCircle size={36} />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-950 dark:text-white">
                {status === 'cancelled' ? 'Payment Cancelled' : 'Payment Failed'}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                The transaction was not completed. No charges were made to your account.
              </p>
            </div>
          </div>
        )}

        {isUnknown && (
          <div className="text-center space-y-4 py-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <AlertCircle size={36} />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-950 dark:text-white">Still Confirming...</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                We couldn't confirm your payment yet. If you completed checkout, it may still be
                processing — check <strong className="text-zinc-800 dark:text-zinc-200">{planName}</strong> status again in a moment, or try again if it didn't go through.
              </p>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-2">
          {isPending && (
            <button
              onClick={onClose}
              className="w-full rounded-xl py-3 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel / Close
            </button>
          )}

          {isSuccess && (
            <button
              onClick={onClose}
              className="w-full rounded-xl py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-sm shadow-md shadow-emerald-500/20 cursor-pointer transition-all"
            >
              Great, Continue!
            </button>
          )}

          {isFailed && (
            <div className="space-y-2">
              <button
                onClick={() => {
                  onClose();
                  if (onRetry) onRetry();
                }}
                className="w-full rounded-xl py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-sm shadow-md shadow-indigo-500/20 cursor-pointer transition-all"
              >
                Try Upgrade Again
              </button>
              <button
                onClick={onClose}
                className="w-full rounded-xl py-2 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {isUnknown && (
            <div className="space-y-2">
              {onCheckStatus && (
                <button
                  onClick={onCheckStatus}
                  className="w-full rounded-xl py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-sm shadow-md shadow-indigo-500/20 cursor-pointer transition-all"
                >
                  Check Again
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full rounded-xl py-2 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
