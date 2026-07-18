export async function runJobExtractionInPage() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalizeInlineText = (value = '') =>
    String(value)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();

  const removeDuplicateLines = (text = '') => {
    const lines = String(text).split('\n').map(normalizeInlineText);
    const out = [];
    for (const line of lines) {
      if (!line) {
        if (out[out.length - 1] !== '') out.push('');
        continue;
      }
      if (line !== out[out.length - 1]) out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  const normalizeMultilineText = (value = '') =>
    removeDuplicateLines(
      String(value)
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
    );

  const htmlToStructuredText = (root) => {
    if (!root) return '';
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, style, svg, nav, header, footer, button, [role="button"], [aria-hidden="true"], .visually-hidden, .sr-only').forEach((node) => node.remove());

    const lines = [];
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = normalizeInlineText(node.textContent);
        if (value) lines.push(value);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (['br'].includes(tag)) {
        lines.push('');
        return;
      }
      if (['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol'].includes(tag)) {
        if (lines[lines.length - 1] !== '') lines.push('');
      }
      if (tag === 'li') {
        lines.push(`- ${normalizeInlineText(node.innerText || node.textContent)}`);
        return;
      }
      Array.from(node.childNodes).forEach(walk);
      if (['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol'].includes(tag)) {
        if (lines[lines.length - 1] !== '') lines.push('');
      }
    };

    walk(clone);
    return normalizeMultilineText(lines.join('\n'));
  };

  const visible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };

  const textFromSelector = (selectors) => {
    for (const selector of selectors) {
      let el = null;
      try {
        el = document.querySelector(selector);
      } catch {
        continue;
      }
      const value = visible(el) ? normalizeInlineText(el.innerText || el.textContent) : '';
      if (value) return { value, selector };
    }
    return { value: '', selector: '' };
  };

  const structuredTextFromSelector = (selectors) => {
    let best = { value: '', selector: '' };
    for (const selector of selectors) {
      let el = null;
      try {
        el = document.querySelector(selector);
      } catch {
        continue;
      }
      if (!visible(el)) continue;
      const value = htmlToStructuredText(el);
      if (value.length > best.value.length) best = { value, selector };
    }
    return best;
  };

  const parseJsonLd = () => {
    const found = [];
    const visit = (item) => {
      if (!item || typeof item !== 'object') return;
      const type = item['@type'];
      const isJobPosting = Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting';
      if (isJobPosting) found.push(item);
      if (Array.isArray(item)) item.forEach(visit);
      if (Array.isArray(item['@graph'])) item['@graph'].forEach(visit);
    };

    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        visit(JSON.parse(script.textContent || '{}'));
      } catch {
        // malformed JSON-LD should never break extraction
      }
    });
    return found;
  };

  const stripHtml = (html = '') => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return htmlToStructuredText(div);
  };

  const getLocationText = (value) => {
    if (!value) return '';
    const locations = Array.isArray(value) ? value : [value];
    return locations.map((loc) => {
      const addr = loc?.address || loc;
      return [addr?.addressLocality, addr?.addressRegion, addr?.addressCountry?.name || addr?.addressCountry]
        .filter(Boolean)
        .join(', ');
    }).filter(Boolean).join('; ');
  };

  const extractJsonLdJob = () => {
    const job = parseJsonLd()[0];
    if (!job) return { source: 'json-ld', result: {}, found: false };
    const identifier = typeof job.identifier === 'object' ? job.identifier.value || job.identifier.name : job.identifier;
    return {
      source: 'json-ld',
      found: true,
      result: {
        title: normalizeInlineText(job.title),
        company: normalizeInlineText(job.hiringOrganization?.name),
        location: getLocationText(job.jobLocation),
        description: stripHtml(job.description || ''),
        jobId: normalizeInlineText(identifier),
        employmentType: Array.isArray(job.employmentType) ? job.employmentType.join(', ') : normalizeInlineText(job.employmentType),
        workplaceType: normalizeInlineText(job.jobLocationType),
        postedDate: normalizeInlineText(job.datePosted),
        jobUrl: normalizeInlineText(job.url || location.href)
      }
    };
  };

  const descriptionQuality = (text = '') => {
    const normalized = normalizeMultilineText(text);
    const lower = normalized.toLowerCase();
    const headings = (normalized.match(/(^|\n)(about|responsibilities|requirements|qualifications|minimum qualifications|preferred qualifications|what you)/gi) || []).length;
    const bullets = (normalized.match(/(^|\n)\s*[-•]/g) || []).length;
    const uiNoise = (lower.match(/\b(apply|share|save|feedback|privacy|terms|skip navigation|help_outline|arrow_back)\b/g) || []).length;
    return normalized.length + headings * 250 + bullets * 40 - uiNoise * 180;
  };

  const isMeaningfulDescription = (text = '') => {
    const normalized = normalizeMultilineText(text);
    const words = normalized.split(/\s+/).filter(Boolean).length;
    const sections = /(responsibilit|qualification|requirement|experience|skills|about the job|about the role|minimum qualifications|preferred qualifications|what you)/i.test(normalized);
    const uiOnly = /^(apply|save|share|feedback|job details|careers|skip navigation|0 notifications|\s)+$/i.test(normalized);
    return normalized.length >= 200 && words >= 35 && sections && !uiOnly;
  };

  const extractLinkedInJob = async () => {
    const title = textFromSelector([
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title',
      'h1'
    ]);
    const company = textFromSelector([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__primary-description a'
    ]);
    const locationText = textFromSelector([
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__primary-description'
    ]);
    const descSelectors = [
      '#job-details',
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '.jobs-description'
    ];

    const getLinkedInBodyFallback = () => {
      const panel = document.querySelector('.jobs-search__job-details--container, .jobs-details, main');
      if (!panel) return '';
      const panelText = normalizeMultilineText(panel.innerText || panel.textContent || '');
      const markers = ['About the job', 'Responsibilities', 'Qualifications', 'Requirements', 'Basic Qualifications', 'Preferred Qualifications'];
      const lower = panelText.toLowerCase();
      const starts = markers
        .map((marker) => lower.indexOf(marker.toLowerCase()))
        .filter((idx) => idx >= 0)
        .sort((a, b) => a - b);
      if (!starts.length) return '';
      return panelText.slice(starts[0])
        .replace(/Show more[\s\S]*$/i, '')
        .replace(/People you can reach out to[\s\S]*$/i, '')
        .replace(/Similar jobs[\s\S]*$/i, '')
        .trim();
    };

    let description = structuredTextFromSelector(descSelectors);
    for (let i = 0; i < 24 && !isMeaningfulDescription(description.value); i += 1) {
      const panel = document.querySelector('.jobs-search__job-details--container, .jobs-details, main');
      if (panel) panel.scrollBy(0, 450);
      window.scrollBy(0, 450);
      await sleep(250);
      const next = structuredTextFromSelector(descSelectors);
      if (next.value.length > description.value.length) description = next;
    }

    const showMore = Array.from(document.querySelectorAll('button')).find((button) => /show more|see more/i.test(button.innerText || ''));
    if (showMore) {
      showMore.click();
      await sleep(150);
      const expanded = structuredTextFromSelector(descSelectors);
      if (expanded.value.length > description.value.length) description = expanded;
    }

    if (!isMeaningfulDescription(description.value)) {
      const fallback = getLinkedInBodyFallback();
      if (descriptionQuality(fallback) > descriptionQuality(description.value)) {
        description = { value: fallback, selector: 'linkedin-detail-panel-fallback' };
      }
    }

    const jobId = new URL(location.href).searchParams.get('currentJobId') || location.pathname.match(/\/jobs\/view\/(\d+)/i)?.[1] || '';
    return {
      source: 'linkedin',
      result: {
        title: title.value,
        company: company.value,
        location: locationText.value,
        description: description.value,
        jobId,
        jobUrl: location.href
      }
    };
  };

  const extractGoogleCareersJob = async () => {
    const main = document.querySelector('main, [role="main"]');
    const title = textFromSelector(['h1']);
    let raw = htmlToStructuredText(main || document.body);

    for (let i = 0; i < 8 && raw.length < 700; i += 1) {
      window.scrollBy(0, 700);
      await sleep(200);
      raw = htmlToStructuredText(main || document.body);
    }

    const sectionNames = ['Minimum qualifications', 'Preferred qualifications', 'About the job', 'Responsibilities'];
    const lower = raw.toLowerCase();
    const positions = sectionNames
      .map((name) => ({ name, index: lower.indexOf(name.toLowerCase()) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index);
    const description = positions.length
      ? positions.map((pos, i) => raw.slice(pos.index, positions[i + 1]?.index ?? raw.length).trim()).join('\n\n')
      : raw;
    const headerText = normalizeMultilineText(document.querySelector('main, [role="main"]')?.innerText || document.body.innerText || '');
    const locationMatch = headerText.match(/Google\s*\n+([^\n]+(?:,\s*[A-Z]{2,}|,\s*[A-Za-z ]+)?)/i);
    return {
      source: 'google-careers',
      result: {
        title: title.value || document.title.replace(/\s*-\s*Google Careers.*$/i, ''),
        company: 'Google',
        location: normalizeInlineText(locationMatch?.[1] || ''),
        description: normalizeMultilineText(description)
          .replace(/Google is proud to be an equal opportunity workplace[\s\S]*$/i, '')
          .replace(/Privacy\s+Terms[\s\S]*$/i, '')
          .trim(),
        jobUrl: location.href
      }
    };
  };

  const extractGenericAtsJob = () => {
    const host = location.hostname;
    const title = textFromSelector([
      'h1.app-title',
      '.app-title',
      '.posting-header h2',
      '[data-automation-id="jobPostingHeader"]',
      'h1'
    ]);
    const company = textFromSelector([
      '.company-name',
      '[class*="company"]',
      'meta[property="og:site_name"]'
    ]);
    const description = structuredTextFromSelector([
      '#content',
      '#main',
      '[data-automation-id="jobPostingDescription"]',
      '.posting-description',
      '.section.page-centered',
      '[class*="job-description"]',
      '[class*="description"]',
      'main',
      'article'
    ]);
    return {
      source: host.includes('greenhouse') ? 'greenhouse' : host.includes('lever') ? 'lever' : host.includes('workday') ? 'workday' : 'semantic-dom',
      result: {
        title: title.value,
        company: company.value,
        description: description.value,
        jobUrl: location.href
      }
    };
  };

  const mergeResults = (strategies) => {
    const result = { title: '', company: '', location: '', description: '', jobId: '', employmentType: '', workplaceType: '', seniority: '', postedDate: '', jobUrl: location.href };
    const descriptionCandidates = [];
    for (const strategy of strategies) {
      const item = strategy.result || {};
      for (const key of Object.keys(result)) {
        if (key === 'description') continue;
        if (!result[key] && item[key]) result[key] = normalizeInlineText(item[key]);
      }
      if (item.description) descriptionCandidates.push({ source: strategy.source, value: normalizeMultilineText(item.description) });
    }
    const validDescriptions = descriptionCandidates.filter((candidate) => isMeaningfulDescription(candidate.value));
    const selected = (validDescriptions.length ? validDescriptions : descriptionCandidates)
      .sort((a, b) => descriptionQuality(b.value) - descriptionQuality(a.value))[0];
    if (selected) {
      result.description = selected.value;
      result.extractionSource = selected.source;
    }
    return result;
  };

  const getIdentity = (result = {}) => {
    const url = new URL(location.href);
    const platform = location.hostname.includes('linkedin.com') ? 'linkedin' : location.hostname;
    const jobId = result.jobId || url.searchParams.get('currentJobId') || url.pathname.match(/\/jobs\/view\/(\d+)/i)?.[1] || '';
    const identityKey = jobId
      ? `${platform}:${jobId}`
      : `${platform}:${normalizeInlineText([result.title, result.company, result.location].filter(Boolean).join('|')).toLowerCase() || url.pathname}`;
    return { platform, jobId, url: location.href, identityKey };
  };

  const validateExtractedJob = (result) => {
    const title = normalizeInlineText(result.title);
    if (!title || title.length < 3 || /^(jobs|job details|linkedin|careers|search jobs)$/i.test(title)) {
      return { valid: false, code: 'MISSING_TITLE' };
    }
    if (!result.description || result.description.length < 200) {
      return { valid: false, code: 'DESCRIPTION_TOO_SHORT' };
    }
    if (!isMeaningfulDescription(result.description)) {
      return { valid: false, code: 'INVALID_DESCRIPTION' };
    }
    return { valid: true, code: 'OK' };
  };

  const detectPage = (result, hasJsonLd) => {
    if (/linkedin\.com\/(feed|in|messaging|mynetwork)/i.test(location.href)) return 'NOT_A_JOB_PAGE';
    if (hasJsonLd) return 'JOB_PAGE';
    if (location.hostname.includes('google.com') && location.pathname.includes('/about/careers/applications/jobs/results/') && result.title && isMeaningfulDescription(result.description)) {
      return 'JOB_PAGE';
    }
    if (result.title && isMeaningfulDescription(result.description) && (Array.from(document.querySelectorAll('button, a')).some((el) => /\bapply\b/i.test(el.innerText || '')) || result.jobId)) {
      return 'JOB_PAGE';
    }
    return 'NOT_A_JOB_PAGE';
  };

  const startedAt = performance.now();
  const jsonLd = extractJsonLdJob();
  const strategies = [];
  const isLinkedIn = location.hostname.includes('linkedin.com');
  if (isLinkedIn) strategies.push(await extractLinkedInJob());
  if (location.hostname.includes('google.com') && location.pathname.includes('/about/careers/applications/jobs/results/')) strategies.push(await extractGoogleCareersJob());
  strategies.push(jsonLd);
  if (!isLinkedIn) strategies.push(extractGenericAtsJob());

  const result = mergeResults(strategies);
  const identity = getIdentity(result);
  const pageType = detectPage(result, jsonLd.found);
  const validation = pageType === 'JOB_PAGE' ? validateExtractedJob(result) : { valid: false, code: 'NOT_A_JOB_PAGE' };

  return {
    title: result.title || '',
    company: result.company || '',
    location: result.location || '',
    text: result.description || '',
    description: result.description || '',
    jobId: identity.jobId,
    jobUrl: result.jobUrl || location.href,
    employmentType: result.employmentType || '',
    workplaceType: result.workplaceType || '',
    seniority: result.seniority || '',
    postedDate: result.postedDate || '',
    identity,
    isJobPage: pageType === 'JOB_PAGE' && validation.valid,
    validation,
    extractionSource: result.extractionSource || strategies.find((item) => item.result?.description)?.source || 'unknown',
    durationMs: Math.round(performance.now() - startedAt),
    url: location.href
  };
}
