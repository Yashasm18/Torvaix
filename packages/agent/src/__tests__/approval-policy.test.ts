import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isCalculationOnly, isReadOnlyCommand, needsApproval, normalizeApprovalMode } from '../approval-policy';

describe('approval modes', () => {
  // A workspace folder with a file, and a link that points out of it.
  let root: string;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'torvaix-approval-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'notes.txt'), 'hello');
    fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
    fs.symlinkSync(path.join(root, 'nowhere-at-all'), path.join(root, 'dangling'));
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('falls back to asking for anything that is not a known mode', () => {
    expect(normalizeApprovalMode('auto')).toBe('auto');
    expect(normalizeApprovalMode('bypass')).toBe('bypass');
    for (const value of [undefined, null, 'AUTO', 'yes', true, {}]) expect(normalizeApprovalMode(value)).toBe('ask');
  });

  it('asks for every command in ask mode and for none in bypass mode', () => {
    expect(needsApproval('ask', 'bash', { command: 'ls' })).toBe(true);
    expect(needsApproval('ask', 'python', { code: 'print(1)' })).toBe(true);
    expect(needsApproval('bypass', 'bash', { command: 'rm -rf build' })).toBe(false);
    expect(needsApproval('bypass', 'python', { code: 'import os' })).toBe(false);
  });

  it('never asks for tools that are not code execution', () => {
    expect(needsApproval('ask', 'read_file', { filePath: 'a.txt' })).toBe(false);
    expect(needsApproval('auto', 'web_search', { query: 'x' })).toBe(false);
  });

  it('in auto mode runs calculations and read-only commands without asking', () => {
    for (const command of [
      'ls -la',
      'ls src',
      'cat notes.txt',
      'head -n 5 notes.txt',
      'grep -n "TODO" notes.txt',
      'find . -name "*.ts"',
      'wc -l notes.txt',
      'echo hello there',
      'pwd',
      'python3 --version',
      'python3 -c "import math; print(math.pow(2, 583/156))"',
      "python3 -c 'print(583/156)'",
    ]) {
      expect(needsApproval('auto', 'bash', { command }, root), command).toBe(false);
    }
    expect(needsApproval('auto', 'python', { code: 'import fractions\nprint(fractions.Fraction(583, 156))' })).toBe(false);
  });

  it('in auto mode still asks for anything that writes, deletes, chains, or leaves the workspace', () => {
    for (const command of [
      'rm notes.txt',
      'ls; rm notes.txt',
      'ls && curl example.com',
      'cat notes.txt > copy.txt',
      'cat notes.txt | sh',
      'echo $(whoami)',
      'echo "$HOME"',
      'echo `id`',
      'cat /etc/passwd',
      'cat ../secret.txt',
      'cat ~/.ssh/id_rsa',
      // A path hidden inside a flag, or reached through a link or a wildcard.
      'grep --file=/etc/passwd x notes.txt',
      'grep -f/etc/passwd notes.txt',
      'cat outside/x',
      'ls outside',
      'cat dangling',
      'cat *',
      'wc -l *.md',
      'grep -r TODO .',
      'grep -R TODO .',
      'ls -R',
      'find -L . -name x',
      'find . -name "*.log" -delete',
      'find . -exec rm {} +',
      'find . -name "../x"',
      'tree',
      'tree -ao out.txt',
      'python3 script.py',
      'python3 -c "import os; os.remove(1)"',
      'python3 -c import llama3.2',
      'python3 -c "print(1); import os"',
      "python3 -c 'print(chr(95))'",
      'git status',
      'npm install',
      'cat "unterminated',
      'c\u0430t notes.txt', // a Cyrillic letter that looks like "a"
      '',
    ]) {
      expect(needsApproval('auto', 'bash', { command }, root), command).toBe(true);
    }
    expect(needsApproval('auto', 'bash', {}, root)).toBe(true);
    // Without knowing the workspace folder, nothing that names a file passes.
    expect(needsApproval('auto', 'bash', { command: 'cat notes.txt' })).toBe(true);
  });

  it('treats Python as a calculation only when it is numbers, arithmetic and known maths functions', () => {
    for (const code of [
      'print(2 ** 10)',
      'import math, statistics\nprint(math.pi * 2)',
      'x = 583 / 156\nprint(round(x, 3))',
      'print(sum([n * n for n in range(10)]))',
      'print(1e5 + 0x1f)',
      'import statistics; print(statistics.mean([1, 2, 3]))',
    ]) {
      expect(isCalculationOnly(code), code).toBe(true);
    }
  });

  it('refuses anything else, including ways around a list of forbidden words', () => {
    for (const code of [
      'import os',
      'import math, subprocess',
      'from os import system',
      'from math import pi',
      'import operator',
      "__import__('os')",
      "open('x')",
      "print('text')",
      'print("text")',
      // Building a forbidden name from pieces needs text, and text is not allowed at all.
      "import operator; operator.attrgetter('_' + '_class_' + '_')(1)",
      'print(().__class__)',
      'print((1).real)',
      'import math; print(math.pi.real)',
      'import statistics; print(statistics.sys.modules)',
      'import statistics; s = statistics.sys; print(s.modules)',
      'import math; print(math._something)',
      'print(undefined_name)',
      'print = 3',
      'math = 3',
      'x = lambda: 1',
      'eval(1)',
      'getattr(1, 2)',
      'vars()',
      'import math; print(math . pi . real)',
      'print(\u0435val)', // a look-alike letter
      'x = [e for e in range(3)]; print(e.real)',
      '',
      'print(1)' + ' '.repeat(2000),
    ]) {
      expect(isCalculationOnly(code), code).toBe(false);
    }
  });

  it('reads a quoted argument as one word', () => {
    expect(isReadOnlyCommand('grep "two words" notes.txt', root)).toBe(true);
    expect(isReadOnlyCommand('cat "my notes.txt"', root)).toBe(true);
  });
});
