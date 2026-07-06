"use client"

import { useEffect } from "react"

/**
 * Auto-recovers from stale-bundle errors after a deploy.
 *
 * When a new build ships, the JS chunk filenames change (content-hashed). A tab
 * that was open before the deploy still references the OLD chunk URLs; the next
 * lazy import() 404s and React surfaces the generic "Application error: a
 * client-side exception has occurred" with no recovery — the app looks down
 * until the user manually hard-refreshes.
 *
 * This listens for that specific failure (ChunkLoadError / "failed to fetch
 * dynamically imported module" / "Loading chunk … failed") on both the error
 * and unhandledrejection channels and reloads the page once to pull the current
 * bundle. A sessionStorage guard prevents a reload loop if the failure is NOT
 * actually a stale chunk (e.g. the asset is genuinely missing).
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

function reloadOnce() {
  try {
    const last = Number(
      window.sessionStorage.getItem(RELOAD_GUARD_KEY) || "0",
    )
    // Timestamps are unavailable in some sandboxes but always present in a real
    // browser; if the last attempt was within the loop window, stop reloading.
    const now = Date.now()
    if (last && now - last < RELOAD_LOOP_WINDOW_MS) return
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now))
  } catch {
    // sessionStorage blocked (private mode / SSR) — fall through and reload;
    // a single extra reload is preferable to a permanently broken tab.
  }
  window.location.reload()
}

export function ChunkErrorReloader() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (
        isChunkLoadError(event.message) ||
        isChunkLoadError((event.error as Error | undefined)?.message)
      ) {
        reloadOnce()
      }
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string; name?: string } | string
      const message =
        typeof reason === "string" ? reason : reason?.message || reason?.name
      if (isChunkLoadError(message)) {
        reloadOnce()
      }
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}
