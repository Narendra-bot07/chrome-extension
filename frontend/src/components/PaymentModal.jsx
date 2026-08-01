import React, { useState } from 'react';
import { X, CreditCard, Landmark, CheckCircle, Globe, ShieldCheck } from 'lucide-react';

export function PaymentModal({ isOpen, onClose, plan, onSelectPayment }) {
  const [selectedProvider, setSelectedProvider] = useState('auto'); // 'stripe' | 'razorpay' | 'auto'
  const [loading, setLoading] = useState(false);

  if (!isOpen || !plan) return null;

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isIndia = selectedProvider === 'razorpay';
      const country = isIndia ? 'IN' : 'US';
      const currency = isIndia ? 'INR' : 'USD';
      const provider = selectedProvider === 'auto' ? (isIndia ? 'razorpay' : 'stripe') : selectedProvider;

      await onSelectPayment({
        planId: plan.id || plan.code,
        country,
        currency,
        provider
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-zinc-950 dark:text-white">Select Payment Gateway</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Upgrading to {plan.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCheckoutSubmit} className="space-y-4">
          <div className="space-y-3">
            {/* International Payments / Stripe */}
            <div
              onClick={() => setSelectedProvider('stripe')}
              className={`cursor-pointer rounded-xl border p-4 flex items-start justify-between transition-all ${
                selectedProvider === 'stripe'
                  ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-600/20'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 mt-0.5">
                  <Globe size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                    Stripe (International)
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      USD / Cards
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Credit / Debit Cards globally. Instant checkout via Stripe.
                  </p>
                </div>
              </div>
              {selectedProvider === 'stripe' && <CheckCircle size={20} className="text-indigo-600 flex-shrink-0 mt-1" />}
            </div>

            {/* Indian Payments / Razorpay */}
            <div
              onClick={() => setSelectedProvider('razorpay')}
              className={`cursor-pointer rounded-xl border p-4 flex items-start justify-between transition-all ${
                selectedProvider === 'razorpay'
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-600/20'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 mt-0.5">
                  <Landmark size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                    Razorpay (India)
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                      INR / UPI
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    UPI, GPay, PhonePe, Netbanking & Indian Cards.
                  </p>
                </div>
              </div>
              {selectedProvider === 'razorpay' && <CheckCircle size={20} className="text-blue-600 flex-shrink-0 mt-1" />}
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2 text-xs text-zinc-400">
            <ShieldCheck size={16} className="text-emerald-500 flex-shrink-0" />
            <span>256-Bit SSL Encrypted & Secure Payment Processing</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              `Proceed to Pay ${plan.price_display || '$' + plan.price_amount}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
