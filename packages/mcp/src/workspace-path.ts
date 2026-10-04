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
  while (existing !== root && !existsOnDisk(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  if (!isWithin(realLocation(existing), realRoot)) {
    throw new Error("Workspace boundary violation (symlink leaves the workspace): " + resolved);
  }
  return resolved;
}

/** True for anything present at `p`, including a symlink whose target is missing. */
function existsOnDisk(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where `p` really is. For a symlink whose target doesn't exist, that is where the target would
 * be created: `realpath` fails on those, and a write through one lands at the target.
 */
function realLocation(p: string, hops = 0): string {
  const real = safeRealpath(p);
  if (real !== null) return real;
  try {
    if (hops < 40 && fs.lstatSync(p).isSymbolicLink()) {
      const target = path.resolve(path.dirname(p), fs.readlinkSync(p));
      let existing = target;
      while (!existsOnDisk(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
      return path.join(realLocation(existing, hops + 1), path.relative(existing, target));
    }
  } catch {
    /* fall through */
  }
  return p;
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
