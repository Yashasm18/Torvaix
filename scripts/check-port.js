const net = require('net');

const port = 3000;
const server = net.createServer();

server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${port} is already in use.\n❌ Please stop the existing process and retry.\n`);
    process.exit(1);
  }
});

server.once('listening', () => {
  server.close();
  process.exit(0);
});

server.listen(port);
