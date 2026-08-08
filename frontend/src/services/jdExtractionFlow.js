export const JD_LOG_PREFIX = "[JD-EXTRACTION][FRONTEND]";

export function hasCapturedJobEvidence(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (
      String(value.selected_panel_text || '').trim()
      || String(value.visible_text || '').trim()
      || String(value.html || '').trim()
    )
  );
}

export function isExtractableHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    // Browser/vendor account consoles are authenticated application surfaces,
    // not public job pages. Sending them to the backend both wastes a browser
    // timeout and risks capturing unrelated private dashboard text.
    if (
      (host === 'chrome.google.com' && path.startsWith('/webstore'))
      || host === 'chromewebstore.google.com'
      || path.includes('/webstore/devconsole')
    ) return false;
    return true;
  } catch {
    return false;
  }
}

export function classifyBrowserPageUrl(value) {
  const url = String(value || '');
  if (/^chrome-extension:\/\//i.test(url)) return 'extension-internal';
  if (
    /^chrome:\/\/(?:newtab|new-tab-page)\b/i.test(url)
    || /^edge:\/\/newtab\b/i.test(url)
    || /^about:(?:blank|newtab)\b/i.test(url)
  ) return 'browser-new-tab';
  if (/^(?:chrome|edge|about|file|view-source):/i.test(url)) return 'page-inaccessible';
  return isExtractableHttpUrl(url) ? 'web' : 'page-inaccessible';
}

export async function captureActiveTabJobEvidence(tabId) {
  if (!tabId || !chrome?.scripting?.executeScript) return null;
  let lastError = null;
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
      const cleanText = (value, limit) => String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, limit);
      // LinkedIn (and several other portals) collapse a long job description
      // behind a "...see more" toggle -- the full text simply isn't in the
      // DOM until that's clicked. Confirmed real-world case (2026-08-08, a
      // Charles Schwab posting on LinkedIn): only a small trailing fragment
      // of an otherwise very rich JD (full Key Responsibilities / Required
      // Qualifications / Preferred Qualifications sections were entirely
      // absent) got captured, because the description was still collapsed
      // when the tab was scanned. Click every matching toggle and give the
      // DOM a moment to expand before any text is read below, so scoring
      // and capture both see the fully expanded content.
      const expandTruncatedContent = () => {
        const toggleTextPattern = /^(see more|show more|read more|\u2026\s*more)$/i;
        const clickable = Array.from(document.querySelectorAll('button, a, span[role="button"], [role="button"]'));
        let clicked = 0;
        for (const el of clickable) {
          const text = (el.innerText || el.textContent || '').trim();
          if (toggleTextPattern.test(text)) {
            try {
              el.click();
              clicked += 1;
            } catch {
              // Best-effort only -- a toggle that can't be clicked just
              // leaves that section collapsed, same as before this fix.
            }
          }
        }
        return clicked;
      };
      if (expandTruncatedContent() > 0) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        // A second pass: expanding one toggle (e.g. the job description)
        // can reveal or reflow further content with its own separate
        // toggle (e.g. a company "About us" blurb) that didn't exist in
        // the DOM at all until the first click ran.
        expandTruncatedContent();
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const jobSignals = /\b(job description|responsibilities|qualifications|requirements|what you.ll do|what to expect|apply now|easy apply|full.time|part.time|experience)\b/gi;
      const roots = [document];
      const shadowRoots = [];
      document.querySelectorAll('*').forEach((node) => {
        if (node.shadowRoot) shadowRoots.push(node.shadowRoot);
      });
      roots.push(...shadowRoots);
      const iframeEvidence = [];
      document.querySelectorAll('iframe').forEach((frame) => {
        try {
          if (frame.contentDocument) {
            roots.push(frame.contentDocument);
            const frameText = cleanText(frame.contentDocument.body?.innerText, 30000);
            if (frameText) iframeEvidence.push(frameText);
          }
        } catch {
          // Cross-origin frames remain inaccessible by browser policy.
        }
      });
      const portalPanelSelectors = location.hostname.includes('linkedin.com')
        ? [
            '.jobs-description__content',
            '.jobs-description-content__text',
            '.jobs-box__html-content',
            '.jobs-description',
            '#job-details'
          ]
        : [];
      const portalCandidates = portalPanelSelectors.flatMap((selector) =>
        roots.flatMap((root) => Array.from(root.querySelectorAll(selector))).map((node) => ({
          node,
          selector,
          portalOptimized: true
        }))
      );
      const genericCandidates = roots.flatMap((root) => Array.from(root.querySelectorAll(
        '[role="dialog"], [role="main"], article, main, aside, section'
      ))).map((node) => ({ node, selector: null, portalOptimized: false }));
      const candidates = [...portalCandidates, ...genericCandidates]
        .filter(({ node, portalOptimized }) => {
          const rect = node.getBoundingClientRect();
          return portalOptimized || (rect.width > 220 && rect.height > 180);
        })
        .map(({ node, selector, portalOptimized }) => {
          const text = cleanText(node.innerText, 50000);
          const signals = (text.match(jobSignals) || []).length;
          // A known description container is an optimization, not a requirement.
          // Generic candidates remain available for every portal.
          const score = (portalOptimized ? 100000 : 0)
            + signals * 1000
            + Math.min(text.length, 20000);
          return { node, text, score, selector, portalOptimized };
        })
        .filter((item) => item.text.length >= 200)
        .sort((a, b) => b.score - a.score);
      const selected = candidates[0] || null;
      let panelText = selected?.text || '';
      const firstText = (selectors) => {
        for (const selector of selectors) {
          const value = cleanText(document.querySelector(selector)?.innerText, 500);
          if (value) return value;
        }
        return '';
      };
      const genericTitleNoise = /^(?:jobs?|careers?|job search|search jobs|opportunities|open positions|single position|job details?|join us|home)$/i;
      const visibleHeadingCandidates = Array.from(
        (selected?.node || document).querySelectorAll('h1,h2,h3,[class*="job-title"],[class*="jobTitle"]')
      ).map((node, index) => ({
        text: cleanText(node.innerText, 220),
        index,
        inSelectedPanel: Boolean(selected?.node?.contains(node)),
        headingLevel: /^H[1-3]$/.test(node.tagName) ? Number(node.tagName.slice(1)) : 4,
        visible: (() => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || 1) > 0
            && rect.width > 2
            && rect.height > 2
            && node.getClientRects().length > 0
            && node.getAttribute('aria-hidden') !== 'true';
        })()
      })).filter(({ text }) => (
        text.length >= 3
        && text.length <= 180
        && !genericTitleNoise.test(text)
        && !/^(?:job description|qualifications|requirements|responsibilities|company)$/i.test(text)
      )).filter(({ visible }) => visible).sort((a, b) => (
        Number(b.inSelectedPanel) - Number(a.inSelectedPanel)
        || a.headingLevel - b.headingLevel
        || a.index - b.index
      ));
      const selectedHeading = visibleHeadingCandidates[0]?.text || '';
      const jobTitleHint = location.hostname.includes('linkedin.com')
        ? firstText([
            '.job-details-jobs-unified-top-card__job-title',
            '.jobs-unified-top-card__job-title',
            '.job-details-jobs-unified-top-card__job-title h1',
            'h1'
          ])
        : selectedHeading;
      if (jobTitleHint && panelText) {
        const titleIndex = panelText.toLocaleLowerCase().indexOf(jobTitleHint.toLocaleLowerCase());
        if (titleIndex >= 0) panelText = panelText.slice(titleIndex);
      }
      const recommendationBoundary = panelText.search(
        /(?:^|\n)\s*(?:similar jobs?|related jobs?|recommended jobs?|jobs you may be interested in|other opportunities)\s*(?:\n|$)/i
      );
      if (recommendationBoundary > 0) panelText = panelText.slice(0, recommendationBoundary).trim();
      const companyHint = location.hostname.includes('linkedin.com')
        ? firstText([
            '.job-details-jobs-unified-top-card__company-name',
            '.jobs-unified-top-card__company-name',
            '.job-details-jobs-unified-top-card__primary-description-container a',
            '.job-details-jobs-unified-top-card__subtitle-primary-grouping-line a',
            '.jobs-unified-top-card__primary-description a',
            '.jobs-unified-top-card__subtitle-primary-grouping-line a',
            'a[href*="/company/"]',
            '.artdeco-entity-lockup__subtitle',
            '.topcard__flavor',
            '.topcard__org-name-link',
            'span.jobs-unified-top-card__company-name'
          ])
        : firstText([
            '[class*="company-name"]',
            '[class*="companyName"]',
            '[data-company-name="true"]',
            'a[href*="/company/"]',
            '[data-automation-id="company"]'
          ]);
      const locationHint = location.hostname.includes('linkedin.com')
        ? firstText([
            '.job-details-jobs-unified-top-card__primary-description-container',
            '.jobs-unified-top-card__primary-description'
          ])
        : '';
      const topCardText = firstText([
        '.job-details-jobs-unified-top-card',
        '.jobs-unified-top-card',
        '.top-card-layout'
      ]);
      if (topCardText && !panelText.includes(topCardText.slice(0, 50))) {
        panelText = `${topCardText}\n\n${panelText}`;
      }
      const jsonld = [];
      roots.forEach((root) => {
        root.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
          if (jsonld.length >= 20) return;
          try {
            jsonld.push(JSON.parse(script.textContent || ''));
          } catch {
            // Malformed page-owned structured data is ignored.
          }
        });
      });
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll(
        'script:not([type="application/ld+json"]), style, noscript, iframe, canvas, input, textarea, select'
      ).forEach((node) => node.remove());
      const shadowText = cleanText(
        shadowRoots.map((root) => root.textContent || '').join('\n'),
        30000
      );
      const visibleText = cleanText([
        document.body?.innerText,
        shadowText,
        ...iframeEvidence
      ].join('\n'), 100000);
      const fingerprintInput = `${location.href}|${document.title}|${visibleText.slice(0, 10000)}`;
      let fingerprintHash = 2166136261;
      for (let index = 0; index < fingerprintInput.length; index += 1) {
        fingerprintHash ^= fingerprintInput.charCodeAt(index);
        fingerprintHash = Math.imul(fingerprintHash, 16777619);
      }
      return {
        url: location.href,
        selected_job_url: location.href,
        title: document.title,
        job_title_hint: jobTitleHint,
        company_hint: companyHint,
        location_hint: locationHint,
        visible_text: visibleText,
        selected_panel_text: panelText || '',
        selected_panel_selector: selected
          ? (selected.selector || `${selected.node.tagName.toLowerCase()}${selected.node.id ? `#${selected.node.id}` : ''}`)
          : null,
        html: String(clone.outerHTML || '').slice(0, 250000),
        jsonld,
        capture: {
          candidate_count: candidates.length,
          selected_score: selected?.score || 0,
          portal_optimized_panel: Boolean(selected?.portalOptimized),
          has_portal_selectors: portalPanelSelectors.length > 0,
          captured_at: new Date().toISOString(),
          viewport: { width: innerWidth, height: innerHeight },
          portal_hint: location.hostname,
          accessible_iframe_count: iframeEvidence.length,
          shadow_root_count: shadowRoots.length,
          dom_fingerprint: (fingerprintHash >>> 0).toString(16)
        }
      };
        }
      });
      // A portal with known job-detail selectors (LinkedIn's
      // .jobs-description__content etc.) that came up empty means those
      // selectors most likely just hadn't rendered yet for the job the user
      // has open -- the generic fallback (`main`/`aside`/`section`) still
      // "succeeds" in the sense of returning non-empty text, but on a
      // split-view search-results page that generic match is prone to
      // grabbing the job LIST container instead of the single selected
      // job's detail pane, mixing several unrelated postings' title/company
      // snippets together. Confirmed real-world case (2026-08-08): a
      // Charles Schwab posting open in the detail pane extracted as an
      // unrelated "Fulcrum GT" / "DATAMAZE.AI" internship instead. Treat
      // that combination as worth retrying, same as an empty capture,
      // rather than accepting a plausible-looking but wrong result on the
      // first attempt.
      const gotWrongPanelOnKnownPortal = Boolean(
        result?.capture?.has_portal_selectors && !result.capture.portal_optimized_panel
      );
      if (hasCapturedJobEvidence(result) && !(gotWrongPanelOnKnownPortal && attempt < maxAttempts)) {
        result.active_tab_id = tabId;
        result.capture = { ...(result.capture || {}), capture_attempt: attempt };
        return result;
      }
      lastError = new Error(
        gotWrongPanelOnKnownPortal
          ? `Active-tab capture fell back to a generic panel on a known portal (attempt ${attempt}).`
          : `Active-tab capture returned no page evidence (attempt ${attempt}).`
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError || new Error('Active-tab capture returned no page evidence.');
}

