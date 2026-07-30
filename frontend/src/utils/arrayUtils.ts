export function ensureArray<T = any>(val: any): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return [val.trim() as any];
  return [];
}

export function ensureStringArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(v => String(v)).filter(Boolean);
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
}
