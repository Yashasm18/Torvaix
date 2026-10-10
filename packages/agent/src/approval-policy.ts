/**
 * When a shell command or Python code may run without the user approving it first.
 *
 * - `ask`    every command waits for approval (the default, and what automations and agent runs use)
 * - `auto`   commands that only read or calculate run at once; anything else still waits
 * - `bypass` nothing waits
 *
 * The mode is the user's choice for a chat. `auto` is deliberately narrow: a command passes only
 * when everything about it is recognised, so an unusual but harmless command asks, which costs a
 * click, while a harmful one never slips through because it looked unfamiliar.
 */
export type ApprovalMode = 'ask' | 'auto' | 'bypass';

export function normalizeApprovalMode(value: unknown): ApprovalMode {
  return value === 'auto' || value === 'bypass' ? value : 'ask';
}

/** Commands that only print information. */
const READ_ONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'pwd', 'echo', 'date', 'whoami', 'which', 'file', 'stat', 'du', 'df', 'uname', 'grep', 'find', 'tree',
]);
/** Flags that make a read-only command write a file or run another program. */
const WRITING_FLAGS: Record<string, RegExp> = {
  find: /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/,
  tree: /^-o/,
};
const PYTHON = /^python3?$/;

/** Standard-library modules that calculate and format, and touch neither files nor the network. */
const SAFE_PYTHON_MODULES = new Set([
  'math', 'cmath', 'statistics', 'decimal', 'fractions', 'random', 'datetime', 'calendar', 'json', 're', 'string',
  'itertools', 'functools', 'collections', 'operator', 'textwrap',
]);
const UNSAFE_PYTHON = /__|\b(open|exec|eval|compile|input|globals|locals|vars|getattr|setattr|delattr|breakpoint|help|exit|quit)\b/;

/** Python that only calculates: no files, no network, no way to reach either. */
export function isCalculationOnly(code: string): boolean {
  if (!code.trim() || code.length > 2000 || UNSAFE_PYTHON.test(code)) return false;
  // Every `import` must be a plain import of an allowed module.
  const statements = code.split(/[\n;]/).map(s => s.trim());
  for (const statement of statements) {
    if (!/\b(import|from)\b/.test(statement)) continue;
    const plain = /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)$/.exec(statement);
    const from = /^from\s+([\w.]+)\s+import\s+[\w*]+(?:\s*,\s*\w+)*$/.exec(statement);
    const modules = plain ? plain[1].split(',').map(m => m.trim()) : from ? [from[1]] : null;
    if (!modules || !modules.every(m => SAFE_PYTHON_MODULES.has(m))) return false;
  }
  return true;
}

/** Splits a command into words, or null when it uses anything a shell would act on. */
function plainWords(command: string): string[] | null {
  const words: string[] = [];
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      // Inside double quotes the shell still expands these.
      else if (quote === '"' && (ch === '$' || ch === '`' || ch === '\\')) return null;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (ch === ' ' || ch === '\t') {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
    } else if (/[;&|<>`$(){}\\\n\r~!#]/.test(ch)) {
      return null;
    } else {
      word += ch;
      inWord = true;
    }
  }
  if (quote) return null;
  if (inWord) words.push(word);
  return words;
}

/** A shell command that only reads inside the workspace, or only calculates. */
export function isReadOnlyCommand(command: string): boolean {
  const words = plainWords(command.trim());
  if (!words || words.length === 0) return false;
  const [name, ...args] = words;

  if (PYTHON.test(name)) {
    if (args.length === 1 && (args[0] === '--version' || args[0] === '-V')) return true;
    return args.length === 2 && args[0] === '-c' && isCalculationOnly(args[1]);
  }
  if (!READ_ONLY_COMMANDS.has(name)) return false;
  // Stay inside the workspace folder: no absolute paths, no "..".
  if (args.some(a => a.startsWith('/') || a.split('/').includes('..'))) return false;
  const writing = WRITING_FLAGS[name];
  return !writing || !args.some(a => writing.test(a));
}

/** Whether this call has to wait for the user. Only `bash` and `python` ever do. */
export function needsApproval(mode: ApprovalMode, tool: string, args: Record<string, unknown>): boolean {
  if (tool !== 'bash' && tool !== 'python') return false;
  if (mode === 'bypass') return false;
  if (mode === 'ask') return true;
  if (tool === 'python') return !(typeof args.code === 'string' && isCalculationOnly(args.code));
  return !(typeof args.command === 'string' && isReadOnlyCommand(args.command));
}
