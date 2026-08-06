import React from 'react';
import { HashRouter } from 'react-router-dom';
import PrintLayout from './components/Resume/PrintLayout';

// Minimal server-side Chromium entry point. Keeping the regular App tree out
// of this route avoids loading landing/auth/dashboard providers and then
// waiting for a second lazy PrintLayout request before Auto-Fit can start.
export default function PdfPrintApp() {
  return (
    <HashRouter>
      <PrintLayout />
    </HashRouter>
  );
}
