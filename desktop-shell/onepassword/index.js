// 1Password inside an Electron app: the real browser extension, unlocked by the 1Password desktop
// app exactly as in Chrome.
//
// Electron can load a Chrome extension but lacks parts of the API 1Password needs, most of all
// native messaging, which is how the extension talks to the desktop app. So: take the extension
// from an installed Chromium browser, copy it into this app's data folder with shim.js run ahead of
// its background script, and serve native messaging from here -- a localhost WebSocket per port,
// each one piped to the 1Password helper using Chrome's length-prefixed stdio protocol.
//
// One file for every TPC Electron app. Usage, after app.whenReady():
//   const onepassword = require('./onepassword')
//   await onepassword.enable(session.defaultSession)   // or the window's partition
//   onepassword.menuItem()                             // "1Password…" for the app menu
const { app, BrowserWindow, Menu, webContents } = require('electron')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const EXTENSION_ID = 'aeblfdkhhhdcdjpifhhbdiojplfjncoa'
const HOST_MANIFEST = 'com.1password.1password.json'
// Bump when prepare() changes what it writes, so existing copies are rebuilt.
const PREPARE_VERSION = '3'

// Every place a Chromium browser on this Mac might keep the extension, newest profile layouts first.
const SUPPORT = path.join(os.homedir(), 'Library', 'Application Support')
const BROWSER_DIRS = [
  'Google/Chrome', 'Google/Chrome Beta', 'BrowserOS', 'BraveSoftware/Brave-Browser', 'Arc/User Data',
  'Microsoft Edge', 'Vivaldi', 'Chromium',
].map((d) => path.join(SUPPORT, d))

const versionKey = (v) => v.replace(/_\d+$/, '').split('.').map((n) => n.padStart(6, '0')).join('.')

/** The newest copy of the 1Password extension any installed browser has, or null. */
function findExtension() {
  let best = null
  for (const dir of BROWSER_DIRS) {
    let profiles = []
    try { profiles = fs.readdirSync(dir) } catch { continue }
    for (const profile of profiles) {
      const root = path.join(dir, profile, 'Extensions', EXTENSION_ID)
      let versions = []
      try { versions = fs.readdirSync(root) } catch { continue }
      for (const v of versions) {
        if (!fs.existsSync(path.join(root, v, 'manifest.json'))) continue
        if (!best || versionKey(v) > versionKey(best.version)) best = { version: v, dir: path.join(root, v) }
      }
    }
  }
  return best
}

/** The helper binary Chrome would launch, read from any browser's native-messaging manifest. */
function findHost() {
  for (const dir of BROWSER_DIRS) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'NativeMessagingHosts', HOST_MANIFEST), 'utf8'))
      if (fs.existsSync(manifest.path)) return manifest.path
    } catch { /* next browser */ }
  }
  const fallback = '/Applications/1Password.app/Contents/Library/LoginItems/1Password Browser Helper.app/Contents/MacOS/1Password-BrowserSupport'
  return fs.existsSync(fallback) ? fallback : null
}

/** Copies the extension into userData (once per version) with the shim wired in ahead of it. */
function prepare(source) {
  const target = path.join(app.getPath('userData'), '1password-extension', source.version)
  const marker = path.join(target, '.prepared')
  const stamp = String(fs.statSync(path.join(__dirname, 'shim.js')).mtimeMs) + PREPARE_VERSION
  const rebuilt = !fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== stamp
  if (rebuilt) {
    fs.rmSync(target, { recursive: true, force: true })
    fs.cpSync(source.dir, target, { recursive: true })
    const manifestPath = path.join(target, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const original = manifest.background.service_worker
    fs.copyFileSync(path.join(__dirname, 'shim.js'), path.join(target, 'tpc-shim.js'))
    fs.writeFileSync(path.join(target, 'tpc-entry.js'), `import './tpc-shim.js'\nimport './${original}'\n`)
    manifest.background = { service_worker: 'tpc-entry.js', type: 'module' }
    // The installed manifest keeps its "key", which is what keeps the Web Store ID -- the only ID
    // the desktop app will talk to -- instead of one derived from this folder's path.
    // The bridge is a localhost WebSocket, which 1Password's own CSP would refuse to open.
    const csp = manifest.content_security_policy || {}
    if (csp.extension_pages) csp.extension_pages = csp.extension_pages.replace(/connect-src /, 'connect-src ws://127.0.0.1:* http://127.0.0.1:* ')
    manifest.content_security_policy = csp
    if (!manifest.key) throw new Error('1Password manifest has no key; the extension ID would not match')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    fs.writeFileSync(marker, stamp)
  }
  return { dir: target, rebuilt }
}

// ---- native messaging bridge ---------------------------------------------------------------------

/** Chrome's native messaging framing: 4-byte little-endian length, then UTF-8 JSON. */
function frame(text) {
  const body = Buffer.from(text, 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length)
  return Buffer.concat([head, body])
}

/** Minimal RFC 6455: text frames and close, which is everything shim.js sends. */
function wsSend(socket, text, opcode = 0x1) {
  const body = Buffer.from(text, 'utf8')
  let head
  if (body.length < 126) head = Buffer.from([0x80 | opcode, body.length])
  else if (body.length < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(body.length, 2) }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(body.length), 2) }
  socket.write(Buffer.concat([head, body]))
}

