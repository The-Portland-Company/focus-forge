#!/usr/bin/env node

const http = require('node:http');
const next = require('next');
const { startEmailLiveSyncWorker } = require('./email-live-sync-worker.js');

const PORT = Number(process.env.PORT || 3244);
const HOST = '0.0.0.0';

console.log('=== Railway Next.js Server Startup ===');
console.log('Port:', PORT);
console.log('Host:', HOST);
console.log('Node Version:', process.version);
console.log('Environment:', process.env.NODE_ENV);
console.log('======================================');

let stopEmailWorker = null;
let server = null;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully`);

  if (stopEmailWorker) {
    await stopEmailWorker().catch((error) => {
      console.error('Failed to stop email live sync worker:', error);
    });
  }

  if (!server) {
    process.exit(0);
    return;
  }

  server.close((error) => {
    if (error) {
      console.error('Failed to close HTTP server:', error);
      process.exit(1);
      return;
    }

    process.exit(0);
  });
}

async function main() {
  const app = next({
    dev: false,
    hostname: HOST,
    port: PORT,
  });
  const handle = app.getRequestHandler();

  await app.prepare();
  stopEmailWorker = await startEmailLiveSyncWorker({
    exitOnShutdown: false,
    registerSignalHandlers: false,
  });

  server = http.createServer((request, response) => {
    void handle(request, response).catch((error) => {
      console.error('Unhandled Next.js request error:', error);
      response.statusCode = 500;
      response.end('Internal Server Error');
    });
  });

  server.on('error', (error) => {
    console.error('HTTP server error:', error);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
