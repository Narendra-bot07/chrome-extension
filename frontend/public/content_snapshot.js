(() => {
  if (globalThis.__TAILR4U_SNAPSHOT_ENGINE__) return;
  globalThis.__TAILR4U_SNAPSHOT_ENGINE__ = true;

  const cleanText = (value, limit) => String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit);

  const waitForStability = (quietMs = 650, maximumMs = 2200) => new Promise(resolve => {
    let quietTimer;
    const started = performance.now();
    const finish = () => {
      observer.disconnect();
      clearTimeout(quietTimer);
      resolve();
    };
    const schedule = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
      if (performance.now() - started >= maximumMs) finish();
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, characterData: true
    });
    schedule();
    setTimeout(finish, maximumMs);
  });

  const jobIdentifier = () => {
    const url = new URL(location.href);
    const queryId = [
      'currentJobId', 'jobId', 'jobid', 'gh_jid', 'pid', 'requisitionId'
    ].map(key => url.searchParams.get(key)).find(Boolean);
    const pathId = url.pathname.match(/(?:jobs?|positions?|requisitions?|viewjob)[/-]([a-z0-9_-]{4,})/i)?.[1];
    return queryId || pathId || url.hash.match(/[a-z0-9_-]{5,}/i)?.[0] || '';
  };

  const capture = async requestId => {
    const started = performance.now();
    await waitForStability();
    const roots = [document];
    document.querySelectorAll('*').forEach(node => {
      if (node.shadowRoot) roots.push(node.shadowRoot);
    });
    const selectors = [
      '#job-details', '#jobDescriptionText', '#job-detail-body',
      '.jobs-description__content', '.jobs-box__html-content',
      '[data-automation-id="jobPostingDescription"]',
      '[class*="JobDetails_jobDescription"]',
      '.job__description', '.posting-page', 'article', 'main',
      '[role="main"]', '[role="dialog"]'
    ];
    const signalPattern = /\b(job description|responsibilities|requirements|qualifications|what you.ll do|apply now|easy apply)\b/gi;
    const candidates = selectors.flatMap(selector =>
      roots.flatMap(root => Array.from(root.querySelectorAll(selector)))
        .map(node => {
          const text = cleanText(node.innerText || node.textContent, 60000);
          const rect = node.getBoundingClientRect?.() || {};
          const score = (text.match(signalPattern) || []).length * 1000
            + Math.min(text.length, 20000);
          return { node, selector, text, score, width: rect.width || 0, height: rect.height || 0 };
        })
    ).filter(item => item.text.length >= 200 && item.width >= 180 && item.height >= 100)
      .sort((left, right) => right.score - left.score);
    const selected = candidates[0] || null;
    const firstText = selectorsToTry => selectorsToTry
      .map(selector => cleanText(document.querySelector(selector)?.innerText, 500))
      .find(Boolean) || '';
    const jobTitleHint = firstText([
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title h1',
      '[data-automation-id="jobPostingHeader"] h2',
      '[class*="job-title"]', '[class*="jobTitle"]', 'h1'
    ]);
    const companyHint = firstText([
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
      'span.jobs-unified-top-card__company-name',
      '[data-automation-id="company"]',
      '[class*="company-name"]', '[class*="companyName"]'
    ]);
    const locationHint = firstText([
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.jobs-unified-top-card__primary-description',
      '[data-automation-id="locations"]',
      '[class*="job-location"]', '[class*="location"]'
    ]);
    const topCardText = firstText([
      '.job-details-jobs-unified-top-card',
      '.jobs-unified-top-card',
      '.top-card-layout'
    ]);
    let panelText = selected?.text || '';
    if (topCardText && !panelText.includes(topCardText.slice(0, 50))) {
      panelText = `${topCardText}\n\n${panelText}`;
    }
    const jsonLd = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      if (jsonLd.length >= 30) return;
      try { jsonLd.push(JSON.parse(script.textContent || '')); } catch {}
    });
    const metadata = {};
    document.querySelectorAll('meta[name], meta[property]').forEach(node => {
      const key = node.getAttribute('name') || node.getAttribute('property');
      const value = node.getAttribute('content');
      if (key && value && Object.keys(metadata).length < 100) metadata[key] = value;
    });
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll(
      'script:not([type="application/ld+json"]),style,noscript,iframe,canvas,input,textarea,select'
    ).forEach(node => node.remove());
    const visibleText = cleanText(document.body?.innerText, 120000);
    const active = document.activeElement;
    const bundle = {
      snapshot_version: 1,
      immutable: true,
      request_id: requestId,
      url: location.href,
      selected_job_url: location.href,
      timestamp: new Date().toISOString(),
      hostname: location.hostname,
      title: document.title,
      job_title_hint: jobTitleHint,
      company_hint: companyHint,
      location_hint: locationHint,
      page_language: document.documentElement.lang || navigator.language || '',
      viewport: {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio: devicePixelRatio || 1
      },
      scroll_position: { x: scrollX, y: scrollY },
      route: {
        href: location.href,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        job_identifier: jobIdentifier()
      },
      spa_route: `${location.pathname}${location.search}${location.hash}`,
      page_readiness: {
        ready_state: document.readyState,
        stable: true,
        loading_indicator_found: Boolean(document.querySelector(
          '[aria-busy="true"],[class*="loading"],[class*="spinner"]'
        ))
      },
      active_element: active ? {
        tag: active.tagName?.toLowerCase() || '',
        id: active.id || '',
        role: active.getAttribute?.('role') || ''
      } : null,
      html: String(document.documentElement.outerHTML || '').slice(0, 350000),
      cleaned_dom: String(clone.outerHTML || '').slice(0, 300000),
      visible_text: visibleText,
      selected_job_panel: panelText || '',
      selected_panel_text: panelText || '',
      selected_panel_selector: selected?.selector || null,
      metadata,
      json_ld: jsonLd,
      jsonld: jsonLd,
      page_type_hint: selected || JSON.stringify(jsonLd).includes('JobPosting')
        ? 'job_detail'
        : 'unknown',
      capture: {
        captured_at: new Date().toISOString(),
        capture_time_ms: Math.round(performance.now() - started),
        candidate_count: candidates.length,
        selected_container_found: Boolean(selected),
        json_ld_found: jsonLd.length > 0,
        metadata_found: Object.keys(metadata).length > 0,
        html_size: String(document.documentElement.outerHTML || '').length,
        visible_text_size: visibleText.length,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio: devicePixelRatio || 1 },
        portal_hint: location.hostname
      }
    };
    return Object.freeze(bundle);
  };

  const SENTRY_EXTENSION_DSN = ""; // Extension DSN
  const EXTENSION_VERSION = "1.0.0";
  const APP_RELEASE = `tailr4u-extension@${EXTENSION_VERSION}`;

  const reportContentError = (error, contextName) => {
    if (!SENTRY_EXTENSION_DSN) return;
    try {
      const url = new URL(SENTRY_EXTENSION_DSN);
      const publicKey = url.username;
      const host = url.host;
      const projectId = url.pathname.replace("/", "");
      const sentryUrl = `https://${host}/api/${projectId}/store/`;
      const eventId = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID().replace(/-/g, "") 
        : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

      // Strip query parameters for user privacy
      let sanitizedUrl = "unknown";
      try {
        const parsed = new URL(location.href);
        parsed.search = "";
        parsed.hash = "";
        sanitizedUrl = parsed.toString();
      } catch {}

      const payload = {
        event_id: eventId,
        timestamp: new Date().toISOString().split(".")[0],
        logger: "chrome-extension-content",
        platform: "javascript",
        release: APP_RELEASE,
        environment: "production",
        exception: {
          values: [{
            type: error.name || "Error",
            value: (error.message || String(error)).slice(0, 1000),
            stacktrace: error.stack ? {
              frames: error.stack.split("\n").map(line => ({ filename: line.trim() })).reverse()
            } : undefined
          }]
        },
        tags: {
          extension_version: EXTENSION_VERSION,
          execution_context: "content_script",
          browser_family: "chrome",
          normalized_job_platform: location.hostname
        },
        request: {
          url: sanitizedUrl
        }
      };

      fetch(sentryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=tailr4u-extension-content/1.0, sentry_key=${publicKey}`
        },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (err) {
      console.warn("[ContentScript] Sentry report error:", err);
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'CAPTURE_PAGE_SNAPSHOT') return false;
    capture(message.requestId)
      .then(snapshot => sendResponse({ ok: true, snapshot }))
      .catch(error => {
        const errObj = error instanceof Error ? error : new Error(String(error));
        reportContentError(errObj, "page_capture");
        sendResponse({ ok: false, error: errObj.message });
      });
    return true;
  });
})();
