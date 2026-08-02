import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Landmark, CheckCircle2, Globe, ShieldCheck, Sparkles } from 'lucide-react';

export function PaymentModal({ isOpen, onClose, plan, onSelectPayment }) {
  const [selectedProvider, setSelectedProvider] = useState('stripe'); // default to 'stripe'
  const [loading, setLoading] = useState(false);

  if (!isOpen || !plan || typeof document === 'undefined') return null;

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const isIndia = selectedProvider === 'razorpay';
    const provider = selectedProvider;

    // Synchronously open new tab on click BEFORE async API call so browser popup blocker NEVER blocks it!
    let checkoutTab = null;
    if (provider !== 'razorpay') {
      checkoutTab = window.open('about:blank', '_blank');
      if (checkoutTab && checkoutTab.document) {
        try {
          checkoutTab.document.title = 'Connecting to Stripe Checkout...';
        } catch (err) {}
      }
    }

    try {
      const country = isIndia ? 'IN' : 'US';
      const currency = isIndia ? 'INR' : 'USD';

      await onSelectPayment({
        planId: plan.id || plan.code,
        country,
        currency,
        provider,
        checkoutTab
      });
    } catch (err) {
      if (checkoutTab && !checkoutTab.closed) {
        checkoutTab.close();
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formattedPrice = plan.price_display || (typeof plan.price_amount === 'number' ? `$${plan.price_amount.toFixed(2)}` : '$9.99');

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/70 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-md my-auto max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-6 sm:p-7 shadow-2xl overflow-y-auto space-y-5">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="text-indigo-600 dark:text-indigo-400" size={18} />
              <h3 className="text-lg sm:text-xl font-black text-zinc-950 dark:text-white tracking-tight">Select Payment Gateway</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5">
              Upgrading to <strong className="text-zinc-900 dark:text-zinc-200 font-bold">{plan.name}</strong>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                {formattedPrice}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Payment Options Form */}
        <form onSubmit={handleCheckoutSubmit} className="space-y-4">
          <div className="space-y-3">
            {/* International Payments / Stripe */}
            <div
              onClick={() => setSelectedProvider('stripe')}
              className={`cursor-pointer rounded-2xl border p-4 flex items-start justify-between transition-all ${
                selectedProvider === 'stripe'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Globe size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                    Stripe (International)
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      USD / CARDS
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    Credit & Debit Cards globally. Instant encrypted checkout via Stripe.
                  </p>
                </div>
              </div>
              {selectedProvider === 'stripe' && <CheckCircle2 size={20} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />}
            </div>

            {/* Indian Payments / Razorpay */}
            <div
              onClick={() => setSelectedProvider('razorpay')}
              className={`cursor-pointer rounded-2xl border p-4 flex items-start justify-between transition-all ${
                selectedProvider === 'razorpay'
                  ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-600/20 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 shrink-0">
                  <Landmark size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                    Razorpay (India)
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                      INR / UPI
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    UPI, GPay, PhonePe, Netbanking & Indian Cards.
                  </p>
                </div>
              </div>
              {selectedProvider === 'razorpay' && <CheckCircle2 size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />}
            </div>
          </div>

          <div className="pt-1 flex items-center gap-2 text-xs text-zinc-400">
            <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
            <span>256-Bit SSL Encrypted & Secure Payment Processing</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              `Proceed to Pay ${formattedPrice}`
            )}
          </button>
        </form>

      </div>
    </div>,
    document.body
  );
}
