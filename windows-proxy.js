/**
 * Reliable TCP proxy for Docker Desktop (WSL2) on Windows.
 * Run: node windows-proxy.js
 * This forwards ports from all network interfaces (WiFi) to localhost (Docker).
 * Much more reliable than 'netsh interface portproxy' for WSL2.
 */

const net = require('net');

const PROXIES = [
  { localPort: 3000, remoteHost: '127.0.0.1', remotePort: 3000, name: 'CMS' },
  { localPort: 3001, remoteHost: '127.0.0.1', remotePort: 3001, name: 'Backend API' },
  { localPort: 3002, remoteHost: '127.0.0.1', remotePort: 3002, name: 'TV Player' },
  { localPort: 9000, remoteHost: '127.0.0.1', remotePort: 9000, name: 'MinIO S3' },
];

function createProxy({ localPort, remoteHost, remotePort, name }) {
  const server = net.createServer((clientSocket) => {
    const serverSocket = net.createConnection({ host: remoteHost, port: remotePort });

    let clientClosed = false;
    let serverClosed = false;

    function closeBoth() {
      if (!clientClosed) { clientClosed = true; clientSocket.end(); }
      if (!serverClosed) { serverClosed = true; serverSocket.end(); }
    }

    clientSocket.pipe(serverSocket);
    serverSocket.pipe(clientSocket);

    clientSocket.on('error', (err) => {
      console.log(`[${name}] Client error: ${err.message}`);
      closeBoth();
    });
    serverSocket.on('error', (err) => {
      console.log(`[${name}] Backend error: ${err.message}`);
      closeBoth();
    });
    clientSocket.on('close', () => { if (!serverClosed) { serverClosed = true; serverSocket.end(); } });
    serverSocket.on('close', () => { if (!clientClosed) { clientClosed = true; clientSocket.end(); } });
  });

  server.listen(localPort, '0.0.0.0', () => {
    console.log(`[${name}] Proxy active: 0.0.0.0:${localPort} -> ${remoteHost}:${remotePort}`);
  });

  server.on('error', (err) => {
    console.error(`[${name}] Failed to bind port ${localPort}: ${err.message}`);
  });
}

console.log('=== Docker Desktop WSL2 LAN Proxy ===');
console.log('Make sure docker-compose is running first!');
console.log('Press Ctrl+C to stop.\n');

// Add firewall rules (run once, harmless if already exist)
const { execSync } = require('child_process');
try {
  execSync('netsh advfirewall firewall show rule name="DigitalSignage-Proxy-3000"', { stdio: 'ignore' });
} catch {
  console.log('Adding firewall rules (one-time)...');
  for (const p of PROXIES) {
    try {
      execSync(`netsh advfirewall firewall add rule name="DigitalSignage-Proxy-${p.localPort}" dir=in action=allow protocol=tcp localport=${p.localPort}`, { stdio: 'ignore' });
    } catch {}
  }
  console.log('Firewall rules added.\n');
}

for (const proxy of PROXIES) {
  createProxy(proxy);
}
