/**
 * Tests for the Hybrid Router
 *
 * Tests fast-path regex routing and LLM fallback behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { routePrompt, routePromptFast } from '../index';
import { LLMClient } from '@torvaix/providers';

describe('Router Fast Path', () => {
  it('routes memory recall queries', () => {
    const result = routePromptFast('What is my favorite framework?');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('routes knowledge store queries', () => {
    const result = routePromptFast('Remember that my favorite color is blue');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.95);
  });

  it('routes execution queries', () => {
    const result = routePromptFast('Create a hello.py file');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('routes "list files" to execution', () => {
    const result = routePromptFast('List all files in this directory');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('returns null for ambiguous queries', () => {
    const result = routePromptFast('hmm');
    expect(result).toBeNull();
  });

  it('returns null for very short queries', () => {
    expect(routePromptFast('ok')).toBeNull();
    expect(routePromptFast('?')).toBeNull();
  });

  it('handles edge cases', () => {
    expect(routePromptFast('')).toBeNull();
    expect(routePromptFast('   ')).toBeNull();
  });

  it('routes "remember that..." to knowledge', () => {
    const result = routePromptFast('Remember that the API key is abc123');
    expect(result).not.toBeNull();
    expect(result!.reason.toLowerCase()).toContain('knowledge');
  });

  it('routes "what did I say..." to memory', () => {
    const result = routePromptFast('What did I say about the project?');
    expect(result).not.toBeNull();
    expect(result!.reason.toLowerCase()).toContain('memory');
  });
});

describe('Router LLM Fallback', () => {
  it('uses LLM fallback for ambiguous queries', async () => {
    const mockLLM = {
      complete: vi.fn().mockResolvedValue({
        text: '{"target": "execution", "confidence": 0.9, "reason": "General question"}',
      }),
    } as unknown as LLMClient;

    const result = await routePrompt('What is the meaning of life?', {
      llm: mockLLM,
      useLlmFallback: true,
    });

    expect(mockLLM.complete).toHaveBeenCalledTimes(1);
    expect(result.confidence).toBe(0.9);
    expect(result.reason).toContain('General question');
  });

  it('skips LLM fallback when disabled', async () => {
    const mockLLM = {
      complete: vi.fn(),
    } as unknown as LLMClient;

    const result = await routePrompt('Some ambiguous thing', {
      llm: mockLLM,
      useLlmFallback: false,
    });

    expect(mockLLM.complete).not.toHaveBeenCalled();
    expect(result.confidence).toBeLessThan(0.85);
  });

  it('handles LLM parse errors gracefully', async () => {
    const mockLLM = {
      complete: vi.fn().mockResolvedValue({
        text: 'not valid json at all',
      }),
    } as unknown as LLMClient;

    const result = await routePrompt('Something weird', {
      llm: mockLLM,
    });

    expect(result.confidence).toBe(0.5);
    expect(result.reason).toContain('no JSON found');
  });

  it('handles LLM returning invalid target', async () => {
    const mockLLM = {
      complete: vi.fn().mockResolvedValue({
        text: '{"target": "invalid_target", "confidence": 0.8}',
      }),
    } as unknown as LLMClient;

    const result = await routePrompt('Test', { llm: mockLLM });

    expect(result.confidence).toBe(0.5);
    expect(result.reason).toContain('defaulting to execution');
  });

  it('handles LLM errors gracefully', async () => {
    const mockLLM = {
      complete: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as LLMClient;

    const result = await routePrompt('Test', { llm: mockLLM });

    expect(result.confidence).toBe(0.4);
    expect(result.reason).toContain('Network error');
  });
});

describe('Router without LLM', () => {
  it('returns default for ambiguous query when no LLM provided', async () => {
    const result = await routePrompt('Something completely ambiguous and weird', {
      useLlmFallback: false,
    });

    expect(result.provider).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });
});
