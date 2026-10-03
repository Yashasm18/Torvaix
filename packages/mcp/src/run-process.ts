import { spawn } from "child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
  /** Exit code, or null if the process was stopped by a signal. */
  code: number | null;
  timedOut: boolean;
  /** True when output was longer than `maxOutputChars` and the rest was dropped. */
  truncated: boolean;
}

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  /** Per stream. Output beyond this is dropped so a noisy command can't flood memory or the model's context. */
  maxOutputChars?: number;
}

const DEFAULT_MAX_OUTPUT = 100_000;

/**
 * Runs a program and always resolves (it never rejects for a failing command).
 *
 * The process starts in its own process group, and on timeout the whole group is killed.
 * `exec`'s timeout only signalled the shell: anything the shell had started (`sleep 60 && ...`,
 * a dev server, a backgrounded job) kept running after the tool reported "timed out", with no
 * way for the agent or the user to see or stop it.
 */
export function runProcess(file: string, args: string[], opts: RunOptions): Promise<RunResult> {
  const max = opts.maxOutputChars ?? DEFAULT_MAX_OUTPUT;
  const posix = process.platform !== "win32";

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const child = spawn(file, args, {
      cwd: opts.cwd,
      detached: posix, // new process group, so -pid below reaches every descendant
      stdio: ["ignore", "pipe", "pipe"],
    });

    const killTree = () => {
      try {
        if (posix && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    };

    const append = (current: string, chunk: Buffer) => {
      if (current.length >= max) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString("utf8");
      if (next.length > max) {
        truncated = true;
        return next.slice(0, max);
      }
      return next;
    };
    child.stdout.on("data", (c: Buffer) => (stdout = append(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = append(stderr, c)));

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, truncated });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
      // Don't wait for pipes that a surviving grandchild might still hold open.
      setTimeout(() => finish(null), 250);
    }, opts.timeoutMs);

    child.on("error", (err) => {
      stderr += `${err.message}\n`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

/** Turns a run into the text the agent (and chat UI) sees. */
export function formatRun(result: RunResult, opts: { label: string; timeoutMs: number; emptyOk: string }): { text: string; isError: boolean } {
  const note = result.truncated ? "\n[output truncated]" : "";
  if (result.timedOut) {
    return {
      isError: true,
      text:
        `${opts.label} timed out after ${Math.round(opts.timeoutMs / 1000)} seconds and was stopped (including anything it started).` +
        `\nStdout so far: ${result.stdout}\nStderr so far: ${result.stderr}${note}`,
    };
  }
  if (result.code !== 0) {
    return {
      isError: true,
      text: `${opts.label} failed (exit code ${result.code ?? "unknown"}).\nStdout: ${result.stdout}\nStderr: ${result.stderr}${note}`,
    };
  }
  return { isError: false, text: (result.stdout || result.stderr || opts.emptyOk) + note };
}
