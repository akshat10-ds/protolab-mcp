/**
 * No-op analytics tracker for serverless deployment.
 *
 * Discards all events (no filesystem access in serverless).
 * Keeps session info in memory for the withTracking wrapper.
 */

import type { AnalyticsEvent } from './events';

export class Tracker {
  private sessionId?: string;
  private clientName?: string;
  private clientVersion?: string;

  /** Set session info — called lazily on first tool call. */
  setSession(id: string, clientName?: string, clientVersion?: string): void {
    this.sessionId = id;
    this.clientName = clientName;
    this.clientVersion = clientVersion;
  }

  /** No-op — events are discarded in serverless mode. */
  emit(_event: AnalyticsEvent): void {
    // Intentionally empty — no filesystem in serverless
  }

  /** Returns empty string — no log file in serverless mode. */
  getLogPath(): string {
    return '';
  }
}
