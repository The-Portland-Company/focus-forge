// Runs in the 1Password extension's service worker before its own code (see index.js). Electron
// implements only part of the Chrome extension API, and 1Password's background script dies on the
// first namespace it finds missing. This fills the gaps with inert stand-ins, and replaces
// runtime.connectNative -- which Electron lacks -- with a WebSocket to the app's main process,
// which runs the 1Password desktop helper the way Chrome would.
const ev = () => ({ addListener() {}, removeListener() {}, hasListener() { return false } })
const noop = (...a) => { const cb = a.find((x) => typeof x === 'function'); if (cb) cb(); return Promise.resolve(undefined) }
const auto = () => new Proxy({}, { get: (t, k) => {
  if (k in t || typeof k !== 'string' || k === 'then') return t[k]
  if (/^on[A-Z]/.test(k)) return (t[k] = ev())
  if (/^[A-Z_]+$/.test(k)) return -1
  return (t[k] = noop)
} })

const real = globalThis.chrome
const win = { id: 1, focused: true, type: 'normal', state: 'normal' }
const extra = {
  windows: Object.assign(auto(), {
    WINDOW_ID_NONE: -1, WINDOW_ID_CURRENT: -2,
    getAll: (q, cb) => { cb = typeof q === 'function' ? q : cb; cb && cb([win]); return Promise.resolve([win]) },
    getCurrent: (q, cb) => { cb = typeof q === 'function' ? q : cb; cb && cb(win); return Promise.resolve(win) },
    getLastFocused: (q, cb) => { cb = typeof q === 'function' ? q : cb; cb && cb(win); return Promise.resolve(win) },
    get: (id, q, cb) => { cb = typeof q === 'function' ? q : cb; cb && cb(win); return Promise.resolve(win) },
  }),
  permissions: Object.assign(auto(), {
    contains: (p, cb) => { cb && cb(true); return Promise.resolve(true) },
    getAll: (cb) => { const all = { permissions: real.runtime.getManifest().permissions || [], origins: ['<all_urls>'] }; cb && cb(all); return Promise.resolve(all) },
    request: (p, cb) => { cb && cb(true); return Promise.resolve(true) },
  }),
  privacy: { services: Object.fromEntries(['passwordSavingEnabled', 'autofillAddressEnabled', 'autofillCreditCardEnabled', 'autofillEnabled'].map((k) => [k, {
    get: (d, cb) => { cb && cb({ value: false, levelOfControl: 'controllable_by_this_extension' }); return Promise.resolve({ value: false }) },
    set: noop, clear: noop, onChange: ev(),
  }])) },
}

// ---- native messaging over the bridge ------------------------------------------------------------
let bridge = null
const bridgeConfig = () => (bridge ??= fetch(real.runtime.getURL('bridge.json')).then((r) => r.json()))

function connectNative(name) {
  const onMessage = new Set()
  const onDisconnect = new Set()
  const queue = []
  let ws = null
  let closed = false
  const port = {
    name,
    sender: undefined,
    onMessage: { addListener: (f) => onMessage.add(f), removeListener: (f) => onMessage.delete(f), hasListener: (f) => onMessage.has(f) },
    onDisconnect: { addListener: (f) => onDisconnect.add(f), removeListener: (f) => onDisconnect.delete(f), hasListener: (f) => onDisconnect.has(f) },
    postMessage(msg) {
      if (closed) throw new Error('Attempting to use a disconnected port object')
      const text = JSON.stringify(msg)
      if (ws && ws.readyState === 1) ws.send(text); else queue.push(text)
    },
    disconnect() { closed = true; if (ws) ws.close() },
  }
  const end = (error) => {
    if (closed && !error) return
    closed = true
    try { real.runtime.lastError = error ? { message: error } : undefined } catch { /* read-only here */ }
    for (const f of onDisconnect) try { f(port) } catch (e) { console.error(e) }
  }
  bridgeConfig().then(({ port: p, key }) => {
    if (closed) return
    ws = new WebSocket(`ws://127.0.0.1:${p}/${key}/${encodeURIComponent(name)}`)
    ws.onopen = () => { for (const t of queue.splice(0)) ws.send(t) }
    ws.onmessage = (e) => { const m = JSON.parse(e.data); for (const f of onMessage) try { f(m, port) } catch (err) { console.error(err) } }
    ws.onclose = (e) => end(e.reason || 'Native host has exited.')
  }, () => end('Specified native messaging host not found.'))
  return port
}

function sendNativeMessage(name, msg, cb) {
  return new Promise((resolve, reject) => {
    const p = connectNative(name)
    p.onMessage.addListener((m) => { p.disconnect(); cb && cb(m); resolve(m) })
    p.onDisconnect.addListener(() => { const e = real.runtime.lastError; cb && cb(); reject(new Error(e ? e.message : 'disconnected')) })
    p.postMessage(msg)
  })
}

// ---- webNavigation frames from the main process ---------------------------------------------------
const cbOrPromise = (v, cb) => v.then((r) => { cb && cb(r); return r })
const allFrames = (tabId) => bridgeConfig()
  .then(({ port, key }) => fetch(`http://127.0.0.1:${port}/${key}/frames/${tabId}`))
  .then((r) => (r.ok ? r.json() : null), () => null)
const webNavigation = {
  getAllFrames: ({ tabId }, cb) => cbOrPromise(allFrames(tabId), cb),
  getFrame: ({ tabId, frameId }, cb) => cbOrPromise(allFrames(tabId).then((fs) => (fs && fs.find((f) => f.frameId === frameId)) || null), cb),
}

// ---- the patched chrome --------------------------------------------------------------------------
const wrap = (name, ns, depth) => new Proxy(ns, { get: (t, k) => {
  if (name === 'runtime' && k === 'connectNative') return connectNative
  if (name === 'runtime' && k === 'sendNativeMessage') return sendNativeMessage
  if (name === 'webNavigation' && k in webNavigation) return webNavigation[k]
  const v = Reflect.get(t, k)
  if (typeof k !== 'string') return v
  if (v === undefined && /^on[A-Z]/.test(k)) return ev()
  if (typeof v === 'function') return v.bind(t)
  if (v && typeof v === 'object' && !/^on[A-Z]/.test(k) && depth < 2) return wrap(`${name}.${k}`, v, depth + 1)
  return v
} })
const cache = {}
const patched = new Proxy(real, { get: (t, k) => {
  if (typeof k !== 'string') return Reflect.get(t, k)
  if (k in cache) return cache[k]
  let v = Reflect.get(t, k)
  if (extra[k] && !v) v = extra[k]
  if (v === undefined && /^[a-z][A-Za-z]+$/.test(k)) v = auto()
  return (cache[k] = v && typeof v === 'object' ? wrap(k, v, 0) : v)
} })
Object.defineProperty(globalThis, 'chrome', { configurable: true, writable: true, value: patched })
// 1Password's bundled webextension-polyfill adopts globalThis.browser when it looks real, which
// keeps it from wrapping the unpatched chrome it captured.
globalThis.browser = patched
