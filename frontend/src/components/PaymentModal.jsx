import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Landmark, CheckCircle2, Globe, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import { fetchLiveUsdToInrRate, convertUsdToInrSync, formatInrPrice } from '../utils/currencyConverter';

export function PaymentModal({ isOpen, onClose, plan, onSelectPayment }) {
  const [selectedProvider, setSelectedProvider] = useState('stripe'); // default to 'stripe'
  const [loading, setLoading] = useState(false);
  const [usdToInrRate, setUsdToInrRate] = useState(86.5);
  const [fetchingRate, setFetchingRate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFetchingRate(true);
      fetchLiveUsdToInrRate().then(rate => {
        setUsdToInrRate(rate);
        setFetchingRate(false);
      });
    }
  }, [isOpen]);

  if (!isOpen || !plan || typeof document === 'undefined') return null;

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const isIndia = selectedProvider === 'razorpay';
    const provider = selectedProvider;

    // Synchronously open new tab on click BEFORE async API call so browser popup blocker NEVER blocks it!
    let checkoutTab = null;
    {
      const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
      checkoutTab = window.open('about:blank', '_blank');
      if (checkoutTab && checkoutTab.document) {
        try {
          const bgBody = isDark ? '#090d16' : '#f8fafc';
          const bgCard = isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff';
          const borderCard = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0';
          const textPrimary = isDark ? '#f3f4f6' : '#0f172a';
          const textSecondary = isDark ? '#9ca3af' : '#64748b';
          const tailrColor = isDark ? '#ffffff' : '#0f172a';
          const shadowCard = isDark ? '0 20px 50px rgba(0,0,0,0.5)' : '0 20px 50px rgba(15,23,42,0.08)';
          const logoOrigin = typeof window !== 'undefined' ? window.location.origin : '';

          checkoutTab.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Connecting to Secure Checkout - Tailr4U</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                  height: 100vh;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  background: ${bgBody};
                  color: ${textPrimary};
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                  text-align: center;
                  padding: 24px;
                }
                .card {
                  background: ${bgCard};
                  border: 1px solid ${borderCard};
                  border-radius: 24px;
                  padding: 44px 36px;
                  max-width: 420px;
                  width: 100%;
                  box-shadow: ${shadowCard};
                  backdrop-filter: blur(16px);
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                }
                .logo-container {
                  display: flex;
                  align-items: center;
                  gap: 10px;
                  margin-bottom: 28px;
                }
                .logo-img {
                  width: 36px;
                  height: 36px;
                  object-fit: contain;
                }
                .brand-text {
                  font-size: 26px;
                  font-weight: 800;
                  letter-spacing: -0.5px;
                  color: ${tailrColor};
                  font-family: system-ui, -apple-system, sans-serif;
                }
                .brand-text .num { color: #2563eb; }
                .brand-text .letter { color: #ea580c; }
                .spinner-ring {
                  width: 48px;
                  height: 48px;
                  border: 3px solid ${isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.15)'};
                  border-top-color: #2563eb;
                  border-radius: 50%;
                  animation: spin 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                  margin-bottom: 24px;
                }
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
                h2 {
                  font-size: 18px;
                  font-weight: 600;
                  color: ${textPrimary};
                  margin-bottom: 8px;
                }
                p {
                  font-size: 13px;
                  color: ${textSecondary};
                  line-height: 1.5;
                }
                .badge {
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  margin-top: 24px;
                  padding: 6px 14px;
                  background: ${isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(37, 99, 235, 0.06)'};
                  border: 1px solid ${isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(37, 99, 235, 0.15)'};
                  border-radius: 100px;
                  font-size: 11px;
                  color: #2563eb;
                  font-weight: 500;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="logo-container">
                  <img src="${logoOrigin}/application-logo.png" alt="Tailr4U Logo" class="logo-img" />
                  <div class="brand-text">Tailr<span class="num">4</span><span class="letter">U</span></div>
                </div>
                <div class="spinner-ring"></div>
                <h2>Redirecting to Secure Checkout</h2>
                <p>Establishing encrypted payment session with ${provider === 'razorpay' ? 'Razorpay' : 'Stripe'}...</p>
                <div class="badge">🔒 256-Bit SSL Encrypted</div>
              </div>
            </body>
            </html>
          `);
          checkoutTab.document.close();
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

  const usdPrice = typeof plan.price_amount === 'number' ? plan.price_amount : (plan.price || 9.99);
  const inrAmount = convertUsdToInrSync(usdPrice, usdToInrRate);
  const formattedInr = formatInrPrice(inrAmount);
  const formattedUsd = plan.price_display || `$${usdPrice.toFixed(2)}`;
  const displayPrice = selectedProvider === 'razorpay' ? formattedInr : formattedUsd;

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
                {displayPrice}
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
                    UPI, GPay, PhonePe, Netbanking & Indian Cards ({formattedInr}).
                  </p>
                </div>
              </div>
              {selectedProvider === 'razorpay' && <CheckCircle2 size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />}
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
              <span>256-Bit SSL Encrypted & Secure</span>
            </div>
            {selectedProvider === 'razorpay' && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 font-mono">
                <RefreshCw size={11} className={fetchingRate ? 'animate-spin' : ''} />
                $1 = ₹{usdToInrRate.toFixed(2)}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              `Proceed to Pay ${displayPrice}${selectedProvider === 'razorpay' ? ` (~${formattedUsd})` : ''}`
            )}
          </button>
        </form>

      </div>
    </div>,
    document.body
  );
}
