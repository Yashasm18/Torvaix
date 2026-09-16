#!/usr/bin/env node
/** Run `next dev` for apps/web on WEB_HOST (default 127.0.0.1). */
require('./load-env');
const { spawn } = require('child_process');
const { webHost } = require('./web-host');

const next = require.resolve('next/dist/bin/next', { paths: [process.cwd()] });
const child = spawn(process.execPath, [next, 'dev', '-p', String(Number(process.env.PORT) || 3000), '-H', webHost()], { stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
