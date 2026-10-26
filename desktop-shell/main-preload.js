// Preload for the main window. Exposes a minimal, safe bridge the web app can
// feature-detect (`window.focusForgeLocalAI`) to route the assistant to LOCAL
// agent sessions (Claude Code / Codex / Grok) running on this Mac — the only
// place those CLIs are reachable. Nothing Node-level is exposed to the page;
// only these three IPC-backed methods.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusForgeLocalAI", {
  // True when running inside the desktop shell (so the web app knows the Local
  // category is actually usable, not just selectable).
  present: true,

  // Which local providers are installed on this machine.
  listProviders: () => ipcRenderer.invoke("ffla-list-providers"),

  // Run one assistant turn against the local provider chain.
  //   messages: [{ role: "user"|"assistant", content }]
  //   chain:    optional ordered provider ids (e.g. ["local-claude","local-codex"])
  //   context:  { view, projectName, timezone }
  // Resolves to { ok, assistantMessage, provider, providerLabel } or { ok:false, error }.
  chat: (payload) => ipcRenderer.invoke("ffla-chat", payload),

  // Subscribe to progress events (provider-start / provider-fail / stdout) for
  // the turn currently running. Returns an unsubscribe function.
  onProgress: (cb) => {
    const handler = (_e, evt) => {
      try {
        cb(evt);
      } catch {
        /* ignore listener errors */
      }
    };
    ipcRenderer.on("ffla-progress", handler);
    return () => ipcRenderer.removeListener("ffla-progress", handler);
  },
});
