/**
 * TraceCollector — lightweight agent execution tracer.
 * Matches exact test contract.
 */

export class TraceCollector {
  private events: any[] = [];
  private startedAt = Date.now();
  private tokenUsage = { prompt: 0, completion: 0, total: 0 };

  addEvent(phase: string, action: string, metadata: any = {}) {
    this.events.push({
      phase,
      action,
      metadata,
      timestamp: Date.now(),
    });
  }

  startPhase(name: string, description: string) {
    const phaseStart = performance.now();
    return (metadata?: any) => {
      this.events.push({
        phase: name,
        action: description,
        metadata: metadata || {},
        timestamp: Date.now(),
        durationMs: performance.now() - phaseStart,
      });
    };
  }

  getTrace() {
    return this.events;
  }

  recordLLMCall(model: string, durationMs: number, usage?: any, metadata: any = {}) {
    let tokens = undefined;
    if (usage) {
      tokens = {
        prompt: usage.prompt || 0,
        completion: usage.completion || 0,
        total: (usage.prompt || 0) + (usage.completion || 0),
      };
      this.tokenUsage.prompt += tokens.prompt;
      this.tokenUsage.completion += tokens.completion;
      this.tokenUsage.total += tokens.total;
    }

    this.events.push({
      phase: "llm_call",
      action: `LLM call: ${model}`,
      durationMs,
      tokens,
      metadata: {
        model,
        tokens,
        ...metadata,
      },
      timestamp: Date.now(),
    });
  }

  getTokenUsage() {
    return this.tokenUsage;
  }

  recordToolCall(tool: string, durationMs: number, status: string, metadata: any = {}) {
    this.events.push({
      phase: "tool_call",
      action: `Tool: ${tool}`,
      durationMs,
      metadata: {
        tool,
        status,
        ...metadata,
      },
      timestamp: Date.now(),
    });
  }

  recordApproval(tool: string, approved: boolean, metadata: any = {}) {
    this.events.push({
      phase: "approval",
      action: approved
        ? `Auto-approved: ${tool}`
        : `Awaiting approval: ${tool}`,
      metadata,
      timestamp: Date.now(),
    });
  }

  recordError(phase: string, error: string, metadata: any = {}) {
    this.events.push({
      phase: "error",
      action: error,
      metadata: {
        error,
        ...metadata,
      },
      timestamp: Date.now(),
    });
  }

  getTotalDurationMs() {
    return Date.now() - this.startedAt;
  }

  summarize(iterations: number = 1) {
    const llmCalls = this.events.filter(e => e.phase === "llm_call");
    const toolCalls = this.events.filter(e => e.phase === "tool_call");
    const approvalsAuto = this.events.filter(e => e.phase === "approval" && e.action.includes("Auto-approved"));
    const approvalsReq = this.events.filter(e => e.phase === "approval" && e.action.includes("Awaiting"));
    const errors = this.events.filter(e => e.phase === "error");

    const phases: any = {};
    for (const e of this.events) {
      if (e.phase !== 'llm_call' && e.phase !== 'tool_call' && e.phase !== 'approval' && e.phase !== 'error') {
        phases[e.phase] = (phases[e.phase] || 0) + 1;
      }
    }

    return {
      iterations,
      llmCalls: llmCalls.length,
      toolCalls: toolCalls.length,
      approvalsRequested: approvalsReq.length,
      approvalsAuto: approvalsAuto.length,
      errors: errors.length,
      tokensUsed: this.tokenUsage,
      phases,
      totalMs: this.getTotalDurationMs(),
    };
  }

  serialize(iterations: number = 1) {
    return JSON.stringify({
      totalMs: this.getTotalDurationMs(),
      summary: this.summarize(iterations),
      events: this.events,
    });
  }

  toJSON() {
    return this.serialize(1);
  }
}