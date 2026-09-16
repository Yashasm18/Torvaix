#!/usr/bin/env node
/**
 * Make sure better-sqlite3's native binding matches the running Node version.
 *
 * The binding is compiled for one Node ABI. After switching Node versions (nvm, Homebrew
 * upgrades) `npm install` leaves the old binary in place and the agent crashes with
 * "compiled against a different Node.js version". Rebuild it automatically in that case.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const probe = "new (require('better-sqlite3'))(':memory:').close()";

function bindingWorks() {
  const result = spawnSync(process.execPath, ['-e', probe], { cwd: root, encoding: 'utf8' });
  return { ok: result.status === 0, error: result.stderr || '' };
}

const first = bindingWorks();
if (first.ok) process.exit(0);

const mismatch = /NODE_MODULE_VERSION|Could not locate the bindings file|ERR_DLOPEN_FAILED/.test(first.error);
if (!mismatch) {
  console.error(first.error);
  process.exit(1);
}

console.log(`\n⚠️  better-sqlite3 was built for a different Node version. Rebuilding it for Node ${process.version}...`);
// Rebuild with the Node that is running now: prebuild-install and node-gyp target the Node
// that runs npm, which may not be the same as the first `npm` on PATH.
const npmCli = process.env.npm_execpath;
const rebuild = npmCli && /\.c?js$/.test(npmCli)
  ? spawnSync(process.execPath, [npmCli, 'rebuild', 'better-sqlite3'], { cwd: root, stdio: 'inherit' })
  : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['rebuild', 'better-sqlite3'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

if (rebuild.status === 0 && bindingWorks().ok) {
  console.log('✅ better-sqlite3 rebuilt.\n');
  process.exit(0);
}

console.error(
  '\n❌ Could not rebuild better-sqlite3. Run "npm rebuild better-sqlite3" yourself and check the output.\n' +
    '   Building from source needs Python 3 and a C++ compiler (on macOS: xcode-select --install).\n'
);
process.exit(1);