export function assessBrowserJobEvidence(evidence = {}, sourceUrl = '') {
  const selected = String(evidence.selected_panel_text || '');
  const visible = String(evidence.visible_text || '');
  const text = `${selected}\n${visible.slice(0, 30000)}`.toLowerCase();
  const jsonItems = Array.isArray(evidence.jsonld) ? evidence.jsonld : [];
  const containsJobPosting = JSON.stringify(jsonItems).toLowerCase().includes('"jobposting"');
  let parsedUrl = null;
  try {
    parsedUrl = new URL(sourceUrl || evidence.url || '');
  } catch {
    // URL validity is handled by the request gate.
  }
  const urlText = parsedUrl
    ? `${parsedUrl.pathname} ${parsedUrl.search} ${parsedUrl.hash}`.toLowerCase()
    : '';
  const jobIdentityInUrl = /(?:^|[/?#&=_-])(job|jobs|career|careers|position|opening|vacancy|requisition|currentjobid|jobid|gh_jid|ashby_jid)(?:[/?#&=_-]|$)/i.test(urlText);
  const sectionPatterns = [
    /\bjob description\b/i,
    /\b(?:key )?responsibilities\b/i,
    /\b(?:minimum|required|basic|preferred) qualifications\b/i,
    /\brequirements\b/i,
    /\bwhat (?:you.ll|you will) do\b/i,
    /\bwhat to expect\b/i,
    /\babout the role\b/i
  ];
  const sectionCount = sectionPatterns.filter((pattern) => pattern.test(text)).length;
  const applyAction = /\b(?:apply now|apply for this job|easy apply|submit application|start application)\b/i.test(text);
  const employmentMetadata = /\b(?:full[ -]?time|part[ -]?time|contract|internship|temporary|remote|hybrid|on[ -]?site)\b/i.test(text);
  const hiringContext = /\b(?:we are hiring|join our team|successful candidate|ideal candidate|job duties|role will be responsible)\b/i.test(text);
  const requiresRecoveryEvaluation = /\b(?:captcha|verify you are human|access denied|request blocked|checking your browser|security challenge|cloudflare)\b/i.test(text);
  const focusedPanel = Boolean(
    evidence.capture?.portal_optimized_panel
    && selected.length >= 250
  );
  const identityHints = Boolean(
    String(evidence.job_title_hint || '').trim()
    && String(evidence.company_hint || '').trim()
  );

  let score = 0;
  if (containsJobPosting) score += 8;
  if (jobIdentityInUrl) score += 2;
  if (focusedPanel) score += 4;
  score += Math.min(sectionCount, 4);
  if (applyAction) score += 2;
  if (employmentMetadata) score += 1;
  if (hiringContext) score += 2;
  if (identityHints && (sectionCount || applyAction || focusedPanel)) score += 1;

  const readiness = score >= 4
    ? 'READY'
    : (score >= 2 ? 'PARTIAL' : 'NOT_READY');
  return {
    isLikelyJob: readiness !== 'NOT_READY',
    requiresRecoveryEvaluation,
    readiness,
    score,
    signals: {
      containsJobPosting,
      jobIdentityInUrl,
      focusedPanel,
      sectionCount,
      applyAction,
      employmentMetadata,
      hiringContext,
      requiresRecoveryEvaluation,
      identityHints
    }
  };
}

// Backend schemas now scrub these at the Pydantic boundary (job_schemas.py /
// app/schemas.py), but this stays as defense-in-depth for any older cached
// response, legacy field shape, or field these validators don't cover --
// DeepSeek's structured-output mode sometimes fills an uncertain field with
// a literal placeholder token (observed in production: "UNAVAILABLE")
// instead of leaving it empty, and for a composite field like `location`
// that can land as just one comma-joined segment, e.g.
// "UNAVAILABLE, UNAVAILABLE, United States".
const MISSING_VALUE_TOKENS = new Set([
  'unavailable', 'not available', 'n/a', 'na', 'none', 'unspecified',
  'not specified', 'not provided', 'not disclosed', 'unknown', 'tbd',
  'not applicable', 'undisclosed', 'not stated', 'not mentioned',
]);

export function isMissingValueToken(value) {
  if (typeof value !== 'string') return false;
  return MISSING_VALUE_TOKENS.has(value.trim().toLowerCase().replace(/[.!]+$/, ''));
}

export function cleanLocationValue(value) {
  if (typeof value !== 'string') return value;
  if (isMissingValueToken(value)) return null;
  // A multi-office posting pipe-separates distinct locations (e.g.
  // "San Francisco, CA | New York City, NY | Seattle, WA") -- each one is
  // its own "City, State" comma composite, so "|" is a higher-level split
  // handled first (each office cleaned independently, then rejoined with
  // " | "), matching job_schemas.py's _strip_missing_value_tokens on the
  // backend. Flattening straight to one comma list would lose which city
  // pairs with which state.
  if (value.includes('|')) {
    const groups = value.split('|').map((group) => cleanLocationValue(group.trim())).filter(Boolean);
    return groups.length ? groups.join(' | ') : null;
  }
  if (!value.includes(',') && !value.includes('/')) return value.trim();
  const parts = value.split(/[,/]/).map((part) => part.trim()).filter((part) => part && !isMissingValueToken(part));
  return parts.length ? parts.join(', ') : null;
}

export function formatSalary(value) {
  if (!value) return "";
  if (typeof value !== "object") return String(value);
  if (value.raw) return String(value.raw);
  const minimum = value.minimum ?? value.min;
  const maximum = value.maximum ?? value.max;
  const amount = minimum != null && maximum != null
    ? `${minimum} - ${maximum}`
    : String(minimum ?? maximum ?? "");
  return [value.currency, amount, value.period].filter(Boolean).join(" ");
}

const toStringList = (value) => {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item) => typeof item === "string" && item.trim() && !isMissingValueToken(item))
    .map((item) => item.trim());
};

