import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { applyPageMeta } from '../utils/seo';
import BrandLogo from '../components/BrandLogo';
import '../pages/LandingPage.css';
import './PrivacyPolicyPage.css';

const LAST_UPDATED = 'August 5, 2026';

/**
 * Public, unauthenticated route -- required for Chrome Web Store submission
 * (any extension handling personal data must link a live privacy policy URL
 * in its store listing) and for general legal compliance. Shares the
 * .landing-page background/gradient and --ink/--muted/--line/--blue/--teal
 * tokens from LandingPage.css rather than a separate palette, so it looks
 * like the same product instead of a bolted-on legal page. Content reflects
 * what this codebase actually does (DeepSeek/Gemini LLM calls, Supabase,
 * Cloudflare R2, Resend, Stripe/Razorpay, Sentry with redaction, GA4/Clarity)
 * rather than generic boilerplate -- still worth a real legal review before
 * relying on it, particularly for GDPR/CCPA-specific obligations.
 */
export default function PrivacyPolicyPage() {
  useEffect(() => applyPageMeta({
    title: 'Privacy Policy — Tailr4U',
    description: 'How Tailr4U collects, uses, stores, and protects your data across the web app and Chrome extension.'
  }), []);

  return (
    <div className="landing-page">
      <header className="pp-header">
        <Link to="/" className="lp-brand" aria-label="Tailr4U home">
          <BrandLogo size={32} />
        </Link>
        <Link to="/" className="pp-back">
          <ArrowLeft size={14} /> Back to homepage
        </Link>
      </header>

      <main className="pp-main">
        <span className="pp-eyebrow"><ShieldCheck size={13} /> Privacy Policy</span>
        <h1>Your data, handled honestly.</h1>
        <p className="pp-updated">Last updated: {LAST_UPDATED}</p>

        <div className="pp-card">
          <p className="pp-intro">
            Tailr4U ("we", "us", "our") provides an AI-assisted resume tailoring service through a web
            application and a companion Chrome extension. This policy explains what information we collect
            across both, why we collect it, who we share it with, and the choices you have.
          </p>

          <section className="pp-section">
            <h2>1. Information We Collect</h2>
            <ul>
              <li><strong>Account information</strong> — email address, and name/profile picture if you sign in with Google.</li>
              <li><strong>Resume content</strong> — the text, formatting, and file(s) you upload (PDF, DOCX, DOC, or TXT) when creating or tailoring a resume.</li>
              <li><strong>Job description content</strong> — text you paste manually, or that the Chrome extension extracts from a job posting page you actively choose to scan.</li>
              <li><strong>Usage data</strong> — pages visited, features used, and application/job-tracking activity you record in the app.</li>
              <li><strong>Payment information</strong> — if you subscribe to a paid plan, payment is processed directly by Stripe or Razorpay; we do not receive or store your full card details.</li>
              <li><strong>Technical data</strong> — IP address, browser/device type, and error/crash diagnostics, collected automatically.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>2. How We Use Your Information</h2>
            <p>
              To generate ATS-optimized resumes and cover letters tailored to a specific job description, using
              third-party large language model providers (currently DeepSeek and/or Google Gemini, depending on
              availability); to render and export your tailored documents as PDF files; to operate your account —
              authentication, subscription/usage limits, job application tracking, and email notifications; and to
              detect, diagnose, and fix bugs or abuse, keeping the service secure and available.
            </p>
            <p style={{ marginTop: 12 }}>
              Resume and job description content is sent to our LLM providers solely to generate your tailored
              output. We do not use your resume content to train AI models, and we do not sell your personal
              data to anyone.
            </p>
          </section>

          <section className="pp-section">
            <h2>3. Third-Party Services We Use</h2>
            <p style={{ marginBottom: 14 }}>We rely on the following categories of infrastructure providers to operate Tailr4U. Each processes only the data necessary for its function:</p>
            <ul>
              <li><strong>Supabase</strong> — authentication and primary database storage.</li>
              <li><strong>Cloudflare R2</strong> — storage for generated PDF documents.</li>
              <li><strong>DeepSeek / Google Gemini</strong> — AI text generation for resume/cover letter tailoring.</li>
              <li><strong>Resend</strong> — transactional email delivery (verification, password reset, notifications).</li>
              <li><strong>Stripe / Razorpay</strong> — payment processing for paid plans.</li>
              <li><strong>Sentry</strong> — error/crash monitoring. Before any event is sent, we strip resume text, job description text, passwords, tokens, and email addresses from the report — Sentry only ever sees the technical error itself, not your content.</li>
              <li><strong>Google Analytics / Microsoft Clarity</strong> — aggregate usage analytics on the web app (not active inside the Chrome extension).</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>4. Chrome Extension Permissions</h2>
            <p style={{ marginBottom: 14 }}>The Tailr4U Chrome extension requests the following permissions, each used strictly for the stated purpose:</p>
            <ul>
              <li><strong>activeTab / tabs</strong> — to identify the job posting page you're viewing and offer to extract it.</li>
              <li><strong>scripting</strong> — to read the visible text of a job posting page when you explicitly trigger extraction. We do not read pages you haven't asked us to scan, and we don't collect general browsing history.</li>
              <li><strong>host permissions (all sites)</strong> — job postings are hosted on thousands of different company career sites and job boards with no fixed domain list, so the extension needs the technical ability to run on whichever site you're currently viewing when you choose to extract a job description. It does not run automatically in the background on sites you haven't interacted with the extension on.</li>
              <li><strong>storage</strong> — to keep you signed in and remember local preferences.</li>
              <li><strong>downloads</strong> — to save your generated PDF to your device.</li>
              <li><strong>identity</strong> — to support signing in with Google via Chrome's OAuth flow.</li>
              <li><strong>sidePanel</strong> — to display the Tailr4U interface in Chrome's side panel.</li>
            </ul>
          </section>

          <section className="pp-section">
            <h2>5. Data Retention & Deletion</h2>
            <p>
              We retain your account data and uploaded resumes for as long as your account is active. You can
              delete individual resumes or job entries from within the app at any time. To request full account
              deletion and removal of all associated personal data, contact us using the details below — we'll
              process the request within a reasonable timeframe.
            </p>
          </section>

          <section className="pp-section">
            <h2>6. Data Security</h2>
            <p>
              We use industry-standard measures to protect your data, including encrypted connections (HTTPS/TLS)
              for all traffic, access-controlled database policies, and redaction of sensitive content before it
              reaches diagnostic/monitoring tools. No method of transmission or storage is 100% secure, but we
              work to protect your information to a high standard.
            </p>
          </section>

          <section className="pp-section">
            <h2>7. Children's Privacy</h2>
            <p>
              Tailr4U is not directed at children under 16, and we do not knowingly collect personal information
              from them.
            </p>
          </section>

          <section className="pp-section">
            <h2>8. Your Rights</h2>
            <p>
              Depending on where you live, you may have rights to access, correct, export, or delete your
              personal data, and to object to or restrict certain processing. Contact us to exercise any of
              these rights.
            </p>
          </section>

          <section className="pp-section">
            <h2>9. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be reflected by updating the
              "Last updated" date above.
            </p>
          </section>

          <section className="pp-section">
            <h2>10. Contact Us</h2>
            <p>
              Questions about this policy or your data? Email us at <a href="mailto:founder@tailr4u.com">founder@tailr4u.com</a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="pp-footer">
        <span>&copy; {new Date().getFullYear()} Tailr4U</span>
      </footer>
    </div>
  );
}
