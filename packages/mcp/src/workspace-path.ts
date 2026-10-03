import * as fs from "fs";
import * as path from "path";

/**
 * Resolves `targetPath` and makes sure it stays inside `workspaceRoot`, following symlinks.
 *
 * Comparing resolved strings alone isn't enough: a symlink inside the workspace that points
 * outside (for example one created by an approved shell command) passed the string check, so
 * read_file and write_file could then reach any file the user can. We therefore also resolve the
 * real location of the deepest part of the path that exists and check that.
 */
export function resolveInsideWorkspace(targetPath: string, workspaceRoot: string): string {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(workspaceRoot);
  if (!isWithin(resolved, root)) throw new Error("Workspace boundary violation: " + resolved);

  const realRoot = safeRealpath(root) ?? root;
  // Follow symlinks for the part of the path that already exists; a not-yet-created tail can't be one.
  let existing = resolved;
  const tail: string[] = [];
  while (existing !== root && safeRealpath(existing) === null) {
    tail.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const realExisting = safeRealpath(existing) ?? existing;
  if (!isWithin(realExisting, realRoot)) {
    throw new Error("Workspace boundary violation (symlink leaves the workspace): " + resolved);
  }
  return resolved;
}

function isWithin(candidate: string, root: string): boolean {
  // Whole path segments: a bare prefix check let "/ws/default" reach "/ws/default-other".
  return candidate === root || candidate.startsWith(root + path.sep);
}

function safeRealpath(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}
