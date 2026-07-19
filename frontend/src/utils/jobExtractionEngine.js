export async function runJobExtractionInPage() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const NON_JOB_THRESHOLD = 0.45;
  let traceStep = 0;
  const traceRecords = [];
  const trace = (name, details = {}) => {
    traceStep += 1;
    traceRecords.push({ step: traceStep, name, details });
    console.log(`[ApplyFlow:PageExtraction ${String(traceStep).padStart(2, '0')}] ${name}`, details);
  };
  trace('Injected extractor started', { url: location.href, pageTitle: document.title, readyState: document.readyState });

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
      let elements = [];
      try {
        elements = Array.from(document.querySelectorAll(selector));
      } catch {
        continue;
      }
      const candidates = elements
        .filter(visible)
        .map((el) => ({ value: normalizeInlineText(el.innerText || el.textContent), selector, el }))
        .filter((item) => item.value)
        .sort((a, b) => b.value.length - a.value.length);
      if (candidates.length) {
        trace('Visible text selector matched', { selector, matches: elements.length, visibleMatches: candidates.length, selectedLength: candidates[0].value.length, preview: candidates[0].value.slice(0, 100) });
        return candidates[0];
      }
      if (elements.length) trace('Text selector matched only hidden/empty nodes', { selector, matches: elements.length });
    }
    return { value: '', selector: '' };
  };

  const structuredTextFromSelector = (selectors) => {
    let best = { value: '', selector: '' };
    for (const selector of selectors) {
      let elements = [];
      try {
        elements = Array.from(document.querySelectorAll(selector));
      } catch {
        continue;
      }
      let visibleMatches = 0;
      for (const el of elements) {
        if (!visible(el)) continue;
        visibleMatches += 1;
        const value = htmlToStructuredText(el);
        if (value.length > best.value.length) best = { value, selector, el };
      }
      if (elements.length) trace('Structured-text selector inspected', { selector, matches: elements.length, visibleMatches, bestLength: best.value.length });
    }
    return best;
  };

  const visibleElements = (selector) => {
    try {
      return Array.from(document.querySelectorAll(selector)).filter(visible);
    } catch {
      return [];
    }
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
    trace('Structured data inspected', { jsonLdScripts: document.querySelectorAll('script[type="application/ld+json"]').length, jobPostingsFound: found.length });
    return found;
  };

  const asText = (value) => {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
    if (typeof value === 'object') return normalizeInlineText(value.name || value.value || value.text || '');
    return normalizeInlineText(value);
  };

  const getSalaryText = (salary) => {
    if (!salary) return '';
    const value = salary.value || salary;
    const min = value.minValue ?? value.value ?? '';
    const max = value.maxValue ?? '';
    const currency = salary.currency || value.currency || '';
    const unit = value.unitText || '';
    return normalizeInlineText(`${currency} ${min}${max ? ` - ${max}` : ''}${unit ? ` / ${unit}` : ''}`);
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
    const jobs = parseJsonLd();
    const job = jobs[0];
    if (!job) {
      trace('JSON-LD JobPosting extraction completed', { found: false });
      return { source: 'json-ld', result: {}, found: false, count: 0 };
    }
    trace('JSON-LD JobPosting extraction started', { title: asText(job.title), company: asText(job.hiringOrganization) });
    const identifier = typeof job.identifier === 'object' ? job.identifier.value || job.identifier.name : job.identifier;
    return {
      source: 'json-ld',
      found: true,
      count: jobs.length,
      result: {
        title: normalizeInlineText(job.title),
        company: normalizeInlineText(job.hiringOrganization?.name),
        location: getLocationText(job.jobLocation),
        description: stripHtml(job.description || ''),
        jobId: normalizeInlineText(identifier),
        employmentType: Array.isArray(job.employmentType) ? job.employmentType.join(', ') : normalizeInlineText(job.employmentType),
        workplaceType: normalizeInlineText(job.jobLocationType),
        salary: getSalaryText(job.baseSalary || job.estimatedSalary),
        skills: asText(job.skills || job.qualifications || job.experienceRequirements),
        seniority: asText(job.experienceRequirements || job.occupationalCategory),
        postedDate: normalizeInlineText(job.datePosted),
        validThrough: normalizeInlineText(job.validThrough),
        jobUrl: normalizeInlineText(job.url || job.directApply || location.href)
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
    trace('LinkedIn adapter started', {
      path: location.pathname,
      currentJobId: new URL(location.href).searchParams.get('currentJobId'),
      h1Nodes: document.querySelectorAll('h1').length,
      detailContainers: document.querySelectorAll('.jobs-search__job-details--container, .jobs-details, [class*="jobs-description"], [class*="job-details"]').length
    });
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
      '.jobs-description',
      '.jobs-description__container',
      '[class*="jobs-description"]',
      '[class*="job-details"]'
    ];

    const getLinkedInBodyFallback = () => {
      const panel = visibleElements('.jobs-search__job-details--container, .jobs-details, main')
        .sort((a, b) => (b.innerText || b.textContent || '').length - (a.innerText || a.textContent || '').length)[0];
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
      const panels = visibleElements('.jobs-search__job-details--container, .jobs-details, main');
      panels.forEach((panel) => panel.scrollBy?.(0, 450));
      window.scrollBy(0, 450);
      trace('LinkedIn lazy-load scroll attempt', { attempt: i + 1, visiblePanels: panels.length, currentDescriptionLength: description.value.length });
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
    trace('LinkedIn fields extracted', { title: title.value, company: company.value, location: locationText.value, descriptionLength: description.value.length, descriptionSelector: description.selector, jobId });
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
    trace('Google Careers adapter started');
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
    const jobId = location.pathname.match(/\/jobs\/results\/(\d+)(?:-|\/|$)/i)?.[1] || '';
    const semanticLocation = textFromSelector([
      '[data-location]', '[class*="job-location"]', '[class*="job_location"]',
      '[class*="location"]', '[aria-label*="location" i]'
    ]).value;
    trace('Google Careers fields extracted', {
      title: title.value || document.title,
      company: 'Google',
      location: semanticLocation || normalizeInlineText(locationMatch?.[1] || ''),
      jobId,
      descriptionLength: description.length,
      detectedSections: positions.map((item) => item.name)
    });
    return {
      source: 'google-careers',
      result: {
        title: title.value || document.title.replace(/\s*-\s*Google Careers.*$/i, ''),
        company: 'Google',
        location: semanticLocation || normalizeInlineText(locationMatch?.[1] || ''),
        description: normalizeMultilineText(description)
          .replace(/Google is proud to be an equal opportunity workplace[\s\S]*$/i, '')
          .replace(/Privacy\s+Terms[\s\S]*$/i, '')
          .trim(),
        jobId,
        jobUrl: location.href
      }
    };
  };

  const extractGenericAtsJob = () => {
    trace('Semantic DOM extractor started', { hostname: location.hostname });
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
    let description = structuredTextFromSelector([
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
    const sanitizedBodyText = htmlToStructuredText(document.body);
    const bodyLower = sanitizedBodyText.toLowerCase();
    const sectionStarts = [
      'description', 'job description', 'key job responsibilities', 'about the role',
      'about the job', 'responsibilities', 'basic qualifications', 'minimum qualifications'
    ].map((label) => ({ label, index: bodyLower.indexOf(label) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index);
    if (sectionStarts.length) {
      const start = sectionStarts[0].index;
      const tail = sanitizedBodyText.slice(start);
      const tailLower = tail.toLowerCase();
      const stopIndexes = [
        'related jobs', 'similar jobs', 'recommended jobs', 'share this job',
        'find jobs in', 'amazon jobs home', 'join our talent community'
      ].map((label) => tailLower.indexOf(label))
        .filter((index) => index > 300)
        .sort((a, b) => a - b);
      const semanticSection = normalizeMultilineText(tail.slice(0, stopIndexes[0] ?? tail.length));
      if (descriptionQuality(semanticSection) > descriptionQuality(description.value)) {
        description = { value: semanticSection, selector: 'semantic-section-boundaries' };
      }
      trace('Semantic section-boundary fallback inspected', {
        firstHeading: sectionStarts[0].label,
        bodyLength: sanitizedBodyText.length,
        candidateLength: semanticSection.length,
        selected: description.selector === 'semantic-section-boundaries'
      });
    }
    const locationText = textFromSelector([
      '[data-automation-id="locations"]', '[data-test="location"]', '[class*="job-location"]',
      '[class*="jobLocation"]', '.location', '[itemprop="jobLocation"]'
    ]);
    const companyMeta = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
    const url = new URL(location.href);
    const visibleMainText = normalizeMultilineText(document.querySelector('main, [role="main"]')?.innerText || document.body?.innerText || '');
    const jobId = url.searchParams.get('jobId') || url.searchParams.get('job_id') || url.searchParams.get('gh_jid') ||
      location.pathname.match(/\/(?:jobs?|positions?|openings?|requisitions?)\/(\d{4,})(?:\/|-|$)/i)?.[1] ||
      visibleMainText.match(/\b(?:job|requisition|position)\s*(?:id|#|number)\s*[:#-]?\s*([A-Z0-9_-]{4,})\b/i)?.[1] || '';
    trace('Semantic DOM fields extracted', { title: title.value, company: company.value || normalizeInlineText(companyMeta), location: locationText.value, jobId, descriptionLength: description.value.length, descriptionSelector: description.selector });
    return {
      source: host.includes('greenhouse') ? 'greenhouse' : host.includes('lever') ? 'lever' : host.includes('workday') ? 'workday' : 'semantic-dom',
      result: {
        title: title.value,
        company: company.value || normalizeInlineText(companyMeta),
        location: locationText.value,
        description: description.value,
        jobId,
        jobUrl: location.href
      }
    };
  };

  const extractGlassdoorJob = () => {
    trace('Glassdoor adapter started');
    const title = textFromSelector([
      '[data-test="job-title"]', '[data-test="jobTitle"]', '[class*="JobDetails_jobTitle"]',
      '[class*="job-title"]', 'h1'
    ]);
    const company = textFromSelector([
      '[data-test="employer-name"]', '[data-test="employerName"]', '[class*="EmployerProfile_employerName"]',
      '[class*="employerName"]', '[class*="companyName"]'
    ]);
    const locationText = textFromSelector([
      '[data-test="location"]', '[data-test="job-location"]', '[class*="JobDetails_location"]',
      '[class*="location"]'
    ]);
    const description = structuredTextFromSelector([
      '[data-test="jobDescriptionContent"]', '[data-test="job-description"]',
      '[class*="JobDetails_jobDescription"]', '[class*="jobDescriptionContent"]',
      '#JobDescriptionContainer', 'main article', 'main'
    ]);
    const salary = textFromSelector(['[data-test="detailSalary"]', '[class*="salary"]']);
    trace('Glassdoor fields extracted', { title: title.value, company: company.value, location: locationText.value, salary: salary.value, descriptionLength: description.value.length, descriptionSelector: description.selector });
    return {
      source: 'glassdoor',
      result: {
        title: title.value,
        company: company.value.replace(/\s+\d+(?:\.\d+)?\s*[★ stars]*$/i, '').trim(),
        location: locationText.value,
        description: description.value,
        salary: salary.value,
        jobId: new URL(location.href).searchParams.get('jobListingId') || location.pathname.match(/(?:jobListingId=|_JO)(\d+)/i)?.[1] || '',
        jobUrl: location.href
      }
    };
  };

  const mergeResults = (strategies) => {
    trace('Merging extractor results', { strategies: strategies.map((item) => item.source) });
    const result = { title: '', company: '', location: '', description: '', jobId: '', employmentType: '', workplaceType: '', seniority: '', salary: '', skills: '', postedDate: '', validThrough: '', jobUrl: location.href };
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
    trace('Merged job fields selected', { title: result.title, company: result.company, location: result.location, jobId: result.jobId, descriptionLength: result.description.length, extractionSource: result.extractionSource });
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

  const detectPage = (result, hasJsonLd, jsonLdJobCount = 0) => {
    trace('Deterministic page classification started', { hasJsonLd, jsonLdJobCount, title: result.title, descriptionLength: result.description.length });
    const visibleBody = normalizeMultilineText(document.body?.innerText || '').slice(0, 60000);
    const lower = visibleBody.toLowerCase();
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .filter(visible).map((el) => normalizeInlineText(el.innerText || el.textContent)).filter(Boolean).slice(0, 30);
    const buttons = Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .filter(visible).map((el) => normalizeInlineText(el.innerText || el.textContent)).filter(Boolean).slice(0, 80);
    const sectionPatterns = [
      /responsibilit/i, /requirements?/i, /qualifications?/i, /about (?:the )?(?:job|role|position)/i,
      /what you(?:'|’)ll do/i, /skills/i, /experience/i, /benefits?/i
    ];
    const sectionCount = sectionPatterns.filter((pattern) => pattern.test(result.description || visibleBody)).length;
    const apply = buttons.some((text) => /^(?:easy )?apply(?: now)?$|submit application|apply for (?:this )?(?:job|position)/i.test(text));
    const jobCards = document.querySelectorAll('[data-job-id], [data-jobid], [data-job-key], [class*="job-card"], [class*="JobCard"], [class*="jobCard"]').length;
    const individualJobLinks = new Set(Array.from(document.querySelectorAll('a[href]'))
      .map((link) => {
        try { return new URL(link.href, location.href).pathname; } catch { return ''; }
      })
      .filter((path) => /\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?jobs\/\d+(?:\/|$)/i.test(path))).size;
    const hasSpecificTitle = Boolean(result.title && !/^(?:jobs?|careers?|search jobs|job details)$/i.test(result.title));
    const hasSelectedJobDetail = Boolean(
      result.jobId &&
      hasSpecificTitle &&
      isMeaningfulDescription(result.description)
    );
    const hasJobDetailShell = Boolean(result.jobId && hasSpecificTitle);
    const collectionRoute = /\/(?:content\/[^/]+\/)?(?:locations?|search)(?:\/|$)/i.test(location.pathname);
    const searchResultsShell = jsonLdJobCount > 1 || collectionRoute || jobCards >= 2 || individualJobLinks >= 2 ||
      /\b(?:\d+[,+]?\s+open jobs?|job search results|jobs for you|top job picks for you|recommended jobs|browse jobs|search jobs|filter jobs)\b/i.test((headings.slice(0, 8).join(' ') + ' ' + visibleBody.slice(0, 1500)));
    // LinkedIn and some ATS products keep the results feed mounted beside a selected
    // detail panel. A stable job id + meaningful JD + Apply action proves that the
    // user has selected one concrete opening, so the surrounding feed is only shell UI.
    const selectedJobId = new URL(location.href).searchParams.get('currentJobId');
    const detailRouteIdentity = /\/(?:jobs?|positions?|openings?|requisitions?)\/\d{4,}(?:\/|-|$)/i.test(location.pathname) || Boolean(selectedJobId);
    const selectedDetailIntent = Boolean(selectedJobId && result.jobId === selectedJobId);
    const searchResults = searchResultsShell && !((hasSelectedJobDetail && detailRouteIdentity) || selectedDetailIntent);
    const login = /\b(?:sign in|log in)\b/i.test(headings.slice(0, 4).join(' ')) && !result.description;
    const captcha = /captcha|verify (?:that )?you are human|unusual traffic|security check/i.test(visibleBody.slice(0, 2000));
    const negative = /privacy policy|terms (?:of use|and conditions)|documentation|cookie policy/i.test(document.title + ' ' + headings.slice(0, 4).join(' '));
    const articleLike = /\/(?:blog|news|articles?|stories)(?:\/|$)/i.test(location.pathname) || /\b(?:how we hire|hiring guide|career advice)\b/i.test(document.title + ' ' + headings.slice(0, 3).join(' '));
    let score = 0;
    const positiveSignals = [];
    const negativeSignals = [];
    if (hasJsonLd) { score += 0.58; positiveSignals.push('schema.org JobPosting'); }
    if (result.title && !/^(jobs?|careers?|search|opportunities)$/i.test(result.title)) { score += 0.1; positiveSignals.push('specific title'); }
    if (result.company) { score += 0.05; positiveSignals.push('company'); }
    if (result.location) { score += 0.04; positiveSignals.push('location'); }
    if (isMeaningfulDescription(result.description)) { score += 0.3; positiveSignals.push('substantial description'); }
    if (sectionCount >= 1) { score += Math.min(0.2, 0.1 + sectionCount * 0.05); positiveSignals.push(`${sectionCount} job sections`); }
    if (apply) { score += 0.15; positiveSignals.push('application action'); }
    if (result.jobId) { score += 0.15; positiveSignals.push('job identifier'); }
    if (searchResults) { score -= 0.65; negativeSignals.push('multiple job/search results'); }
    if (negative) { score -= 0.4; negativeSignals.push('non-job document'); }
    if (articleLike) { score -= 0.4; negativeSignals.push('article/editorial content'); }
    if (login) { score -= 0.35; negativeSignals.push('login required'); }
    if (captcha) { score -= 0.7; negativeSignals.push('CAPTCHA/security check'); }
    if (/linkedin\.com\/(feed|in|messaging|mynetwork)/i.test(location.href)) { score -= 0.8; negativeSignals.push('non-job LinkedIn route'); }
    score = Math.max(0, Math.min(1, Number(score.toFixed(2))));
    const extractionIncomplete = Boolean(hasJobDetailShell && !isMeaningfulDescription(result.description) && !captcha && !login);
    const pageState = captcha ? 'captcha' : login ? 'login_required' : searchResults ? 'search_results' : extractionIncomplete ? 'extraction_incomplete' : null;
    const hasStrongJobEvidence = Boolean(
      (hasJsonLd && !searchResults) ||
      (hasJobDetailShell && !searchResults) ||
      (hasSpecificTitle && isMeaningfulDescription(result.description) && sectionCount >= 2 && !articleLike && !searchResults) ||
      (hasSpecificTitle && isMeaningfulDescription(result.description) && (apply || result.company || result.location))
    );
    const classification = searchResults
      ? 'non_job'
      : !captcha && !login && hasStrongJobEvidence
        ? 'job_listing'
        : score < NON_JOB_THRESHOLD ? 'non_job' : 'uncertain';
    trace('Deterministic page classification completed', { classification, confidence: score, pageState: pageState || classification, positiveSignals, negativeSignals, jobCards, individualJobLinks, jsonLdJobCount, collectionRoute, detailRouteIdentity, selectedDetailIntent, hasSelectedJobDetail, applyActionFound: apply });
    return {
      classification,
      confidence: score,
      pageState: pageState || classification,
      reason: negativeSignals[0] || positiveSignals.join(', ') || 'Insufficient job-listing signals',
      signals: { positive: positiveSignals, negative: negativeSignals },
      snapshot: { pageTitle: document.title, hostname: location.hostname, path: location.pathname, headings, buttons: buttons.slice(0, 20) }
    };
  };

  const fingerprint = (value = '') => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  };

  const startedAt = performance.now();
  trace('Extraction strategies being selected', { hostname: location.hostname });
  const jsonLd = extractJsonLdJob();
  const strategies = [];
  const isLinkedIn = location.hostname.includes('linkedin.com');
  const isGlassdoor = location.hostname.includes('glassdoor.');
  if (isLinkedIn) strategies.push(await extractLinkedInJob());
  if (isGlassdoor) strategies.push(extractGlassdoorJob());
  if (location.hostname.includes('google.com') && location.pathname.includes('/about/careers/applications/jobs/results/')) strategies.push(await extractGoogleCareersJob());
  strategies.push(jsonLd);
  if (!isLinkedIn) strategies.push(extractGenericAtsJob());

  const result = mergeResults(strategies);
  const identity = getIdentity(result);
  const detection = detectPage(result, jsonLd.found, jsonLd.count);
  const schemaValidation = detection.classification === 'job_listing' ? validateExtractedJob(result) : { valid: false, code: detection.pageState.toUpperCase() };
  const validation = schemaValidation.valid ? schemaValidation : { ...schemaValidation, classification: detection.classification };
  trace('Strict extracted-data validation completed', { valid: validation.valid, code: validation.code, detectedClassification: detection.classification });

  const finalResult = {
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
    salary: result.salary || '',
    skills: result.skills || '',
    postedDate: result.postedDate || '',
    validThrough: result.validThrough || '',
    identity,
    classification: detection.classification,
    confidence: detection.confidence,
    reason: schemaValidation.valid ? detection.reason : `${detection.reason}; ${schemaValidation.code}`,
    pageState: schemaValidation.valid ? 'job_listing' : detection.pageState,
    signals: detection.signals,
    classificationInput: detection.snapshot,
    isJobPage: detection.classification === 'job_listing',
    isExtractionReady: detection.classification === 'job_listing' && validation.valid,
    validation,
    extractionSource: result.extractionSource || strategies.find((item) => item.result?.description)?.source || 'unknown',
    durationMs: Math.round(performance.now() - startedAt),
    extractedAt: new Date().toISOString(),
    contentHash: fingerprint(`${location.href}\n${result.title}\n${result.description}`),
    url: location.href
  };
  trace('Extraction pipeline finished', { classification: finalResult.classification, confidence: finalResult.confidence, isJobPage: finalResult.isJobPage, title: finalResult.title, company: finalResult.company, descriptionLength: finalResult.description.length, extractionSource: finalResult.extractionSource, contentHash: finalResult.contentHash, durationMs: finalResult.durationMs });
  finalResult.trace = traceRecords;
  return finalResult;
}
