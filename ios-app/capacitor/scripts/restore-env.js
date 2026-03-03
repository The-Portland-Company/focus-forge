#!/usr/bin/env node

/**
 * Restore Environment Script
 * Restores the original .env file after mobile build
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const envPath = path.join(rootDir, '.env');
const backupPath = path.join(rootDir, '.env.backup');

if (fs.existsSync(backupPath)) {
  fs.copyFileSync(backupPath, envPath);
  fs.unlinkSync(backupPath);
  console.log('✓ Restored original .env file');
} else {
  console.log('ℹ No .env.backup found, keeping current .env');
}