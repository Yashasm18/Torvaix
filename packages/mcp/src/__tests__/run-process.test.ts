import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runProcess, formatRun } from '../run-process';

const cwd = os.tmpdir();

describe('runProcess', () => {
  it('captures output and the exit code, and never rejects for a failing command', async () => {
    const ok = await runProcess('/bin/sh', ['-c', 'echo out; echo err 1>&2'], { cwd, timeoutMs: 5000 });
    expect(ok).toMatchObject({ stdout: 'out\n', stderr: 'err\n', code: 0, timedOut: false });

    const bad = await runProcess('/bin/sh', ['-c', 'echo partial; exit 3'], { cwd, timeoutMs: 5000 });
    expect(bad).toMatchObject({ stdout: 'partial\n', code: 3, timedOut: false });

    const missing = await runProcess('/definitely/not/a/program', [], { cwd, timeoutMs: 5000 });
    expect(missing.code).toBeNull();
    expect(missing.stderr).toMatch(/ENOENT/);
  });

  it('runs the command exactly as given: "python" is not rewritten to "python3"', async () => {
    const run = await runProcess('/bin/sh', ['-c', 'echo "python.txt python"'], { cwd, timeoutMs: 5000 });
    expect(run.stdout).toBe('python.txt python\n');
  });

  it('stops everything the command started when it times out, not just the shell', async () => {
    const marker = path.join(os.tmpdir(), `torvaix-orphan-${process.pid}-${Date.now()}`);
    // The shell forks a child that would write the marker after 1.5s, well after the 300ms timeout.
    const started = Date.now();
    const run = await runProcess('/bin/sh', ['-c', `(sleep 1.5 && echo alive > "${marker}") & wait`], { cwd, timeoutMs: 300 });
    expect(run.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(1200);

    await new Promise((r) => setTimeout(r, 2200));
    expect(fs.existsSync(marker)).toBe(false); // the orphan was killed with the group
    fs.rmSync(marker, { force: true });
  });

  it('returns promptly even if a descendant holds the output pipe open', async () => {
    const started = Date.now();
    const run = await runProcess('/bin/sh', ['-c', 'sleep 5 & sleep 5'], { cwd, timeoutMs: 300 });
    expect(run.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('caps very long output', async () => {
    const run = await runProcess('/bin/sh', ['-c', 'yes x | head -c 500000'], { cwd, timeoutMs: 5000, maxOutputChars: 1000 });
    expect(run.stdout.length).toBe(1000);
    expect(run.truncated).toBe(true);
  });
});

describe('formatRun', () => {
  const base = { stdout: '', stderr: '', code: 0, timedOut: false, truncated: false };
  const opts = { label: 'Command', timeoutMs: 15000, emptyOk: 'no output' };

  it('describes success, failure and timeout distinctly', () => {
    expect(formatRun({ ...base, stdout: 'hi' }, opts)).toEqual({ text: 'hi', isError: false });
    expect(formatRun(base, opts)).toEqual({ text: 'no output', isError: false });
    expect(formatRun({ ...base, code: 2, stderr: 'boom' }, opts)).toMatchObject({ isError: true });
    expect(formatRun({ ...base, code: 2, stderr: 'boom' }, opts).text).toContain('exit code 2');
    const t = formatRun({ ...base, code: null, timedOut: true }, opts);
    expect(t.isError).toBe(true);
    expect(t.text).toContain('timed out after 15 seconds');
  });
});
