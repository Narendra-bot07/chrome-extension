# Chrome Web Store Submission — Copy-Paste Reference

Everything below is meant to be copied straight into the fields at
[chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
when creating the listing. Code-side prep is done; this covers the content
only you can submit (needs your developer account).

---

## Before you start

1. **Register a developer account** (one-time): [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) → pay the one-time $5 registration fee if you haven't already.
2. **Build the package**: `cd frontend && npm run build`, then zip the *contents* of `frontend/dist/` (not the folder itself) so `manifest.json` sits at the zip root — or just download the `chrome-extension-bundle` artifact from the next GitHub Actions CI run on this repo, which now does this correctly.
3. **Privacy policy URL**: `https://tailr4u.com/#/privacy-policy` (live once this deploy ships — new page, not yet in production).

---

## Store Listing tab

**Title** (max 45 chars)
```
Tailr4U — AI Resume Tailor & ATS Optimizer
```

**Summary** (max 132 chars, shown in search results)
```
Extract any job posting in 1 click, tailor your resume with AI, and export an ATS-ready PDF — right from your browser.
```

**Description** (detailed, up to 16,000 chars)
```
Tailr4U helps you apply to jobs faster without sending a generic resume.

HOW IT WORKS
1. Open any job posting — LinkedIn, Indeed, a company careers page, anywhere.
2. Click the Tailr4U icon to open the side panel and extract the job description in one click.
3. Tailr4U's AI compares the job description against your resume and rewrites your existing bullet points to better match the role's language and requirements — without inventing experience you don't have.
4. Download a polished, ATS-optimized PDF, ready to submit.

KEY FEATURES
• One-click job description extraction from any job posting page
• AI-powered resume tailoring that keeps your real experience truthful
• ATS compatibility scoring
• Cover letter generation
• Job application tracking across every role you apply to
• Multiple professional resume templates
• Works as a Chrome side panel — no tab switching required

PRIVACY
Tailr4U only reads a page's content when you actively choose to extract a job description — it does not run in the background or track your general browsing. Your resume content is never used to train AI models or sold to third parties. Full privacy policy: https://tailr4u.com/#/privacy-policy

Questions or feedback? support@tailr4u.com
```

**Category**: Productivity

**Language**: English

---

## Privacy practices tab

Chrome requires a **single purpose** statement and a justification for every
requested permission. Use these:

**Single purpose description**
```
Tailr4U helps users tailor their resume to a specific job posting using AI,
by extracting the job description from the page the user is viewing and
generating a customized, ATS-optimized resume and cover letter.
```

**Permission justifications** (one text box per permission in the dashboard):

| Permission | Justification |
|---|---|
| `activeTab` | Used to identify the job posting page the user is currently viewing when they choose to extract a job description. |
| `tabs` | Used to read the URL/title of the active tab so the extension can detect when the user is on a job posting page and offer extraction. |
| `scripting` | Used to read the visible text of a job posting page, but only when the user explicitly triggers extraction — never automatically in the background. |
| `storage` | Used to keep the user signed in and remember local preferences (e.g. theme) between sessions. |
| `downloads` | Used to save the user's generated resume/cover letter PDF to their device. |
| `identity` | Used to support "Sign in with Google" via Chrome's native OAuth flow. |
| `sidePanel` | Used to display the Tailr4U interface in Chrome's side panel, the extension's primary UI surface. |
| Host permissions (`*://*/*`) | Job postings are hosted across thousands of different company career sites and job boards with no fixed domain list. Broad host access lets the extension work on whichever site the user is currently viewing when they choose to extract a job description; it is not used to access sites the user hasn't interacted with the extension on. |

**Remote code use**
```
No, I am not using remote code
```
Verified against the actual bundle: `index.html`'s Google Analytics and
Microsoft Clarity `<script>` injections are both explicitly guarded with
`if (location.protocol === "chrome-extension:") return;`, and the Google
Identity Services script (loaded by `@react-oauth/google`) is never mounted
in the extension context either (`GoogleOAuthProvider` is skipped whenever
`isExtension` is true — Google sign-in instead uses `chrome.identity.launchWebAuthFlow`,
which is a native Chrome API call, not remotely fetched code). Nothing the
packaged extension executes is fetched from a remote server at runtime.

**Data usage disclosure checkboxes** (the dashboard asks you to declare what
data types the extension handles — check these as "Yes, collected"):
- Personally identifiable information (email address)
- Authentication information (OAuth tokens, session tokens)
- Website content (job posting text, only when extraction is triggered)
- User activity (which pages/features are used, for the web app only — not the extension itself, since GA4/Clarity are explicitly disabled inside the `chrome-extension:` context)

For each, you'll also confirm:
- Data is not sold to third parties — **true**, check this.
- Data is not used for purposes unrelated to the extension's core functionality — **true**.
- Data is not used to determine creditworthiness or for lending purposes — **true**.

Link the privacy policy URL in the field provided: `https://tailr4u.com/#/privacy-policy`

---

## Graphic assets tab (you'll need to produce these)

| Asset | Size | Required? | Status |
|---|---|---|---|
| Store icon | 128×128 PNG | Required | ✅ Done — `docs/store-assets/icon-128.png`, resized from `frontend/public/icon-512.png` |
| Screenshots | 1280×800 or 640×400, up to 5 | At least 1 required | Needs you — real screenshots of the side panel in use (job extraction, tailored result, PDF download) |
| Small promo tile | 440×280 | Optional, improves discoverability | Not done |
| Marquee promo tile | 1400×560 | Optional, only used if Google features the extension | Not done |

---

## Publisher Settings (separate from the item page)

Chrome won't let you publish *any* item until the developer account itself
has a verified contact email — this is a one-time account-level step, done
from the dashboard's left nav **Settings** page, not the item edit page:

1. Left nav → **Settings** → **Publisher contact email**.
2. Enter an email (e.g. `support@tailr4u.com`, or whatever you actually want to receive Chrome Web Store correspondence at).
3. Chrome sends a verification link to that inbox — click it.
4. Once verified, the "you must verify the publisher's contact email" error clears account-wide, for this and any future items.

## After submission

Review typically takes anywhere from a few hours to ~2 weeks. Extensions
requesting broad host permissions or handling OAuth sometimes get a manual
review pass, which can take longer than average — the permission
justifications above are written specifically to pre-empt the most common
rejection reason (unclear justification for `*://*/*`).
