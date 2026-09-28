#!/usr/bin/env node
/**
 * Start the built Next.js server (standalone output).
 *
 * The standalone bundle lands in different places depending on where it runs:
 *   - local build:  apps/web/.next/standalone/apps/web/server.js
 *   - Docker image: apps/web/server.js (the standalone tree is copied to the app root)
 */
require('./load-env');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { webHost } = require('./web-host');

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

// Next's standalone output leaves out static assets: the JS/CSS chunks in .next/static and the
// files in public/. Without them a local `npm start` served pages whose scripts and styles all
// 404, i.e. a blank screen. The Docker image copies them in at build time; do the same here.
const localStandalone = path.join(root, 'apps/web/.next/standalone/apps/web');
if (server.startsWith(localStandalone + path.sep)) {
  const assets = [
    [path.join(root, 'apps/web/.next/static'), path.join(localStandalone, '.next/static')],
    [path.join(root, 'apps/web/public'), path.join(localStandalone, 'public')],
  ];
  for (const [from, to] of assets) {
    if (!fs.existsSync(from)) continue;
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

// The standalone server reads HOSTNAME. Always set it: many shells and containers export the
// machine's own name there, which is not an address we want to listen on.
const env = { ...process.env, HOSTNAME: webHost() };
const child = spawn(process.execPath, [server], { stdio: 'inherit', env });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
