/**
 * Torvaix Hybrid Router
 *
 * Two-tier routing system:
 * 1. FAST PATH: Regex patterns for common memory/knowledge/execution queries
 *    - Zero latency, covers ~80% of typical interactions
 * 2. LLM FALLBACK: For ambiguous queries, use a cheap/fast LLM to classify
 *    - Only triggers when fast path is uncertain
 *
 * Returns RoutingDecision compatible with existing types.
 */

import { LLMClient, LLMMessage, type ProviderId } from '@torvaix/providers';
import type { RoutingDecision } from '@torvaix/types';

export type RouteTarget = 'memory' | 'knowledge' | 'execution';

// ── Fast Path Patterns ──
// These regexes detect common query types without any LLM call

const MEMORY_PATTERNS = [
  /^what\s+is\s+my\b/i,
  /^do\s+you\s+remember\b/i,
  /^what\s+did\s+i\s+say\b/i,
  /^recall\b/i,
  /^what\s+do\s+you\s+know\s+about\s+me\b/i,
  /^what\s+was\s+my\b/i,
  /^tell\s+me\s+what\s+i\s+told\s+you\b/i,
  /^remind\s+me\s+(of|about)\s+what\s+i\b/i,
];

const KNOWLEDGE_PATTERNS = [
  /^remember\s+that\b/i,
  /^note\s+that\b/i,
  /^save\s+this\b/i,
  /^my\s+favorite\s+(?:is|are)\b/i,
  /^i\s+prefer\b/i,
  /^keep\s+in\s+mind\b/i,
  /^store\s+this\b/i,
  /^don'?t\s+forget\s+that\b/i,
  /^the\s+deadline\s+is\b/i,
  /^my\s+(?:name|email|phone|address|birthday)\s+is\b/i,
  /^i\s+work\s+(?:at|for)\b/i,
  /^i\s+(?:like|love|hate|dislike)\b/i,
];

const EXECUTION_PATTERNS = [
  /^(?:create|make|write|generate)\s+(?:a|an|the|some)\b/i,
  /^(?:run|execute|perform|do)\b/i,
  /^(?:fix|debug|solve|calculate|compute|convert)\b/i,
  /^(?:search|look\s+up|find)\s+(?:for|up)?\b/i,
  /^(?:list|show|display|print|get)\s+(?:all|the|me)?\b/i,
  /^(?:delete|remove|update|modify|change|rename)\b/i,
  /^(?:read|open|cat|head|tail)\s+(?:the|file|this)?\b/i,
  /^(?:install|set\s+up|configure|build|compile)\b/i,
  /^(?:git\s+(?:clone|pull|push|commit|status|log|branch))\b/i,
  /^(?:npm\s+(?:install|run|build|test|init))\b/i,
  /^(?:python|node|npx)\b/i,
];

// ── Fast Path Router ──

function tryFastPath(prompt: string): { target: RouteTarget; confidence: number; reason: string } | null {
  // Check memory patterns first (recall)
  for (const pattern of MEMORY_PATTERNS) {
    if (pattern.test(prompt)) {
      return { target: 'memory', confidence: 0.95, reason: `Fast path: memory recall pattern "${pattern.source}"` };
    }
  }

  // Check knowledge patterns (store)
  for (const pattern of KNOWLEDGE_PATTERNS) {
    if (pattern.test(prompt)) {
      return { target: 'knowledge', confidence: 0.95, reason: `Fast path: knowledge store pattern "${pattern.source}"` };
    }
  }

  // Check execution patterns (action)
  for (const pattern of EXECUTION_PATTERNS) {
    if (pattern.test(prompt)) {
      return { target: 'execution', confidence: 0.88, reason: `Fast path: execution pattern "${pattern.source}"` };
    }
  }

  // If prompt is very short and looks like a simple question → execution (general chat)
  if (prompt.length < 30 && /^[a-z\s]+\??$/i.test(prompt)) {
    return { target: 'execution', confidence: 0.6, reason: 'Fast path: short general query → execution (chat)' };
  }

  return null; // Ambiguous — needs LLM
}

// ── LLM Fallback Router ──

