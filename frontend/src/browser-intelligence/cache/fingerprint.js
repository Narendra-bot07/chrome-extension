export function fingerprintContext(context) {
  const shape = [
    context.url.hostname,
    context.landmarks?.map((item) => `${item.tag}:${item.role}`).join(','),
    context.headings?.slice(0, 15).map((item) => `${item.tag}:${item.text.toLowerCase().replace(/\d+/g, '#').slice(0, 40)}`).join('|'),
    context.candidates?.slice(0, 15).map((item) => `${item.tag}:${item.role}:${Math.round(item.textLength / 250)}`).join('|'),
    context.jsonLd?.map((item) => item.type).join(',')
  ].join('\n');
  let hash = 2166136261;
  for (let index = 0; index < shape.length; index += 1) { hash ^= shape.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `astra-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
