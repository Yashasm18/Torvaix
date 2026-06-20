/**
 * TraceCollector — Lightweight observability for Torvaix agent execution.
 * 
 * Collects structured trace events during a single agent run:
 * - Router decisions
 * - Memory hits/misses
 * - Tool execution timings
 * - Approval gate pauses
 * - Execution phase transitions
 * 
 * The collected trace is serialized and streamed to the frontend
 * via the `o:` chunk type in the Vercel AI DataStream protocol.
 */

export interface TraceEvent {
  phase: 'router' | 'memory' | 'knowledge' | 'execution' | 'approval' | 'complete';
  action: string;
  durationMs?: number;
  metadata?: Record<string, any>;
  timestamp: number; // epoch ms
}

export class TraceCollector {
  private events: TraceEvent[] = [];
  private startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  /** Record a timed phase. Call start(), do work, then call end(). */
  public startPhase(phase: TraceEvent['phase'], action: string): () => void {
    const phaseStart = performance.now();
    return (metadata?: Record<string, any>) => {
      this.events.push({
        phase,
        action,
        durationMs: Math.round((performance.now() - phaseStart) * 100) / 100,
        metadata,
        timestamp: Date.now(),
      });
    };
  }

  /** Record an instant event (no duration). */
  public addEvent(phase: TraceEvent['phase'], action: string, metadata?: Record<string, any>) {
    this.events.push({
      phase,
      action,
      metadata,
      timestamp: Date.now(),
    });
  }

  /** Get all collected events. */
  public getTrace(): TraceEvent[] {
    return this.events;
  }

  /** Total wall-clock time since collector was created. */
  public getTotalDurationMs(): number {
    return Math.round((performance.now() - this.startTime) * 100) / 100;
  }

  /** Serialize the full trace for streaming via `o:` chunk. */
  public serialize(): string {
    return JSON.stringify({
      totalMs: this.getTotalDurationMs(),
      events: this.events,
    });
  }
}
