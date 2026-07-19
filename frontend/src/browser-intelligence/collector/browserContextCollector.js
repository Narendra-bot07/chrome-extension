export function collectBrowserContextInPage(options = {}) {
  const limits = { maxTextBlocks: 80, maxTextChars: 12000, maxCandidates: 60, maxItems: 50, ...(options || {}) };
  const clean = (value = '') => String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const isSensitive = (el) => Boolean(el?.closest?.('input, textarea, [contenteditable="true"], [type="password"], [autocomplete*="password" i], [aria-label*="message" i], [class*="messaging" i]'));
  const isVisible = (el) => {
    if (!el || isSensitive(el)) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  };
  const nodeHandle = (el) => {
    const parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 6) {
      const tag = node.tagName?.toLowerCase();
      if (!tag) break;
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter((item) => item.tagName === node.tagName) : [];
      parts.unshift(`${tag}:${Math.max(0, siblings.indexOf(node))}`);
      node = node.parentElement;
    }
    return parts.join('/');
  };
  const summarize = (el) => {
    let hrefPath = '';
    if (el.tagName?.toLowerCase() === 'a' && el.getAttribute('href')) {
      try { hrefPath = new URL(el.getAttribute('href'), location.href).pathname; } catch { /* invalid page URL */ }
    }
    return {
      handle: nodeHandle(el), tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '',
      label: clean(el.getAttribute('aria-label') || el.getAttribute('title') || ''),
      text: clean(el.innerText || el.textContent || '').slice(0, 300), hrefPath,
      selected: el.matches('[aria-selected="true"],[aria-current="true"],[data-selected="true"],.selected,.active')
    };
  };
  const collect = (selector, max = limits.maxItems) => Array.from(document.querySelectorAll(selector)).filter(isVisible).slice(0, max).map(summarize);
  const safeMeta = Array.from(document.querySelectorAll('meta[name], meta[property]')).slice(0, limits.maxItems).map((meta) => ({
    key: meta.getAttribute('name') || meta.getAttribute('property'),
    content: clean(meta.getAttribute('content') || '').slice(0, 500)
  })).filter((item) => /^(description|author|og:|twitter:)/i.test(item.key || ''));
  const jsonLd = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const parsed = JSON.parse(script.textContent || '{}');
      const items = Array.isArray(parsed) ? parsed : [parsed, ...(parsed?.['@graph'] || [])];
      items.filter(Boolean).slice(0, 20).forEach((item) => jsonLd.push({
        type: item['@type'] || '',
        keys: Object.keys(item).slice(0, 30),
        summary: {
          title: clean(item.title || item.name || '').slice(0, 200),
          descriptionLength: clean(item.description || '').length,
          organization: clean(item.hiringOrganization?.name || item.brand?.name || '').slice(0, 200),
          datePosted: clean(item.datePosted || item.datePublished || '').slice(0, 80)
        }
      }));
    } catch { /* malformed page data */ }
  });
  const candidateSelector = 'main, article, section, [role="main"], [role="article"], [role="region"], [class*="description" i], [class*="details" i]';
  const candidates = Array.from(document.querySelectorAll(candidateSelector)).filter(isVisible).map((el) => {
    const text = clean(el.innerText || el.textContent || '');
    const headings = el.querySelectorAll('h1,h2,h3,[role="heading"]').length;
    const actions = Array.from(el.querySelectorAll('a,button,[role="button"]')).filter(isVisible).length;
    return { ...summarize(el), textLength: text.length, headings, actions, score: Math.min(1, (text.length / 2000) + headings * 0.08 + actions * 0.02) };
  }).filter((item) => item.textLength >= 40).sort((a, b) => b.score - a.score).slice(0, limits.maxCandidates);
  const textBlocks = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,li,dt,dd')).filter(isVisible).map((el) => ({ ...summarize(el), text: clean(el.innerText || el.textContent || '').slice(0, 1000) })).filter((item) => item.text.length >= 3);
  let remaining = limits.maxTextChars;
  const boundedText = [];
  for (const block of textBlocks.slice(0, limits.maxTextBlocks)) {
    if (remaining <= 0) break;
    const text = block.text.slice(0, remaining);
    boundedText.push({ ...block, text });
    remaining -= text.length;
  }
  const shadowHosts = Array.from(document.querySelectorAll('*')).filter((el) => el.shadowRoot).slice(0, 30).map((el) => ({ handle: nodeHandle(el), tag: el.tagName.toLowerCase(), childCount: el.shadowRoot.childElementCount }));
  const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
  return {
    schemaVersion: 'astra-context-1',
    collectedAt: new Date().toISOString(),
    url: { href: location.href, hostname: location.hostname, pathname: location.pathname, queryKeys: Array.from(new URL(location.href).searchParams.keys()), canonical },
    document: { title: document.title, readyState: document.readyState, language: document.documentElement.lang || '', mutationEpoch: Number(document.documentElement.dataset.astraMutationEpoch || 0) },
    viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY, devicePixelRatio },
    metadata: safeMeta,
    jsonLd: jsonLd.slice(0, 20),
    headings: collect('h1,h2,h3,h4,[role="heading"]'),
    actions: collect('button,a,[role="button"]'),
    forms: collect('form'),
    tables: collect('table'),
    landmarks: collect('main,nav,aside,header,footer,[role="main"],[role="navigation"],[role="complementary"]'),
    selected: collect('[aria-selected="true"],[aria-current="true"],[data-selected="true"],.selected,.active', 30),
    candidates,
    textBlocks: boundedText,
    frames: Array.from(document.querySelectorAll('iframe')).slice(0, 20).map((frame) => ({ title: clean(frame.title), srcOrigin: (() => { try { return new URL(frame.src, location.href).origin; } catch { return ''; } })() })),
    shadowRoots: shadowHosts,
    loading: collect('[aria-busy="true"],[role="progressbar"],[class*="loading" i],[class*="spinner" i]', 20),
    stats: { candidateCount: candidates.length, textBlockCount: boundedText.length, textChars: limits.maxTextChars - remaining }
  };
}
