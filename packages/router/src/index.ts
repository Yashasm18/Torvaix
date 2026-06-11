import { RoutingDecision } from '@torvaix/types';

const CATEGORIES = {
  coding: ['code', 'react', 'function', 'debug', 'error', 'typescript', 'python', 'bug', 'component'],
  writing: ['write', 'edit', 'essay', 'blog', 'rewrite', 'grammar', 'summary', 'translate'],
  reasoning: ['math', 'logic', 'calculate', 'why', 'explain', 'how', 'solve', 'theory'],
  research: ['find', 'search', 'history', 'who', 'what', 'when', 'fact', 'data', 'analyze']
};

export function routePrompt(prompt: string): RoutingDecision {
  const words = prompt.toLowerCase().split(/\W+/);
  
  const breakdown: Record<string, number> = {
    coding: 0,
    writing: 0,
    reasoning: 0,
    research: 0
  };

  // Simple keyword matching for V1
  words.forEach(word => {
    if (CATEGORIES.coding.includes(word)) breakdown.coding += 20;
    if (CATEGORIES.writing.includes(word)) breakdown.writing += 20;
    if (CATEGORIES.reasoning.includes(word)) breakdown.reasoning += 20;
    if (CATEGORIES.research.includes(word)) breakdown.research += 20;
  });

  // Base confidence
  breakdown.reasoning += 5;

  let maxScore = 0;
  let topCategory = 'reasoning';

  for (const [category, score] of Object.entries(breakdown)) {
    if (score > maxScore) {
      maxScore = score;
      topCategory = category;
    }
  }

  // Normalize to percentage (roughly)
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const confidence = total > 0 ? Math.min(100, Math.round((maxScore / total) * 100)) : 50;

  // Map category to Provider (Simulated mapping for V1)
  let provider = 'openai';
  let reason = 'General reasoning task';

  switch(topCategory) {
    case 'coding':
      provider = 'deepseek';
      reason = 'Coding & Development Assistance';
      break;
    case 'writing':
      provider = 'anthropic';
      reason = 'Creative Writing & Editing';
      break;
    case 'research':
      provider = 'google';
      reason = 'Research & Data Analysis';
      break;
    case 'reasoning':
      provider = 'openai';
      reason = 'Complex Logic & Reasoning';
      break;
  }

  return {
    provider,
    confidence,
    reason,
    breakdown
  };
}
