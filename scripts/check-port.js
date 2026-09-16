#!/usr/bin/env node
/**
 * Make sure the web app's or the agent's port is free before starting it.
 *
 *   node scripts/check-port.js web     # PORT (default 3000) on WEB_HOST
 *   node scripts/check-port.js agent   # AGENT_PORT (default 3001) on AGENT_HOST
 *
 * A leftover Torvaix server from this checkout (for example after a crash) is stopped
 * automatically. Anything else using the port is left alone: we report it and exit, rather
 * than killing another application.
 */
require('./load-env');
const net = require('net');
const path = require('path');
const { execFileSync } = require('child_process');
const { webHost } = require('./web-host');

const root = path.resolve(__dirname, '..');
const target = process.argv[2] === 'agent'
  ? { name: 'agent server', port: Number(process.env.AGENT_PORT) || 3001, host: process.env.AGENT_HOST || '127.0.0.1', env: 'AGENT_PORT' }
  : { name: 'web app', port: Number(process.env.PORT) || 3000, host: webHost({ quiet: true }), env: 'PORT' };

function isFree(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => (err.code === 'EADDRINUSE' ? resolve(false) : reject(err)));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Listening processes on the port, with their command line and working directory (macOS/Linux). */
function listeners(port) {
  if (process.platform === 'win32') return [];
  return run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .split('\n')
    .filter(Boolean)
    .map((pid) => ({
      pid: Number(pid),
      command: run('ps', ['-o', 'command=', '-p', pid]),
      cwd: run('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']).split('\n').find((l) => l.startsWith('n'))?.slice(1) ?? '',
    }));
}

const inThisCheckout = (p) => [p.cwd, p.command].some((s) => s === root || s.includes(root + path.sep));

async function main() {
  const { name, port, host, env } = target;
  if (await isFree(port, host)) return;

  const procs = listeners(port);
  const ours = procs.filter(inThisCheckout);
  if (procs.length > 0 && ours.length === procs.length) {
    console.log(`\n⚠️  Port ${port} is held by an earlier Torvaix ${name} (pid ${ours.map((p) => p.pid).join(', ')}). Stopping it...`);
    for (const p of ours) {
      try { process.kill(p.pid, 'SIGTERM'); } catch {}
    }
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await isFree(port, host)) {
        console.log(`✅ Port ${port} is free.`);
        return;
      }
    }
  }

  const who = procs.length
    ? procs.map((p) => `  - pid ${p.pid}: ${p.command || 'unknown command'}`).join('\n')
    : '  (could not identify the process)';
  console.error(
    `\n❌ Port ${port} is already in use, so the Torvaix ${name} can't start.\n${who}\n` +
      `   Stop that program, or run Torvaix on another port by setting ${env} (in .env or your shell).\n`
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
