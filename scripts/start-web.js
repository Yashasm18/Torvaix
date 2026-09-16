#!/usr/bin/env node
/**
 * Start the built Next.js server (standalone output).
 *
 * The standalone bundle lands in different places depending on where it runs:
 *   - local build:  apps/web/.next/standalone/apps/web/server.js
 *   - Docker image: apps/web/server.js (the standalone tree is copied to the app root)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const candidates = [
  path.join(root, 'apps/web/server.js'),
  path.join(root, 'apps/web/.next/standalone/apps/web/server.js'),
];

const server = candidates.find((file) => fs.existsSync(file));
if (!server) {
  console.error(
    'Could not find the built web server. Run "npm run build" first.\nLooked in:\n' +
      candidates.map((c) => `  - ${c}`).join('\n')
  );
  process.exit(1);
}

const child = spawn(process.execPath, [server], { stdio: 'inherit', env: process.env });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
