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
/**
 * The only `find` options allowed. A list of forbidden ones missed `-follow`, which walks
 * through links out of the workspace just as the refused `-L` does.
 */
const FIND_OPTIONS = new Set(['-name', '-iname', '-type', '-maxdepth', '-mindepth', '-size', '-mtime', '-mmin', '-newer', '-empty', '-print']);
/** `find` options followed by a plain value such as `f`, `2` or `+10k`. */
const FIND_VALUE_OPTIONS = new Set(['-type', '-maxdepth', '-mindepth', '-size', '-mtime', '-mmin']);
/** Flags are short letters only: `--output=file` and `-f/etc/passwd` carry a path past the path check. */
const PLAIN_FLAG = /^-[A-Za-z0-9]+$/;
const PYTHON = /^python3?$/;

/** The only names arithmetic may use. None of them can import, read, write or reach an attribute. */
const CALC_NAMES = new Set(['print', 'abs', 'round', 'min', 'max', 'pow', 'int', 'float', 'divmod']);
const NUMBER = /^(\d+\.?\d*|\.\d+|0[xX][0-9a-fA-F]+)$/;

/**
 * Python that is one line of plain arithmetic, such as `print(583 / 156)`.
 *
 * Deliberately tiny. Earlier versions allowed imports, variables and comprehensions, and each
 * of those was a way out: a loop variable named like a built-in made that built-in pass the
 * check, and `import statistics` runs a `statistics.py` the model wrote into the workspace. So
 * there are no imports, no assignments, no loops, no text, no brackets and no attribute access:
 * only numbers, arithmetic operators, parentheses, commas and the names above.
 */
export function isCalculationOnly(code: string): boolean {
  const line = code.trim();
  if (!line || line.length > 300) return false;
  if (!/^[A-Za-z0-9_ .,+\-*\/%()]*$/.test(line)) return false;
  // Every run of letters, digits and dots is either a number or an allowed name. That rules out
  // attribute access ("x.real", "1 .real") and any name not on the list in one go.
  return (line.match(/[A-Za-z0-9_.]+/g) ?? []).every(token => NUMBER.test(token) || CALC_NAMES.has(token));
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
      else if (quote === '"' && /[$`\\%^!]/.test(ch)) return null;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (ch === ' ' || ch === '\t') {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
    } else if (/[;&|<>`$(){}\\\n\r~!#%^]/.test(ch)) {
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
  // The list below assumes a POSIX shell. cmd.exe expands %VAR% and has different commands.
  if (process.platform === 'win32') return false;
  const words = plainWords(command.trim());
  if (!words || words.length === 0) return false;
  const [name, ...args] = words;

  if (PYTHON.test(name)) {
    if (args.length === 1 && (args[0] === '--version' || args[0] === '-V')) return true;
    return args.length === 2 && args[0] === '-c' && isCalculationOnly(args[1]);
  }
  if (!READ_ONLY_COMMANDS.has(name)) return false;
  if (name === 'echo') return true; // it only prints its own words

  if (name === 'find') return isReadOnlyFind(args, workspaceRoot);

  for (const arg of args) {
    if (arg.startsWith('-')) {
      if (!PLAIN_FLAG.test(arg) || /[LRHrSO]/.test(arg)) return false; // no following links, no recursion
      continue;
    }
    if (!isWorkspacePath(arg, workspaceRoot)) return false;
  }
  return true;
}

/**
 * Whether a word that may be a path is a plain one that stays in the workspace. Wildcards are
 * refused because what they expand to (a link, say) can't be checked here.
 */
function isWorkspacePath(arg: string, workspaceRoot: string | undefined): boolean {
  if (/[*?\[\]=]/.test(arg) || arg.startsWith('/') || arg.split('/').includes('..')) return false;
  return Boolean(workspaceRoot) && staysInside(workspaceRoot!, arg);
}

/**
 * `find` read left to right the way find itself reads it: each allowed option says what the next
 * word is. Deciding from the previous word alone was wrong: in `find . -name -name -delete` the
 * second `-name` is a pattern, so `-delete` is an action, yet it was taken for a pattern too and
 * never checked.
 */
function isReadOnlyFind(args: string[], workspaceRoot: string | undefined): boolean {
  let next: 'pattern' | 'value' | null = null;
  for (const arg of args) {
    if (next === 'value') {
      if (!/^([+-]?\d+[A-Za-z]?|[a-z])$/.test(arg)) return false;
      next = null;
    } else if (next === 'pattern') {
      // A name pattern may use wildcards, but is never a path and never looks like an option.
      if (arg.startsWith('-') || arg.includes('/')) return false;
      next = null;
    } else if (arg.startsWith('-')) {
      if (!FIND_OPTIONS.has(arg)) return false;
      next = FIND_VALUE_OPTIONS.has(arg) ? 'value' : arg === '-name' || arg === '-iname' ? 'pattern' : null;
    } else if (!isWorkspacePath(arg, workspaceRoot)) {
      return false; // a starting folder, or the file after -newer
    }
  }
  return next === null; // an option left without its value is not something to guess about
}

/** Whether this call has to wait for the user. Only `bash` and `python` ever do. */
export function needsApproval(mode: ApprovalMode, tool: string, args: Record<string, unknown>, workspaceRoot?: string): boolean {
  if (tool !== 'bash' && tool !== 'python') return false;
  if (mode === 'bypass') return false;
  if (mode === 'ask') return true;
  if (tool === 'python') return !(typeof args.code === 'string' && isCalculationOnly(args.code));
  return !(typeof args.command === 'string' && isReadOnlyCommand(args.command, workspaceRoot));
}
