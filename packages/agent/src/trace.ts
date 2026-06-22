/**
 * TraceCollector — Enhanced observability for Torvaix agent execution.
 *
 * Collects structured trace events during a single agent run:
 * - Router decisions with timing
 * - Memory hits/misses with retrieval scores
 * - Tool execution timings
 * - Approval gate pauses
 * - Token usage tracking
 * - Error capture
 * - Phase transitions
 *
 * Serialized and streamed to the frontend via the `e:` chunk type.
 */

export type TracePhase =
  | 'router'
  | 'memory'
  | 'knowledge'
  | 'execution'
  | 'approval'
  | 'llm_call'
  | 'tool_call'
  | 'mcp'
  | 'complete'
  | 'error';

export interface TraceEvent {
  phase: TracePhase;
  action: string;
  durationMs?: number;
  /** Token usage for this event (if applicable) */
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  metadata?: Record<string, any>;
  timestamp: number; // epoch ms
}

export interface TraceSummary {
  totalMs: number;
  iterations: number;
  routingTimeMs: number;
  toolCalls: number;
  approvalsRequested: number;
  approvalsAuto: number;
  errors: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  phases: Record<string, { count: number; totalMs: number }>;
}

export class TraceCollector {
  private events: TraceEvent[] = [];
  private startTime: number;
  private tokenTotals = { prompt: 0, completion: 0, total: 0 };

  constructor() {
    this.startTime = performance.now();
  }

  /** Record a timed phase. Returns an end() function to call when done. */
  startPhase(phase: TracePhase, action: string): (metadata?: Record<string, any>, tokens?: { prompt?: number; completion?: number }) => void {
    const phaseStart = performance.now();
    return (metadata?: Record<string, any>, tokens?: { prompt?: number; completion?: number }) => {
      const durationMs = Math.round((performance.now() - phaseStart) * 100) / 100;
      const event: TraceEvent = {
        phase,
        action,
        durationMs,
        metadata,
        timestamp: Date.now(),
      };
      if (tokens) {
        event.tokens = {
          prompt: tokens.prompt ?? 0,
          completion: tokens.completion ?? 0,
          total: (tokens.prompt ?? 0) + (tokens.completion ?? 0),
        };
        this.tokenTotals.prompt += tokens.prompt ?? 0;
        this.tokenTotals.completion += tokens.completion ?? 0;
        this.tokenTotals.total += event.tokens.total;
      }
      this.events.push(event);
    };
  }

  /** Record an LLM call with token usage. */
  recordLLMCall(
    model: string,
    durationMs: number,
    tokens?: { prompt?: number; completion?: number },
    metadata?: Record<string, any>
  ) {
    const event: TraceEvent = {
      phase: 'llm_call',
      action: `LLM: ${model}`,
      durationMs: Math.round(durationMs * 100) / 100,
      timestamp: Date.now(),
      metadata: { model, ...metadata },
    };
    if (tokens) {
      event.tokens = {
        prompt: tokens.prompt ?? 0,
        completion: tokens.completion ?? 0,
        total: (tokens.prompt ?? 0) + (tokens.completion ?? 0),
      };
      this.tokenTotals.prompt += tokens.prompt ?? 0;
      this.tokenTotals.completion += tokens.completion ?? 0;
      this.tokenTotals.total += event.tokens.total;
    }
    this.events.push(event);
  }

  /** Record a tool execution. */
  recordToolCall(tool: string, durationMs: number, status: 'success' | 'error', metadata?: Record<string, any>) {
    this.events.push({
      phase: 'tool_call',
      action: `Tool: ${tool}`,
      durationMs: Math.round(durationMs * 100) / 100,
      timestamp: Date.now(),
      metadata: { tool, status, ...metadata },
    });
  }

  /** Record an approval gate event. */
  recordApproval(tool: string, autoApproved: boolean, metadata?: Record<string, any>) {
    this.events.push({
      phase: 'approval',
      action: autoApproved ? `Auto-approved: ${tool}` : `Awaiting approval: ${tool}`,
      timestamp: Date.now(),
      metadata: { tool, autoApproved, ...metadata },
    });
  }

  /** Record an error. */
  recordError(phase: TracePhase, error: string, metadata?: Record<string, any>) {
    this.events.push({
      phase: 'error',
      action: `Error in ${phase}`,
      timestamp: Date.now(),
      metadata: { error, phase, ...metadata },
    });
  }

  /** Record an instant event (no duration). */
  addEvent(phase: TracePhase, action: string, metadata?: Record<string, any>) {
    this.events.push({
      phase,
      action,
      metadata,
      timestamp: Date.now(),
    });
  }

  /** Get all collected events. */
  getTrace(): TraceEvent[] {
    return this.events;
  }

  /** Total wall-clock time since collector was created. */
  getTotalDurationMs(): number {
    return Math.round((performance.now() - this.startTime) * 100) / 100;
  }

  /** Get aggregated token usage. */
  getTokenUsage() {
    return { ...this.tokenTotals };
  }

  /** Build a summary of the trace. */
  summarize(iterations: number = 0): TraceSummary {
    const phases: Record<string, { count: number; totalMs: number }> = {};
    let routingTimeMs = 0;
    let toolCalls = 0;
    let approvalsRequested = 0;
    let approvalsAuto = 0;
    let errors = 0;

    for (const e of this.events) {
      const key = e.phase;
      if (!phases[key]) phases[key] = { count: 0, totalMs: 0 };
      phases[key].count++;
      if (e.durationMs) phases[key].totalMs += e.durationMs;

      if (e.phase === 'router' && e.durationMs) routingTimeMs += e.durationMs;
      if (e.phase === 'tool_call') toolCalls++;
      if (e.phase === 'approval') {
        if (e.metadata?.autoApproved) approvalsAuto++;
        else approvalsRequested++;
      }
      if (e.phase === 'error') errors++;
    }

    return {
      totalMs: this.getTotalDurationMs(),
      iterations,
      routingTimeMs: Math.round(routingTimeMs * 100) / 100,
      toolCalls,
      approvalsRequested,
      approvalsAuto,
      errors,
      tokensUsed: { ...this.tokenTotals },
      phases,
    };
  }

  /** Serialize the full trace for streaming via `e:` chunk. */
  serialize(iterations: number = 0): string {
    return JSON.stringify({
      totalMs: this.getTotalDurationMs(),
      summary: this.summarize(iterations),
      events: this.events,
    });
  }
}
