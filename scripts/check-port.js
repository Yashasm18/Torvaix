const net = require('net');

const checkPort = (port) => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ ERROR: Port ${port} is already in use.\n❌ Please stop the existing process and retry.\n`);
        process.exit(1);
      }
      reject(err);
    });
    server.once('listening', () => {
      server.close();
      resolve();
    });
    server.listen(port);
  });
};

// Only check the web server's port (3000).
// Port 3001 (agent server) starts in parallel and handles its own conflicts.
checkPort(3000)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
