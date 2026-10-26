// Preload for the Quick View window. Exposes a tiny bridge into the page's
// main world so the injected overlay can (a) hide its own window (Esc / ✕) and
// (b) obtain the bearer token — the session cookies are httpOnly, so page JS
// cannot read them; the main process reads the cookie and hands it over.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ffqvClose", () => ipcRenderer.send("ffqv-close"));
contextBridge.exposeInMainWorld("ffqvGetToken", () => ipcRenderer.invoke("ffqv-get-token"));
