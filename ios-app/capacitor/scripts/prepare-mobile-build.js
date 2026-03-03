#!/usr/bin/env node

/**
 * Prepare Mobile Build Script
 * This script prepares the environment for mobile builds
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function copyEnvFile() {
  const rootDir = path.join(__dirname, '..', '..');
  const envMobilePath = path.join(rootDir, '.env.mobile');
  const envPath = path.join(rootDir, '.env');
  
  // Backup existing .env if it exists
  if (fs.existsSync(envPath)) {
    const backupPath = path.join(rootDir, '.env.backup');
    fs.copyFileSync(envPath, backupPath);
    log('✓ Backed up existing .env to .env.backup', 'green');
  }
  
  // Copy .env.mobile to .env
  if (fs.existsSync(envMobilePath)) {
    fs.copyFileSync(envMobilePath, envPath);
    log('✓ Copied .env.mobile to .env for mobile build', 'green');
  } else {
    log('⚠ Warning: .env.mobile not found, using existing .env', 'yellow');
  }
}

function updateNextConfig() {
  const rootDir = path.join(__dirname, '..', '..');
  const configPath = path.join(rootDir, 'next.config.js');
  
  // Create mobile-optimized next.config.js if needed
  const mobileConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath: '',
  assetPrefix: '',
}

module.exports = nextConfig
`;
  
  // Check if next.config.js exists
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, mobileConfig);
    log('✓ Created next.config.js for mobile export', 'green');
  } else {
    log('ℹ Using existing next.config.js', 'blue');
    log('  Make sure it has output: "export" for mobile builds', 'yellow');
  }
}

function checkCapacitorInstalled() {
  const nodeModulesPath = path.join(__dirname, '..', '..', 'node_modules');
  const capacitorCore = path.join(nodeModulesPath, '@capacitor', 'core');
  
  if (!fs.existsSync(capacitorCore)) {
    log('⚠ Capacitor not installed!', 'red');
    log('  Run: npm run mobile:init', 'yellow');
    return false;
  }
  
  log('✓ Capacitor dependencies found', 'green');
  return true;
}

function createDistDirectory() {
  const distPath = path.join(__dirname, '..', 'dist');
  
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
    log('✓ Created mobile/dist directory', 'green');
  }
}

function main() {
  log('\n🚀 Preparing Mobile Build Environment\n', 'bright');
  
  // Step 1: Check Capacitor installation
  if (!checkCapacitorInstalled()) {
    process.exit(1);
  }
  
  // Step 2: Copy environment file
  copyEnvFile();
  
  // Step 3: Update Next.js config
  updateNextConfig();
  
  // Step 4: Create dist directory
  createDistDirectory();
  
  log('\n✅ Mobile build environment ready!\n', 'green');
  log('Next steps:', 'bright');
  log('1. Run: npm run mobile:build', 'blue');
  log('2. Run: npm run mobile:sync', 'blue');
  log('3. Run: npm run mobile:open', 'blue');
}

// Run the script
main();