/**
 * Deterministic fast paths for the router. Only unambiguous requests are routed here;
 * anything else returns null and goes to the LLM classifier.
 *
 * Earlier substring checks misrouted common messages: "do you remember my framework?"
 * matched "remember" and was *stored* as a new memory, "how do I create a component?"
 * went to the file-writing tool agent, and "explain microservices architecture" ran a
 * repository scan.
 */

export type KeywordRoute = 'identity' | 'knowledge' | 'memory' | 'repo_analysis' | 'execution';

const IDENTITY = /^(who are you|(what|what's|whats|what is) (your|ur) name)[?.! ]*$/;

// Checked before writes, so "do you remember that..." is a question, not a new fact.
const MEMORY_QUERY =
  /\b(do|did) you (still )?remember\b|\bwhat do you (remember|know about me)\b|\brecall\b|\bwhat did i (say|tell you)\b/;

const MEMORY_WRITE =
  /^(please )?(remember|memorize)\b|\bremember (that|this|my|i)\b|\b(store|save|note|memorize) (this|that)\b|\bnote to self\b|\bkeep in mind\b/;

const REPO_ANALYSIS =
  /\b(analy[sz]e|scan|inspect|review) (the |this |my |our )?(repo|repository|codebase|code base|project structure)\b|\b(repo|repository|codebase) (architecture|structure)\b|\bcheck (the )?routes\b/;

// Questions ("how do I create...", "what does run mean") are left to the classifier.
const QUESTION = /^(how|what|what's|whats|why|when|where|which|who|can|could|should|would|is|are|do|does|explain|describe|tell me)\b/;

const FILE_ACTION =
  /\b(create|write|generate|make|modify|edit|update|delete|read|open|run|execute)\b.*\b[\w-]+\.(py|js|mjs|cjs|ts|tsx|jsx|json|md|txt|sh|html|css|csv|ya?ml)\b/;

const TOOL_ACTION =
  /^(please )?(run|execute|list|search|read|open|create|write|generate|make|modify|edit|delete)\b.*\b(file|files|folder|directory|script|command|web|online|internet)\b/;

// Live information only a web search can provide, even when phrased as a question.
const LIVE_LOOKUP = /\b(latest|news|weather|stock price|price of)\b/;

export function keywordRoute(instructions: string): KeywordRoute | null {
  const text = instructions.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;

  if (IDENTITY.test(text)) return 'identity';
  if (MEMORY_QUERY.test(text)) return 'memory';
  if (MEMORY_WRITE.test(text)) return 'knowledge';
  if (REPO_ANALYSIS.test(text)) return 'repo_analysis';
  if (LIVE_LOOKUP.test(text)) return 'execution';
  if (!QUESTION.test(text) && (FILE_ACTION.test(text) || TOOL_ACTION.test(text))) return 'execution';
  return null;
}