const ROUTING_SYSTEM_PROMPT = `You are a query classifier for an AI workspace assistant. Classify the user request into exactly one category:

- "knowledge" = User is TELLING you a fact to STORE/SAVE for later. Examples: "remember that my favorite framework is Next.js", "note that the deadline is Friday", "my preferred language is Python", "I work at Acme Corp", "save this API key".
- "memory" = User is ASKING you to RECALL/RETRIEVE something previously stored. Examples: "what is my favorite framework?", "do you remember my API key?", "what did I say about the deadline?", "recall my project setup".
- "execution" = User wants you to DO something: run code, read/write files, search the web, answer general questions, solve problems, create content. Examples: "create a hello.py file", "search for React best practices", "what is the capital of France?", "fix this bug", "write an essay about AI".

Reply with ONLY a JSON object, no markdown, no explanation:
{"target": "memory|knowledge|execution", "confidence": 0.0-1.0, "reason": "one sentence explanation"}`;

async function llmFallbackRoute(
  prompt: string,
  llm: LLMClient,
  model: string = 'gpt-4o-mini'
): Promise<{ target: RouteTarget; confidence: number; reason: string }> {
  const messages: LLMMessage[] = [
    { role: 'system', content: ROUTING_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  try {
    const res = await llm.complete(model, messages, { temperature: 0, maxTokens: 100 });
    const text = res.text.trim();

    // Extract JSON from potential markdown fences
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return { target: 'execution', confidence: 0.5, reason: 'LLM fallback: no JSON found, defaulting to execution' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const target = parsed.target;

    if (!['memory', 'knowledge', 'execution'].includes(target)) {
      return { target: 'execution', confidence: 0.5, reason: 'LLM fallback: invalid target, defaulting to execution' };
    }

    return {
      target,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.8)),
      reason: parsed.reason || 'LLM fallback routing',
    };
  } catch (err: any) {
    return { target: 'execution', confidence: 0.4, reason: `LLM fallback error: ${err.message}` };
  }
}

// ── Provider suggestion based on route target ──

function suggestProvider(target: RouteTarget): { provider: string; reason: string } {
  switch (target) {
    case 'memory':
      return { provider: 'ollama', reason: 'Memory retrieval works well with local models' };
    case 'knowledge':
      return { provider: 'ollama', reason: 'Knowledge storage uses local embeddings' };
    case 'execution':
      return { provider: 'openai', reason: 'Execution may require advanced reasoning' };
    default:
      return { provider: 'ollama', reason: 'Default to local privacy-first' };
  }
}

// ── Public API ──

/**
 * Route a user prompt to the appropriate agent target.
 *
 * Fast path (regex) → zero latency for common patterns
 * LLM fallback → only for ambiguous queries
 */
export async function routePrompt(
  prompt: string,
  options?: {
    llm?: LLMClient;
    fallbackModel?: string;
    useLlmFallback?: boolean;
  }
): Promise<RoutingDecision> {
  // 1. Try fast path
  const fast = tryFastPath(prompt);
  if (fast && fast.confidence >= 0.85) {
    const suggestion = suggestProvider(fast.target);
    return {
      provider: suggestion.provider,
      confidence: fast.confidence,
      reason: `${fast.reason} → ${suggestion.reason}`,
      breakdown: { [fast.target]: fast.confidence, fast_path: 1 },
    };
  }

  // 2. If LLM fallback is available and enabled, use it
  if (options?.useLlmFallback !== false && options?.llm) {
    const llmResult = await llmFallbackRoute(prompt, options.llm, options.fallbackModel);
    const suggestion = suggestProvider(llmResult.target);
    return {
      provider: suggestion.provider,
      confidence: llmResult.confidence,
      reason: `${llmResult.reason} → ${suggestion.reason}`,
      breakdown: { [llmResult.target]: llmResult.confidence, llm_fallback: 1 },
    };
  }

  // 3. Default: fast path with lower confidence, or generic execution
  const target = fast?.target ?? 'execution';
  const confidence = fast?.confidence ?? 0.5;
  const reason = fast?.reason ?? 'No pattern matched, defaulting to execution';
  const suggestion = suggestProvider(target);

  return {
    provider: suggestion.provider,
    confidence,
    reason: `${reason} → ${suggestion.reason}`,
    breakdown: { [target]: confidence, default: 1 },
  };
}

/**
 * Synchronous fast-path only version.
 * Returns null if the prompt is ambiguous (caller should use async routePrompt).
 */
export function routePromptFast(prompt: string): RoutingDecision | null {
  const fast = tryFastPath(prompt);
  if (!fast || fast.confidence < 0.85) return null;

  const suggestion = suggestProvider(fast.target);
  return {
    provider: suggestion.provider,
    confidence: fast.confidence,
    reason: fast.reason,
    breakdown: { [fast.target]: fast.confidence },
  };
}
