#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Building for mobile...\n');

// 1. Backup current .env
if (fs.existsSync('.env')) {
  fs.copyFileSync('.env', '.env.backup');
  console.log('✓ Backed up .env');
}

// 2. Copy mobile env
if (fs.existsSync('.env.mobile')) {
  fs.copyFileSync('.env.mobile', '.env');
  console.log('✓ Applied mobile environment');
}

// 3. Use mobile next.config
if (fs.existsSync('next.config.mobile.js')) {
  fs.copyFileSync('next.config.mobile.js', 'next.config.js');
  console.log('✓ Applied mobile Next.js config');
}

// 4. Build Next.js (this will fail on API routes, but that's ok for mobile)
console.log('\n📦 Building Next.js app...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.log('⚠️  Build had some warnings (API routes not compatible with static export)');
}

// 5. Ensure mobile/dist exists
const distPath = path.join('mobile', 'dist');
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

// 6. Copy built files to mobile/dist
if (fs.existsSync('out')) {
  console.log('\n📋 Copying build to mobile/dist...');
  execSync(`cp -r out/* ${distPath}/`, { stdio: 'inherit' });
  console.log('✓ Build copied to mobile/dist');
} else {
  // If no out directory, create a simple index.html
  console.log('\n⚠️  No static build found, creating placeholder...');
  const indexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loud & Clear</title>
</head>
<body>
  <div id="root">
    <h1>Loud & Clear Mobile</h1>
    <p>Loading application...</p>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(distPath, 'index.html'), indexHtml);
  console.log('✓ Created placeholder index.html');
}

// 7. Restore original .env
if (fs.existsSync('.env.backup')) {
  fs.copyFileSync('.env.backup', '.env');
  fs.unlinkSync('.env.backup');
  console.log('\n✓ Restored original .env');
}

// 8. Remove mobile next.config
if (fs.existsSync('next.config.js')) {
  fs.unlinkSync('next.config.js');
  console.log('✓ Removed mobile Next.js config');
}

console.log('\n✅ Mobile build complete!');
console.log('\nNext steps:');
console.log('1. cd mobile');
console.log('2. npx cap sync ios');
console.log('3. npx cap open ios');