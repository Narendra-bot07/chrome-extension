const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const fingerprint = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const DETAIL_SEPARATOR = /\s+(?:—|–|â€”|â€“|-)\s+/;

const cleanOptionalDetail = value => {
  const normalized = clean(value);
  return /^(?:0|null|none|undefined|n\/a|na)$/i.test(normalized)
    ? ''
    : normalized;
};

const oneDescription = value => {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();
  return values.flatMap(item => typeof item === 'object' && item !== null
    ? Object.values(item)
    : [item]
  ).map(cleanOptionalDetail).filter(text => {
    const key = fingerprint(text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(' ');
};

export const normalizeDetailedRecords = (items = [], kind = 'achievement') => {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map((item, index) => {
    if (typeof item === 'string') {
      const [title, ...detailParts] = clean(item).split(DETAIL_SEPARATOR);
      return {
        id: `${kind}-${index}-${fingerprint(title).slice(0, 32)}`,
        title: detailParts.length ? title : '',
        description: detailParts.length ? detailParts.join(' — ') : title,
        organization: '',
        date: '',
        metric: '',
        url: ''
      };
    }
    const title = clean(
      item?.title || item?.name || item?.achievement || item?.certification_name
    );
    return {
      id: item?.id || `${kind}-${index}-${fingerprint(title).slice(0, 32)}`,
      title,
      description: oneDescription(
        item?.description || item?.details || item?.summary || item?.evidence
      ),
      organization: cleanOptionalDetail(
        item?.issuing_organization ||
        item?.organization ||
        item?.issuer ||
        item?.provider ||
        item?.authority ||
        item?.institution ||
        item?.metadata?.organization ||
        item?.metadata?.issuer
      ),
      date: cleanOptionalDetail(
        item?.issue_date ||
        item?.date ||
        item?.issued_date ||
        item?.date_issued ||
        item?.completion_date ||
        item?.awarded_date ||
        item?.year ||
        item?.metadata?.issue_date ||
        item?.metadata?.date
      ),
      metric: cleanOptionalDetail(item?.metric),
      url: cleanOptionalDetail(item?.url || item?.link || item?.credential_url),
      links: Array.isArray(item?.links) ? item.links : []
    };
  }).filter(record => {
    const key = fingerprint(`${record.title}|${record.description}|${record.url}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const professionalLink = (key, value) => {
  const raw = String(value || '').trim();
  const cleanUrl = raw
    .replace(/^https?:\/\/(?:www\.)?/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');
  const lowerKey = String(key || '').toLowerCase();
  const lowerVal = raw.toLowerCase();

  if (lowerKey.includes('github') || lowerVal.includes('github.com')) {
    let username = cleanUrl;
    if (cleanUrl.includes('github.com/')) {
      username = cleanUrl.split('github.com/')[1]?.split('/')[0] || cleanUrl;
    }
    const href = cleanUrl.toLowerCase().includes('github.com')
      ? (raw.startsWith('http') ? raw : `https://${cleanUrl}`)
      : `https://github.com/${cleanUrl}`;
    return {
      label: username || 'GitHub',
      type: 'github',
      href
    };
  }

  if (lowerKey.includes('linkedin') || lowerVal.includes('linkedin.com')) {
    let username = cleanUrl;
    if (cleanUrl.includes('linkedin.com/in/')) {
      username = cleanUrl.split('linkedin.com/in/')[1]?.split('/')[0] || cleanUrl;
    } else if (cleanUrl.includes('linkedin.com/pub/')) {
      username = cleanUrl.split('linkedin.com/pub/')[1]?.split('/')[0] || cleanUrl;
    }
    const href = cleanUrl.toLowerCase().includes('linkedin.com')
      ? (raw.startsWith('http') ? raw : `https://${cleanUrl}`)
      : `https://linkedin.com/in/${cleanUrl}`;
    return {
      label: username || 'LinkedIn',
      type: 'linkedin',
      href
    };
  }

  if (lowerVal.includes('leetcode.com') || lowerKey.includes('leetcode')) {
    let username = cleanUrl;
    if (cleanUrl.includes('leetcode.com/')) {
      username = cleanUrl.split('leetcode.com/')[1]?.split('/')[0] || cleanUrl;
    }
    const href = cleanUrl.toLowerCase().includes('leetcode.com')
      ? (raw.startsWith('http') ? raw : `https://${cleanUrl}`)
      : `https://leetcode.com/${cleanUrl}`;
    return { label: username || cleanUrl, type: 'code', href };
  }

  if (lowerVal.includes('drive.google') || lowerVal.includes('certificate')) {
    return { label: 'Certificates', type: 'folder', href: raw.startsWith('http') ? raw : `https://${cleanUrl}` };
  }

  const href = raw.startsWith('http') ? raw : `https://${cleanUrl}`;
  return { label: cleanUrl || raw || 'Profile', type: 'website', href };
};

export const normalizePersonName = value => {
  const normalized = clean(value)
    // PDF/OCR extraction can insert zero-width characters inside names.
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized.split(' ').filter(Boolean);
  const repaired = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = repaired[repaired.length - 1];
    const next = tokens[index + 1];
    // Repair OCR fragments such as "MANTHRA V ADI" or "MANTHR A VADI".
    // A genuine middle initial normally precedes another complete surname
    // ("John A Smith"), so a following fragment of at most four letters is
    // the bounded signal that these three tokens belong to one word.
    if (
      /^[A-Za-z]$/.test(token)
      && previous?.length >= 3
      && /^[A-Za-z]{2,4}$/.test(next || '')
    ) {
      repaired[repaired.length - 1] = `${previous}${token}${next}`;
      index += 1;
    } else {
      repaired.push(token);
    }
  }
  return repaired.join(' ');
};

export const canonicalContactIdentity = (key, value) => {
  const raw = clean(value);
  if (!raw) return '';
  const presentation = professionalLink(key, raw);
  if (presentation.type === 'linkedin' || presentation.type === 'github') {
    const account = raw
      .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
    return `${presentation.type}:${account}`;
  }
  if (/email|mail/i.test(key) || /^mailto:/i.test(raw)) {
    return `email:${raw.replace(/^mailto:/i, '').trim().toLowerCase()}`;
  }
  if (/phone|tel/i.test(key) || /^tel:/i.test(raw)) {
    return `phone:${raw.replace(/^tel:/i, '').replace(/[^\d+]/g, '')}`;
  }
  if (/location/i.test(key)) return `location:${raw.toLowerCase()}`;
  return `link:${raw
    .replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()}`;
};
