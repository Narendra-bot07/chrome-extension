const decodeEntities = (value) => {
  const text = String(value ?? '');
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—'
  };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token) => {
    if (token[0] === '#') {
      const hexadecimal = token[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return named[token.toLowerCase()] ?? entity;
  });
};

const stripMarkup = (value) => decodeEntities(String(value ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[\u00a0\t ]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n')
  .trim()
  .replace(/^[-•*]+\s*/, '');

const splitMarkupItems = (value) => {
  const raw = String(value ?? '');
  const listItems = [...raw.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)]
    .map((match) => match[1]);
  if (listItems.length) return listItems;
  return raw.split(/(?:\r?\n|<br\s*\/?>)+/gi);
};

export const normalizeJobItems = (value) => {
  const values = [];
  const collect = (item) => {
    if (item == null) return;
    if (Array.isArray(item)) return item.forEach(collect);
    if (typeof item === 'object') return Object.values(item).forEach(collect);
    values.push(item);
  };
  collect(value);

  const seen = new Set();
  return values
    .flatMap(splitMarkupItems)
    .map(stripMarkup)
    .filter((item) => {
      if (!item) return false;
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const normalizeJobText = (value) => normalizeJobItems(value).join(' ');
