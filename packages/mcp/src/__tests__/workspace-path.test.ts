import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveInsideWorkspace } from '../workspace-path';

let base: string;
let ws: string;
let outside: string;

beforeAll(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'torvaix-ws-')));
  ws = path.join(base, 'ws');
  outside = path.join(base, 'outside');
  fs.mkdirSync(path.join(ws, 'sub'), { recursive: true });
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(base, 'ws-other'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  fs.writeFileSync(path.join(ws, 'sub', 'ok.txt'), 'ok');
  fs.symlinkSync(outside, path.join(ws, 'link-dir'));
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(ws, 'link-file'));
  fs.symlinkSync(path.join(ws, 'sub'), path.join(ws, 'inner-link'));
});

afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

describe('resolveInsideWorkspace', () => {
  it('allows files and not-yet-created files inside the workspace', () => {
    expect(resolveInsideWorkspace(path.join(ws, 'sub', 'ok.txt'), ws)).toBe(path.join(ws, 'sub', 'ok.txt'));
    expect(resolveInsideWorkspace(path.join(ws, 'new', 'deep', 'file.txt'), ws)).toBe(path.join(ws, 'new', 'deep', 'file.txt'));
    expect(resolveInsideWorkspace(ws, ws)).toBe(ws);
  });

  it('allows symlinks that stay inside the workspace', () => {
    expect(() => resolveInsideWorkspace(path.join(ws, 'inner-link', 'ok.txt'), ws)).not.toThrow();
  });

  it('rejects ../ escapes and sibling folders that share a prefix', () => {
    expect(() => resolveInsideWorkspace(path.join(ws, '..', 'outside', 'secret.txt'), ws)).toThrow(/boundary/);
    expect(() => resolveInsideWorkspace(path.join(base, 'ws-other', 'x'), ws)).toThrow(/boundary/);
    expect(() => resolveInsideWorkspace('/etc/passwd', ws)).toThrow(/boundary/);
  });

  it('rejects symlinks that lead out of the workspace, for reads and for writes', () => {
    expect(() => resolveInsideWorkspace(path.join(ws, 'link-file'), ws)).toThrow(/symlink/);
    expect(() => resolveInsideWorkspace(path.join(ws, 'link-dir', 'secret.txt'), ws)).toThrow(/symlink/);
    // Writing a new file through a symlinked directory would land outside too.
    expect(() => resolveInsideWorkspace(path.join(ws, 'link-dir', 'new-file.txt'), ws)).toThrow(/symlink/);
  });
});
