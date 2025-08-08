const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// Railway provides the PORT environment variable
const PORT = process.env.PORT || 3244

console.log('=== Railway Deployment Debug ===')
console.log('Environment:', process.env.NODE_ENV)
console.log('Port:', PORT)
console.log('Railway Environment:', process.env.RAILWAY_ENVIRONMENT)
console.log('Node Version:', process.version)
console.log('Working Directory:', process.cwd())
console.log('Next.js build exists:', fs.existsSync('.next'))
console.log('Package.json exists:', fs.existsSync('package.json'))
console.log('================================')

// Start Next.js server
const server = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', PORT.toString()], {
  stdio: 'inherit',
  env: process.env
})

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`)
  process.exit(code)
})

server.on('error', (err) => {
  console.error('Server startup error:', err)
  process.exit(1)
})

// Handle process signals
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully')
  server.kill('SIGINT')
})

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully')
  server.kill('SIGTERM')
})