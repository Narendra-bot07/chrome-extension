export async function fetchSubscription(apiUrl, token) {
  const res = await fetch(`${apiUrl}/api/v1/subscription/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to fetch subscription.");
  return res.json();
}

export async function fetchPlans(apiUrl) {
  const res = await fetch(`${apiUrl}/api/v1/plans`);
  if (!res.ok) throw new Error("Failed to fetch plans.");
  return res.json();
}

export async function cancelSubscription(apiUrl, token) {
  const res = await fetch(`${apiUrl}/api/v1/subscription/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to cancel subscription.");
  return res.json();
}

export async function reactivateSubscription(apiUrl, token) {
  const res = await fetch(`${apiUrl}/api/v1/subscription/reactivate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Failed to reactivate subscription.");
  return res.json();
}
