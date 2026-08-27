const net = require('net');
const killPort = require('kill-port');

const checkAndKillPort = (port) => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`\n⚠️  Port ${port} is occupied. Attempting to free it automatically...`);
        killPort(port)
          .then(() => {
            console.log(`✅ Successfully freed port ${port}.`);
            resolve();
          })
          .catch((killErr) => {
            console.error(`\n❌ ERROR: Failed to free port ${port}. Please kill it manually.\n`, killErr);
            reject(killErr);
          });
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve();
    });
    server.listen(port);
  });
};

const ports = process.argv.slice(2).map(Number).filter(Boolean);
const targetPorts = ports.length > 0 ? ports : [3000];

Promise.all(targetPorts.map(checkAndKillPort))
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
