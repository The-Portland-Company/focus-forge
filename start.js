#!/usr/bin/env node

const { spawn } = require('child_process');

// Railway deployment configuration
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log('=== Railway Next.js Server Startup ===');
console.log('Port:', PORT);
console.log('Host:', HOST);
console.log('Node Version:', process.version);
console.log('Environment:', process.env.NODE_ENV);
console.log('======================================');

// Start Next.js server with correct binding
const server = spawn('npx', ['next', 'start', '--hostname', HOST, '--port', PORT], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production'
  }
});

server.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});

// Handle termination signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  server.kill('SIGINT');
});