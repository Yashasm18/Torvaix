/**
 * Tests for TraceCollector
 */

import { describe, it, expect } from 'vitest';
import { TraceCollector } from '../trace';

describe('TraceCollector', () => {
  it('collects events', () => {
    const trace = new TraceCollector();
    trace.addEvent('router', 'Classifying request', { decision: 'memory' });
    trace.addEvent('memory', 'Retrieval complete', { hit: true });

    const events = trace.getTrace();
    expect(events.length).toBe(2);
    expect(events[0].phase).toBe('router');
    expect(events[1].phase).toBe('memory');
  });

  it('measures phase duration', () => {
    const trace = new TraceCollector();
    const end = trace.startPhase('router', 'Test phase');

    // Simulate work
    const start = Date.now();
    while (Date.now() - start < 10) { /* spin */ }

    end({ result: 'ok' });

    const events = trace.getTrace();
    expect(events.length).toBe(1);
    expect(events[0].durationMs).toBeDefined();
    expect(events[0].durationMs!).toBeGreaterThanOrEqual(5);
  });

  it('records LLM calls with token usage', () => {
    const trace = new TraceCollector();
    trace.recordLLMCall('gpt-4o', 250, { prompt: 100, completion: 50 });

    const events = trace.getTrace();
    expect(events.length).toBe(1);
    expect(events[0].phase).toBe('llm_call');
    expect(events[0].tokens).toEqual({ prompt: 100, completion: 50, total: 150 });
  });

  it('aggregates token usage', () => {
    const trace = new TraceCollector();
    trace.recordLLMCall('model1', 100, { prompt: 10, completion: 5 });
    trace.recordLLMCall('model2', 200, { prompt: 20, completion: 10 });

    const usage = trace.getTokenUsage();
    expect(usage.prompt).toBe(30);
    expect(usage.completion).toBe(15);
    expect(usage.total).toBe(45);
  });

  it('records tool calls', () => {
    const trace = new TraceCollector();
    trace.recordToolCall('bash', 150, 'success', { command: 'ls' });

    const events = trace.getTrace();
    expect(events[0].phase).toBe('tool_call');
    expect(events[0].metadata?.tool).toBe('bash');
    expect(events[0].metadata?.status).toBe('success');
  });

  it('records approvals', () => {
    const trace = new TraceCollector();
    trace.recordApproval('bash', false);
    trace.recordApproval('bash', true);

    const events = trace.getTrace();
    expect(events.length).toBe(2);
    expect(events[0].action).toContain('Awaiting approval');
    expect(events[1].action).toContain('Auto-approved');
  });

  it('records errors', () => {
    const trace = new TraceCollector();
    trace.recordError('execution', 'Something went wrong', { detail: 'timeout' });

    const events = trace.getTrace();
    expect(events[0].phase).toBe('error');
    expect(events[0].metadata?.error).toBe('Something went wrong');
  });

  it('generates summary', () => {
    const trace = new TraceCollector();
    trace.startPhase('router', 'Route')();
    trace.recordToolCall('bash', 100, 'success');
    trace.recordApproval('bash', false);
    trace.recordError('execution', 'fail');
    trace.recordLLMCall('gpt-4o', 200, { prompt: 10, completion: 5 });

    const summary = trace.summarize(3);
    expect(summary.iterations).toBe(3);
    expect(summary.toolCalls).toBe(1);
    expect(summary.approvalsRequested).toBe(1);
    expect(summary.approvalsAuto).toBe(0);
    expect(summary.errors).toBe(1);
    expect(summary.tokensUsed.total).toBe(15);
    expect(Object.keys(summary.phases).length).toBeGreaterThan(0);
  });

  it('serializes to JSON', () => {
    const trace = new TraceCollector();
    trace.addEvent('complete', 'Done');

    const serialized = trace.serialize(1);
    const parsed = JSON.parse(serialized);
    expect(parsed.totalMs).toBeGreaterThanOrEqual(0);
    expect(parsed.summary.iterations).toBe(1);
    expect(parsed.events.length).toBe(1);
  });

  it('tracks total duration', () => {
    const trace = new TraceCollector();
    const ms = trace.getTotalDurationMs();
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