function wsReader(onText, onClose) {
  let buf = Buffer.alloc(0)
  let parts = []
  return (chunk) => {
    buf = Buffer.concat([buf, chunk])
    for (;;) {
      if (buf.length < 2) return
      const fin = buf[0] & 0x80
      const opcode = buf[0] & 0x0f
      let len = buf[1] & 0x7f
      let off = 2
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4 }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10 }
      const masked = buf[1] & 0x80
      const mask = masked ? buf.subarray(off, off + 4) : null
      if (masked) off += 4
      if (buf.length < off + len) return
      const payload = Buffer.from(buf.subarray(off, off + len))
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]
      buf = buf.subarray(off + len)
      if (opcode === 0x8) return onClose()
      if (opcode === 0x1 || opcode === 0x0) {
        parts.push(payload)
        if (fin) { onText(Buffer.concat(parts).toString('utf8')); parts = [] }
      }
    }
  }
}

function startBridge(hostPath, extensionId) {
  const key = crypto.randomBytes(24).toString('hex')
  // GET /<key>/frames/<tabId>: the tab's frames, for webNavigation.getFrame/getAllFrames, which
  // Electron stubs out. 1Password needs them to route a fill from its inline menu to the page.
  const server = http.createServer((req, res) => {
    const [, reqKey, what, tabId] = req.url.split('/')
    const wc = reqKey === key && what === 'frames' && webContents.fromId(Number(tabId))
    if (!wc || wc.isDestroyed()) { res.writeHead(404); res.end(); return }
    const id = (f) => (f === wc.mainFrame ? 0 : f.frameTreeNodeId)
    const frames = wc.mainFrame.framesInSubtree.map((f) => ({
      frameId: id(f), parentFrameId: f.parent ? id(f.parent) : -1, url: f.url, processId: f.processId, errorOccurred: false,
    }))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(frames))
  })

  server.on('upgrade', (req, socket) => {
    const [, reqKey, name] = req.url.split('/')
    // Only our extension may open a port: it alone can read bridge.json and so knows the key.
    if (reqKey !== key || decodeURIComponent(name || '') !== 'com.1password.1password') { socket.destroy(); return }
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)

    // Chrome passes the calling extension's origin as the first argument; the helper checks it.
    const host = spawn(hostPath, [`chrome-extension://${extensionId}/`], { stdio: ['pipe', 'pipe', 'ignore'] })
    let out = Buffer.alloc(0)
    host.stdout.on('data', (chunk) => {
      out = Buffer.concat([out, chunk])
      while (out.length >= 4) {
        const len = out.readUInt32LE(0)
        if (out.length < 4 + len) break
        wsSend(socket, out.subarray(4, 4 + len).toString('utf8'))
        out = out.subarray(4 + len)
      }
    })
    const close = () => { try { wsSend(socket, '', 0x8) } catch {} socket.end(); host.kill() }
    host.on('exit', close)
    host.on('error', close)
    socket.on('data', wsReader((text) => host.stdin.write(frame(text)), close))
    socket.on('close', () => host.kill())
    socket.on('error', () => host.kill())
  })

  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, key })))
}

// ---- public -------------------------------------------------------------------------------------

let loaded = null

/** Loads 1Password into `ses`. Resolves to the extension, or null when 1Password isn't installed. */
async function enable(ses) {
  const source = findExtension()
  const hostPath = findHost()
  if (!source || !hostPath) {
    console.warn('1Password: extension or desktop helper not found; skipping')
    return null
  }
  const { dir, rebuilt } = prepare(source)
  // A registered service worker keeps the headers -- and so the CSP -- it was first served with,
  // so a rebuilt copy has to drop the old registration or the bridge stays blocked.
  if (rebuilt) await ses.clearStorageData({ origin: `chrome-extension://${EXTENSION_ID}`, storages: ['serviceworkers', 'cachestorage'] })
  const bridge = await startBridge(hostPath, EXTENSION_ID)
  fs.writeFileSync(path.join(dir, 'bridge.json'), JSON.stringify(bridge))
  loaded = await ses.loadExtension(dir, { allowFileAccess: true })
  return loaded
}

let popup = null

/** Opens the extension's toolbar popup, which Electron has no toolbar to hang from. */
function showPopup() {
  if (!loaded) return
  if (popup && !popup.isDestroyed()) { popup.focus(); return }
  const parent = BrowserWindow.getFocusedWindow()
  popup = new BrowserWindow({
    width: 400, height: 600, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    title: '1Password', parent: parent || undefined,
    webPreferences: { session: parent ? parent.webContents.session : undefined },
  })
  popup.setMenuBarVisibility(false)
  popup.loadURL(`chrome-extension://${loaded.id}/popup/index.html`)
  popup.on('blur', () => { if (popup && !popup.isDestroyed() && !popup.webContents.isDevToolsOpened()) popup.close() })
}

/** A menu item for the app menu: ⇧⌘X, the same shortcut 1Password uses in Chrome. */
function menuItem() {
  return { label: '1Password…', accelerator: 'CmdOrCtrl+Shift+X', enabled: !!loaded, click: showPopup }
}

module.exports = { enable, showPopup, menuItem, EXTENSION_ID }
