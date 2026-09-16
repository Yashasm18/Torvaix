/**
 * Interface the web app listens on. Loopback by default: anyone who can open the UI can
 * approve shell commands, so it must not be reachable from the network unless asked for.
 */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function webHost() {
  const host = (process.env.WEB_HOST || '127.0.0.1').trim();
  if (!LOOPBACK.has(host)) {
    console.warn(
      `\n⚠️  WEB_HOST=${host}: the Torvaix web app is reachable from other devices, and anyone who can\n` +
        '   open it can run commands on this machine. Only do this behind a firewall or an\n' +
        '   authenticating reverse proxy.\n'
    );
  }
  return host;
}

module.exports = { webHost };
