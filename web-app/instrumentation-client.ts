import * as Sentry from "@sentry/nextjs"
import { resolveSentryRelease } from "@/lib/sentry/release"

// No-op when the public DSN isn't configured (e.g. local dev) — never errors,
// never spams the console, never sends events.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: resolveSentryRelease(),
    tracesSampleRate: 0.1,
    // sendDefaultPii defaults to false in this SDK version (no type for it in
    // v11's options); leaving it unset keeps that default, which matches the
    // no-PII requirement.
    // No session replay per deploy requirements.
    integrations: [],
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
