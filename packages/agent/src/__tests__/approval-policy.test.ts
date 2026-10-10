import { describe, it, expect } from 'vitest';
import { isCalculationOnly, isReadOnlyCommand, needsApproval, normalizeApprovalMode } from '../approval-policy';

describe('approval modes', () => {
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
      'cat notes.txt',
      'grep -rn "TODO" src',
      'find . -name "*.ts"',
      'wc -l *.md',
      'python3 --version',
      'python3 -c "import math; print(math.pow(2, 583/156))"',
      "python3 -c 'print(583/156)'",
    ]) {
      expect(needsApproval('auto', 'bash', { command }), command).toBe(false);
    }
    expect(needsApproval('auto', 'python', { code: 'from fractions import Fraction\nprint(Fraction(583, 156))' })).toBe(false);
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
      'find . -name "*.log" -delete',
      'find . -exec rm {} +',
      'tree -o out.txt',
      'python3 script.py',
      'python3 -c "import os; os.remove(\'a\')"',
      'python3 -c "open(\'a\', \'w\')"',
      'python3 -c import llama3.2',
      'git status',
      'npm install',
      'cat "unterminated',
      '',
    ]) {
      expect(needsApproval('auto', 'bash', { command }), command).toBe(true);
    }
    expect(needsApproval('auto', 'bash', {})).toBe(true);
  });

  it('treats Python as a calculation only when it cannot reach files, the network or other code', () => {
    expect(isCalculationOnly('print(2 ** 10)')).toBe(true);
    expect(isCalculationOnly('import math, statistics\nprint(math.pi)')).toBe(true);
    for (const code of [
      'import os',
      'import math, subprocess',
      'from os import system',
      'import importlib',
      "__import__('os')",
      "open('x')",
      "eval('1')",
      "getattr(print, 'x')",
      'x = 1; import socket',
      '',
      'print(1)' + ' '.repeat(2000),
    ]) {
      expect(isCalculationOnly(code), code).toBe(false);
    }
  });

  it('reads a quoted argument as one word', () => {
    expect(isReadOnlyCommand('grep "two words" notes.txt')).toBe(true);
    expect(isReadOnlyCommand('cat "my notes.txt"')).toBe(true);
  });
});
