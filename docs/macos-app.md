# macOS Electron App Status

## What has been done

- Allowlisted the production `server.url` for Electron navigation and CSP.
- Added builder metadata for macOS packaging (`appId`, `productName`, `category`, `icon`).
- Left existing Electron/Capacitor build flow intact.

Files touched:
- `mobile/electron/src/setup.ts`
- `mobile/electron/src/index.ts`
- `mobile/electron/electron-builder.config.json`

## What is left to do

1) Generate a proper macOS `.icns` icon and point `mac.icon` to it.
2) Decide on auto‑update strategy:
   - Configure GitHub releases for updates, or
   - Disable `autoUpdater` to avoid update errors.
3) Add code signing + notarization for macOS release builds.
4) Build and verify the DMG on a clean machine.

## Step‑by‑step guide

### A) Build a DMG (no signing/notarization)

1. Install dependencies (repo root):
   ```bash
   npm install
   ```
2. Build + package Electron:
   ```bash
   npm run electron:make
   ```
3. Find the DMG output:
   - `mobile/electron/dist`
4. Open the DMG and verify it loads the hosted production app.

### B) Generate a macOS `.icns` icon

1. Ensure you have a 1024x1024 PNG at:
   - `mobile/electron/assets/appIcon.png`
2. Create iconset + icns:
   ```bash
   mkdir -p /tmp/cc.iconset
   sips -z 16 16     mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_16x16.png
   sips -z 32 32     mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_16x16@2x.png
   sips -z 32 32     mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_32x32.png
   sips -z 64 64     mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_32x32@2x.png
   sips -z 128 128   mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_128x128.png
   sips -z 256 256   mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_128x128@2x.png
   sips -z 256 256   mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_256x256.png
   sips -z 512 512   mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_256x256@2x.png
   sips -z 512 512   mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_512x512.png
   sips -z 1024 1024 mobile/electron/assets/appIcon.png --out /tmp/cc.iconset/icon_512x512@2x.png
   iconutil -c icns /tmp/cc.iconset -o mobile/electron/assets/appIcon.icns
   ```
3. Update `mobile/electron/electron-builder.config.json`:
   - Set `mac.icon` to `assets/appIcon.icns`.

### C) Disable auto‑updates (optional)

If you don’t want GitHub‑based updates yet:

1. Edit `mobile/electron/src/index.ts`:
   - Remove or comment out `autoUpdater.checkForUpdatesAndNotify();`
2. Rebuild:
   ```bash
   npm run electron:make
   ```

### D) Configure GitHub auto‑updates (optional)

1. In `mobile/electron/electron-builder.config.json`, ensure:
   - `publish.provider` is `github`.
2. Create a GitHub release for each new version.
3. Set `GH_TOKEN` in your environment for publishing.
4. Rebuild and publish.

### E) Code signing + notarization (required for distribution)

1. Create an Apple Developer ID Application certificate.
2. Export it to the macOS keychain.
3. Set these env vars before building:
   ```bash
   export CSC_LINK=/path/to/cert.p12
   export CSC_KEY_PASSWORD=your_password
   export APPLE_ID=your_apple_id
   export APPLE_APP_SPECIFIC_PASSWORD=your_app_specific_password
   export APPLE_TEAM_ID=your_team_id
   ```
4. Add notarization config to `mobile/electron/electron-builder.config.json`:
   - `mac.hardenedRuntime: true`
   - `mac.entitlements` and `mac.entitlementsInherit`
   - `afterSign` hook to run notarization
5. Build:
   ```bash
   npm run electron:make
   ```

### F) Verify on a clean machine

1. Copy the DMG to another Mac.
2. Install and open:
   - If unsigned, macOS will block it (expected).
   - If signed + notarized, it should open without warnings.
3. Confirm it loads the hosted app and persists login.

