import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

import { GoogleOAuthProvider } from '@react-oauth/google';

const isExtension = typeof chrome !== 'undefined' && chrome.identity;
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "984139464223-rb9kbtqjseqbepu9ke8j9qhgna1gh05l.apps.googleusercontent.com";

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isExtension ? (
      <App />
    ) : (
      <GoogleOAuthProvider clientId={clientId}>
        <App />
      </GoogleOAuthProvider>
    )}
  </React.StrictMode>,
)
