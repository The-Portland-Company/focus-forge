"use client"

import { useEffect } from "react"

/**
 * Root error boundary. Its main job is deploy resilience: when a render throws
 * because a lazily-imported chunk is stale (old tab, new build), auto-reload to
 * pull the current bundle instead of stranding the user on a dead screen. For
 * any other error we show a minimal recoverable page with a manual reload.
 * (global-error replaces the root layout, so it must render <html>/<body>.)
 */
const RELOAD_GUARD_KEY = "chunk-reload-attempted-at"
const RELOAD_LOOP_WINDOW_MS = 15_000

function isChunkLoadError(message: string | undefined): boolean {
  if (!message) return false
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)
  )
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (!isChunkLoadError(error?.message)) return
    try {
      const last = Number(
        window.sessionStorage.getItem(RELOAD_GUARD_KEY) || "0",
      )
      const now = Date.now()
      if (last && now - last < RELOAD_LOOP_WINDOW_MS) return
      window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now))
    } catch {
      // sessionStorage unavailable — reload anyway rather than stay broken.
    }
    window.location.reload()
  }, [error])

  return (
    <html lang="en" className="dark theme-dark" data-theme="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#e5e5e5",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 14, color: "#a3a3a3", marginBottom: 20 }}>
            The app hit an unexpected error. Reloading usually fixes it.
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                window.location.reload()
              } catch {
                reset()
              }
            }}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid #3f3f46",
              background: "#18181b",
              color: "#fafafa",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
