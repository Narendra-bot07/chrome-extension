export class ExtractionTelemetry {
  constructor(sink = console.log) { this.sink = sink; }
  emit(session, phase, details = {}) {
    this.sink(`[BIE:${session.sessionId}] ${phase}`, {
      sessionId: session.sessionId,
      attempt: session.attemptId,
      navigationKey: session.navigationKey,
      elapsedMs: Date.now() - Date.parse(session.startedAt),
      ...details
    });
  }
}
