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
import * as fs from 'fs';
import * as path from 'path';

export type ApprovalMode = 'ask' | 'auto' | 'bypass';

export function normalizeApprovalMode(value: unknown): ApprovalMode {
  return value === 'auto' || value === 'bypass' ? value : 'ask';
}

/** Commands that only print information. Kept short on purpose: each one is a promise. */
const READ_ONLY_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'pwd', 'echo', 'date', 'whoami', 'uname', 'grep', 'find']);
/** `find` actions that delete, write a file or run a program. */
const FIND_ACTIONS = /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/;
/** Flags are short letters only: `--output=file` and `-f/etc/passwd` carry a path past the path check. */
const PLAIN_FLAG = /^-[A-Za-z0-9]+$/;
const PYTHON = /^python3?$/;

/** Modules whose public functions only calculate. */
const CALC_MODULES = new Set(['math', 'cmath', 'statistics', 'fractions', 'decimal']);
/** Built-ins that only calculate or print. Nothing here can reach an attribute, a file or other code. */
const CALC_NAMES = new Set([
  'print', 'abs', 'round', 'min', 'max', 'sum', 'pow', 'int', 'float', 'complex', 'bool', 'divmod', 'len', 'range', 'sorted',
  'True', 'False', 'None', 'for', 'in', 'if', 'else', 'and', 'or', 'not',
]);

/**
 * Python that only calculates. This is an allow-list, not a search for dangerous words: a list
 * of forbidden names can be got around by building a name from pieces of text
 * (`attrgetter('_' + '_class_' + '_')`). So the code may contain no text at all (no quotes),
 * only numbers, arithmetic, names from the lists above, its own variables, and
 * `module.function` on a calculation module. Anything else is not "calculation only".
 */
export function isCalculationOnly(code: string): boolean {
  if (!code.trim() || code.length > 2000) return false;
  if (!/^[A-Za-z0-9_ \t\n;.,+\-*\/%()<>=!\[\]:]*$/.test(code)) return false;

  const modules = new Set<string>();
  const variables = new Set<string>();
  for (const statement of code.split(/[\n;]/).map(s => s.trim()).filter(Boolean)) {
    const imported = /^import\s+(\w+(?:\s*,\s*\w+)*)$/.exec(statement);
    if (imported) {
      for (const name of imported[1].split(',').map(m => m.trim())) {
        if (!CALC_MODULES.has(name)) return false;
        modules.add(name);
      }
      continue;
    }
    const assigned = /^([A-Za-z]\w*)\s*=(?!=)/.exec(statement);
    const expression = assigned ? statement.slice(assigned[0].length) : statement;

    // Loop variables of a comprehension are used before the `for` that names them.
    for (const loop of expression.matchAll(/\bfor\s+([A-Za-z]\w*)\s+in\b/g)) {
      if (CALC_NAMES.has(loop[1]) || modules.has(loop[1])) return false;
      variables.add(loop[1]);
    }

    // Names, each with what comes just before it: a dot means it is an attribute of something.
    const names = /(\.\s*)?([A-Za-z_]\w*)/g;
    let previous: { name: string; attribute: boolean } | null = null;
    let lastEnd = 0;
    for (let m = names.exec(expression); m; m = names.exec(expression)) {
      const [, dot, name] = m;
      if (name.startsWith('_')) return false;
      // A digit straight before a name is a number such as 1e5 or 0x1f, not a name.
      const afterDigit = !dot && m.index > 0 && /[0-9.]/.test(expression[m.index - 1]);
      if (afterDigit) { lastEnd = names.lastIndex; continue; }
      if (dot) {
        // Only `module.name`, with nothing between the module and the dot, and never a second level.
        const direct = previous !== null && !previous.attribute && modules.has(previous.name) && expression.slice(lastEnd, m.index).trim() === '';
        if (!direct) return false;
      } else if (!CALC_NAMES.has(name) && !modules.has(name) && !variables.has(name)) {
        return false;
      }
      previous = { name, attribute: Boolean(dot) };
      lastEnd = names.lastIndex;
    }
    if (assigned) {
      if (CALC_NAMES.has(assigned[1]) || CALC_MODULES.has(assigned[1])) return false;
      variables.add(assigned[1]);
    }
  }
  return true;
}

/** Splits a command into words, or null when it uses anything a shell would act on. */
function plainWords(command: string): string[] | null {
  const words: string[] = [];
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;
  // Printable ASCII only: a look-alike character must never be what makes a command seem familiar.
  if (!/^[\x20-\x7e\t]*$/.test(command)) return null;
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

/** Whether `arg`, as a path from the workspace folder, really is inside it once links are followed. */
function staysInside(workspaceRoot: string, arg: string): boolean {
  try {
    const root = fs.realpathSync(workspaceRoot);
    let target = path.resolve(root, arg);
    // A file that doesn't exist yet can't be a link; check the nearest folder that does exist.
    while (!fs.existsSync(target)) {
      if (fs.lstatSync(target, { throwIfNoEntry: false })) return false; // a link that points nowhere
      const parent = path.dirname(target);
      if (parent === target) return false;
      target = parent;
    }
    const real = fs.realpathSync(target);
    return real === root || real.startsWith(root + path.sep);
  } catch {
    return false;
  }
}

/**
 * A shell command that only reads inside the workspace, or only calculates. `workspaceRoot` is
 * where it will run; without it nothing that names a file passes.
 */
export function isReadOnlyCommand(command: string, workspaceRoot?: string): boolean {
  const words = plainWords(command.trim());
  if (!words || words.length === 0) return false;
  const [name, ...args] = words;

  if (PYTHON.test(name)) {
    if (args.length === 1 && (args[0] === '--version' || args[0] === '-V')) return true;
    return args.length === 2 && args[0] === '-c' && isCalculationOnly(args[1]);
  }
  if (!READ_ONLY_COMMANDS.has(name)) return false;
  if (name === 'echo') return true; // it only prints its own words

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (!PLAIN_FLAG.test(arg)) return false;
      if (name === 'find' ? FIND_ACTIONS.test(arg) || arg === '-L' || arg === '-H' : /[LRHrSO]/.test(arg)) return false; // no following links, no recursion
      continue;
    }
    // The pattern after find's -name is not a path, and may use wildcards.
    if (name === 'find' && /^-i?name$/.test(args[i - 1] ?? '')) {
      if (arg.includes('/')) return false;
      continue;
    }
    // Everything else may be a path: it has to be a plain one that stays in the workspace.
    // Wildcards are refused because what they expand to (a link, say) can't be checked here.
    if (/[*?\[\]=]/.test(arg) || arg.startsWith('/') || arg.split('/').includes('..')) return false;
    if (!workspaceRoot || !staysInside(workspaceRoot, arg)) return false;
  }
  return true;
}

/** Whether this call has to wait for the user. Only `bash` and `python` ever do. */
export function needsApproval(mode: ApprovalMode, tool: string, args: Record<string, unknown>, workspaceRoot?: string): boolean {
  if (tool !== 'bash' && tool !== 'python') return false;
  if (mode === 'bypass') return false;
  if (mode === 'ask') return true;
  if (tool === 'python') return !(typeof args.code === 'string' && isCalculationOnly(args.code));
  return !(typeof args.command === 'string' && isReadOnlyCommand(args.command, workspaceRoot));
}
