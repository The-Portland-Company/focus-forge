# iOS Build Guide

This guide explains how to build and run the iOS version of Command Center.

## Prerequisites

1. **macOS** - iOS development requires macOS
2. **Xcode** - Download from Mac App Store (13.0 or later)
3. **Node.js** - Already installed for web development
4. **iOS Developer Account** - Required for device testing ($99/year)

## Initial Setup

1. **Install Capacitor dependencies:**
   ```bash
   npm run mobile:init
   ```

2. **Configure environment:**
   - Copy `.env.mobile.example` to `.env.mobile`
   - Add your Supabase credentials

## Building for iOS

### Choose environment (recommended)
Use one of:
```bash
npm run mobile:dev
npm run mobile:staging
npm run mobile:prod
```

### Step 1: Prepare Mobile Build
```bash
cd mobile
npm run prepare
```
This will:
- Back up your current .env
- Copy .env.mobile to .env
- Set up mobile configuration

### Step 2: Build the App (if not already done)
```bash
cd ..
npm run ios:build
```
This will:
- Build Next.js with static export
- Copy files to mobile/dist
- Sync with Capacitor

### Step 3: Open in Xcode
```bash
npm run mobile:open
```
This opens the iOS project in Xcode.

### Step 4: Run on Simulator
In Xcode:
1. Select a simulator device
2. Click the "Run" button (▶️)

### Step 5: Restore Environment
After building:
```bash
cd mobile
npm run restore
```
This restores your original .env file.

## Common Issues

### "No Xcode project found"
Run `npm run mobile:sync` to generate iOS project files.

### Build fails in Xcode
1. Check that you've run `npm run ios:build`
2. Ensure all Capacitor plugins are installed
3. Clean build folder: Product → Clean Build Folder

### App crashes on launch
1. Check .env.mobile has correct values
2. Ensure Supabase is configured
3. Check Xcode console for errors

## Testing on Physical Device

1. Connect iPhone via USB
2. Trust the computer on your iPhone
3. In Xcode:
   - Select your device
   - Update signing team
   - Run the app

## App Store Deployment

1. Create app icons (see mobile/assets/icon/README.md)
2. Create splash screens (see mobile/assets/splash/README.md)
3. Update version in mobile/capacitor.config.ts
4. Archive in Xcode: Product → Archive
5. Upload to App Store Connect

## Development Workflow

For active development:
1. Make changes to Next.js app
2. Run `npm run mobile:dev` (or `mobile:staging`)
3. Test in simulator/device
4. Repeat as needed

## Switching Server Targets

Env vars:
- `CAPACITOR_SERVER=local|staging|production`
- `CAPACITOR_LOCAL_URL` (defaults to `http://localhost:3244`)
- `CAPACITOR_SERVER_URL` (overrides target)

Remember: The web app remains unaffected by mobile builds!
