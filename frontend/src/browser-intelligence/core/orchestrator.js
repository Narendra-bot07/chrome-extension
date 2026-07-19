import { createExtractionSession, EXTRACTION_STATUSES } from './contracts.js';
import { diagnoseRecovery, hasProgress, recoveryDelay } from '../recovery/recoveryEngine.js';
import { ExtractionTelemetry } from '../telemetry/telemetry.js';

export class BrowserIntelligenceOrchestrator {
  constructor({ telemetry = new ExtractionTelemetry(), maxAttempts = 3 } = {}) {
    this.telemetry = telemetry;
    this.maxAttempts = maxAttempts;
    this.activeSession = null;
  }

  cancel(reason = 'superseded') {
    if (this.activeSession && !this.activeSession.signal.aborted) {
      this.telemetry.emit(this.activeSession, 'session.cancelled', { reason });
      this.activeSession.controller.abort(reason);
    }
  }

  async run(input, adapter) {
    this.cancel('newer scan started');
    const session = createExtractionSession(input);
    this.activeSession = session;
    this.telemetry.emit(session, 'session.started', { url: input.url });
    let previous = null;

    try {
      for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
        session.attemptId = attempt;
        this.telemetry.emit(session, 'attempt.started');
        const result = await adapter.extract(session);
        if (session.signal.aborted) return { session, status: EXTRACTION_STATUSES.CANCELLED, result: null };
        const decision = diagnoseRecovery(result);
        this.telemetry.emit(session, 'attempt.completed', {
          classification: result.classification, confidence: result.confidence,
          titleFound: Boolean(result.title), descriptionLength: result.description?.length || 0,
          recoveryReason: decision.reason
        });

        if (!decision.recoverable) {
          return { session, status: result.isJobPage ? EXTRACTION_STATUSES.SUCCESS : result.classification === 'uncertain' ? EXTRACTION_STATUSES.UNCERTAIN : EXTRACTION_STATUSES.NON_TARGET, result };
        }
        if (attempt === this.maxAttempts) {
          result.pageState = 'extraction_incomplete';
          result.reason = `${decision.reason}; recovery budget exhausted`;
          return { session, status: EXTRACTION_STATUSES.INCOMPLETE, result };
        }

        const progressed = hasProgress(previous, result);
        this.telemetry.emit(session, 'recovery.diagnosed', { reason: decision.reason, progressed });
        previous = result;
        await adapter.recover(session, decision, recoveryDelay(attempt));
        if (session.signal.aborted) return { session, status: EXTRACTION_STATUSES.CANCELLED, result: null };
      }
    } catch (error) {
      if (error?.name === 'AbortError' || session.signal.aborted) return { session, status: EXTRACTION_STATUSES.CANCELLED, result: null };
      this.telemetry.emit(session, 'session.failed', { code: error?.message || 'UNKNOWN' });
      throw error;
    }
  }
}
