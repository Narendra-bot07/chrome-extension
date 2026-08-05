import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './dark-theme.css'

import { initSentry } from './observability/sentry';
import { RootErrorBoundary } from './observability/ErrorBoundary';

// Start Sentry tracking
initSentry();

try {
  const theme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', theme === 'dark' || (!theme && prefersDark));
} catch {
  // Storage can be unavailable in restricted extension/browser contexts.
}

// GoogleOAuthProvider previously wrapped the whole app here unconditionally,
// which makes @react-oauth/google inject Google's Identity Services script
// (accounts.google.com/gsi/client, 80KB+) on EVERY page load, including the
// bare homepage, before any user interaction. The only real consumer is
// PublicAuthPanel.jsx (the login/register UI), which is already lazy-loaded
// and only rendered once the user is actually on /login, /register, etc. --
// so the provider now lives there instead, scoped to just that component.
// See PublicAuthPanel.jsx.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)
