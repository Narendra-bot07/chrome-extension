const BASE = 'http://localhost:8000/api/v1';

async function request(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

export const notificationApi = {
  list: (token, params = '') => request(`/notifications/${params ? `?${params}` : ''}`, token),
  count: token => request('/notifications/unread-count', token),
  update: (token, id, status) => request(`/notifications/${id}`, token, { method: 'PATCH', body: JSON.stringify({ status }) }),
  markAllRead: token => request('/notifications/mark-all-read', token, { method: 'POST' }),
  preferences: token => request('/notifications/preferences', token),
  savePreferences: (token, data) => request('/notifications/preferences', token, { method: 'PUT', body: JSON.stringify(data) }),
  reminders: (token, params = '') => request(`/reminders/${params ? `?${params}` : ''}`, token),
  createReminder: (token, data) => request('/reminders/', token, { method: 'POST', body: JSON.stringify(data) }),
  completeReminder: (token, id) => request(`/reminders/${id}/complete`, token, { method: 'POST' }),
  snoozeReminder: (token, id, until) => request(`/reminders/${id}/snooze`, token, { method: 'POST', body: JSON.stringify({ until }) })
};