export function collectJobSkills(job = {}) {
  const details = job.normalized_content || job;
  const explicit = [
    ...toStringList(details.skills),
    ...toStringList(details.required_skills),
    ...toStringList(details.requiredSkills),
  ];
  const suggested = [
    ...toStringList(details.suggested_skills),
    ...toStringList(details.preferred_skills),
    ...toStringList(details.preferredSkills),
  ];
  return {
    explicit: [...new Set(explicit)],
    suggested: [...new Set(suggested)].filter((skill) => !explicit.includes(skill)),
  };
}

export function validateJDResponse(data) {
  if (!data || typeof data !== "object" || typeof data.success !== "boolean" || !data.request_id) {
    throw new Error("Malformed extraction response received.");
  }
  if (data.success && !["job_detail", "job_list", "non_job"].includes(data.page_type)) {
    throw new Error("Malformed extraction response received.");
  }
  return data;
}

export function classifyJDResult(data) {
  const response = validateJDResponse(data);
  if (!response.success) {
    if (response.status === "selection_required") return "job-list";
    if (response.status === "non_job") return "non-job";
    if (response.status === "manual_review") return "manual-review";
    if (response.status === "insufficient_evidence") return "extraction-incomplete";
    return response.error?.code === "PAGE_BLOCKED" ? "blocked" : "extraction-failed";
  }
  if (response.needs_manual_review) return "manual-review";
  if (response.page_type === "job_detail" && response.extracted_job) return "ready";
  if (response.page_type === "job_list") return "job-list";
  return "non-job";
}
