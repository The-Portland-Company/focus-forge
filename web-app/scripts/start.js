#!/usr/bin/env node

const { spawn } = require('child_process')

// Get the port from environment, default to 3244 for local development
const port = process.env.PORT || '3244'

console.log(`Starting Next.js server on 0.0.0.0:${port}`)
console.log(`Environment variables:`)
console.log(`- NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`- PORT: ${process.env.PORT}`)
console.log(`- RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT}`)

// Start Next.js with the correct port and bind to all interfaces
const nextProcess = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', port], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port }
})

nextProcess.on('close', (code) => {
  console.log(`Next.js process exited with code ${code}`)
  process.exit(code)
})

nextProcess.on('error', (error) => {
  console.error('Failed to start Next.js:', error)
  process.exit(1)
})