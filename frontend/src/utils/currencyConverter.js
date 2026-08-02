let cachedUsdToInr = 86.5; // Default fallback rate
let lastFetchedTime = 0;

export async function fetchLiveUsdToInrRate() {
  const now = Date.now();
  // Cache rate for 10 minutes
  if (lastFetchedTime && now - lastFetchedTime < 600000) {
    return cachedUsdToInr;
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && data.rates.INR) {
        cachedUsdToInr = data.rates.INR;
        lastFetchedTime = now;
        return cachedUsdToInr;
      }
    }
  } catch (err) {
    console.warn('Realtime currency rate fetch notice:', err);
  }
  return cachedUsdToInr;
}

export function convertUsdToInrSync(usdAmount, rate = cachedUsdToInr) {
  const amount = Number(usdAmount) || 0;
  return Math.round(amount * rate);
}

export function formatInrPrice(inrAmount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(inrAmount);
}
