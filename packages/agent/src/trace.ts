/**
 * TraceCollector — lightweight agent execution tracer.
 * Records phases, tool calls, approvals, errors, and events for observability.
 */

export class TraceCollector {
  private phases: any[] = [];
  private events: any[] = [];
  private errors: any[] = [];
  private toolCalls: any[] = [];
  private approvals: any[] = [];
  private startTime: number = Date.now();
  private tokenUsage = { prompt: 0, completion: 0, total: 0 };

  startPhase(name: string, description: string) {
    const phaseStart = performance.now();
    const phase = { name, description, startTime: phaseStart, endTime: 0, metadata: {} as any };
    this.phases.push(phase);

    // Return an endTrace function
    return (metadata?: any) => {
      phase.endTime = performance.now();
      phase.metadata = metadata ?? {};
    };
  }

  recordToolCall(tool: string, durationMs: number, status: string, metadata?: any) {
    this.toolCalls.push({ tool, durationMs, status, metadata, timestamp: Date.now() });
  }

  recordApproval(tool: string, approved: boolean, metadata?: any) {
    this.approvals.push({ tool, approved, metadata, timestamp: Date.now() });
  }

  recordError(category: string, message: string, metadata?: any) {
    this.errors.push({ category, message, metadata, timestamp: Date.now() });
  }

  addEvent(type: string, description: string, metadata?: any) {
    this.events.push({ type, description, metadata, timestamp: Date.now() });
  }

  recordTokenUsage(prompt: number, completion: number) {
    this.tokenUsage.prompt += prompt;
    this.tokenUsage.completion += completion;
    this.tokenUsage.total += prompt + completion;
  }

  getTotalDurationMs(): number {
    return Date.now() - this.startTime;
  }

  getTokenUsage() {
    return this.tokenUsage;
  }

  serialize(iterations: number): string {
    return JSON.stringify({
      iterations,
      totalMs: this.getTotalDurationMs(),
      phases: this.phases.map(p => ({
        name: p.name,
        description: p.description,
        durationMs: p.endTime ? p.endTime - p.startTime : 0,
        metadata: p.metadata,
      })),
      toolCalls: this.toolCalls,
      approvals: this.approvals,
      errors: this.errors,
      events: this.events,
      tokens: this.tokenUsage,
    });
  }
}