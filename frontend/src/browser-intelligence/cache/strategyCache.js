export class StrategyCache {
  constructor({ storage, prefix = 'astra.strategy.', ttlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
    this.storage = storage;
    this.prefix = prefix;
    this.ttlMs = ttlMs;
    this.memory = new Map();
  }
  key({ hostname, domFingerprint, pageKind = 'UNKNOWN', engineVersion = 'bie-1' }) { return `${hostname}|${pageKind}|${domFingerprint}|${engineVersion}`; }
  async get(parts) {
    const key = this.key(parts);
    const entry = this.memory.get(key) || await this.storage?.get?.(`${this.prefix}${key}`);
    if (!entry || Date.now() > entry.expiresAt || entry.failureCount >= 3 || entry.meanConfidence < 0.5) { this.memory.delete(key); return null; }
    this.memory.set(key, entry);
    return entry;
  }
  async recordSuccess(parts, plan, confidence) {
    const key = this.key(parts);
    const previous = this.memory.get(key);
    const successCount = (previous?.successCount || 0) + 1;
    const meanConfidence = (((previous?.meanConfidence || 0) * (successCount - 1)) + confidence) / successCount;
    const entry = { plan, successCount, failureCount: previous?.failureCount || 0, meanConfidence, updatedAt: Date.now(), expiresAt: Date.now() + this.ttlMs };
    this.memory.set(key, entry); await this.storage?.set?.(`${this.prefix}${key}`, entry); return entry;
  }
  async recordFailure(parts) {
    const key = this.key(parts); const previous = this.memory.get(key); if (!previous) return null;
    const entry = { ...previous, failureCount: previous.failureCount + 1, updatedAt: Date.now() };
    this.memory.set(key, entry); await this.storage?.set?.(`${this.prefix}${key}`, entry); return entry;
  }
}
