import * as Sentry from "@sentry/nextjs"
import { resolveSentryRelease } from "@/lib/sentry/release"

// No-op (SDK stays uninitialized) when the DSN isn't configured, so local dev
// without Sentry env vars never errors or spams.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: resolveSentryRelease(),
    tracesSampleRate: 0.1,
    // sendDefaultPii defaults to false in this SDK version (no type for it in
    // v11's options); leaving it unset keeps that default, which matches the
    // no-PII requirement.
  })
}
