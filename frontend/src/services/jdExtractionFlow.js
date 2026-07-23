export const JD_LOG_PREFIX = "[JD-EXTRACTION][FRONTEND]";

export function isExtractableHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function captureActiveTabJobEvidence(tabId) {
  if (!tabId || !chrome?.scripting?.executeScript) return null;
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const cleanText = (value, limit) => String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, limit);
      const jobSignals = /\b(job description|responsibilities|qualifications|requirements|what you.ll do|what to expect|apply now|easy apply|full.time|part.time|experience)\b/gi;
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
        Array.from(document.querySelectorAll(selector)).map((node) => ({
          node,
          selector,
          portalOptimized: true
        }))
      );
      const genericCandidates = Array.from(document.querySelectorAll(
        '[role="dialog"], [role="main"], article, main, aside, section'
      )).map((node) => ({ node, selector: null, portalOptimized: false }));
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
      const firstText = (selectors) => {
        for (const selector of selectors) {
          const value = cleanText(document.querySelector(selector)?.innerText, 500);
          if (value) return value;
        }
        return '';
      };
      const jobTitleHint = location.hostname.includes('linkedin.com')
        ? firstText([
            '.job-details-jobs-unified-top-card__job-title',
            '.jobs-unified-top-card__job-title',
            '.job-details-jobs-unified-top-card__job-title h1',
            'h1'
          ])
        : firstText(['h1', '[class*="job-title"]', '[class*="jobTitle"]']);
      const companyHint = location.hostname.includes('linkedin.com')
        ? firstText([
            '.job-details-jobs-unified-top-card__company-name',
            '.jobs-unified-top-card__company-name',
            '.jobs-unified-top-card__primary-description a'
          ])
        : firstText([
            '[class*="company-name"]',
            '[class*="companyName"]',
            '[data-company-name="true"]'
          ]);
      const locationHint = location.hostname.includes('linkedin.com')
        ? firstText([
            '.job-details-jobs-unified-top-card__primary-description-container',
            '.jobs-unified-top-card__primary-description'
          ])
        : '';
      const jsonld = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
        if (jsonld.length >= 20) return;
        try {
          jsonld.push(JSON.parse(script.textContent || ''));
        } catch {
          // Malformed page-owned structured data is ignored.
        }
      });
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll(
        'script:not([type="application/ld+json"]), style, noscript, iframe, canvas, input, textarea, select'
      ).forEach((node) => node.remove());
      return {
        url: location.href,
        title: document.title,
        job_title_hint: jobTitleHint,
        company_hint: companyHint,
        location_hint: locationHint,
        visible_text: cleanText(document.body?.innerText, 80000),
        selected_panel_text: selected?.text || '',
        selected_panel_selector: selected
          ? (selected.selector || `${selected.node.tagName.toLowerCase()}${selected.node.id ? `#${selected.node.id}` : ''}`)
          : null,
        html: String(clone.outerHTML || '').slice(0, 250000),
        jsonld,
        capture: {
          candidate_count: candidates.length,
          selected_score: selected?.score || 0,
          portal_optimized_panel: Boolean(selected?.portalOptimized),
          captured_at: new Date().toISOString(),
          viewport: { width: innerWidth, height: innerHeight }
        }
      };
    }
  });
  return result || null;
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
    .filter((item) => typeof item === "string" && item.trim())
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
    return response.error?.code === "PAGE_BLOCKED" ? "blocked" : "extraction-failed";
  }
  if (response.needs_manual_review) return "manual-review";
  if (response.page_type === "job_detail" && response.extracted_job) return "ready";
  if (response.page_type === "job_list") return "job-list";
  return "non-job";
}
