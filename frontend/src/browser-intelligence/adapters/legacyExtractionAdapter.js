import { assertExtractionResult } from '../core/contracts.js';

export class LegacyExtractionAdapter {
  constructor({ executeExtraction, waitForProgress }) {
    this.executeExtraction = executeExtraction;
    this.waitForProgress = waitForProgress;
  }
  async extract(session) {
    if (session.signal.aborted) throw new DOMException('Extraction cancelled', 'AbortError');
    return assertExtractionResult(await this.executeExtraction(session));
  }
  async recover(session, decision, delayMs) {
    if (session.signal.aborted) throw new DOMException('Extraction cancelled', 'AbortError');
    return this.waitForProgress(session, decision, delayMs);
  }
}
