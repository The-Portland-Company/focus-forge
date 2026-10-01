import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from web-app first, then fall back to repo root after the repo split.
dotenv.config({ path: path.join(__dirname, ".env.local"), override: false });
dotenv.config({ path: path.join(__dirname, ".env"), override: false });
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: false });

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only upload source maps when a token is present; absent in local/dev
  // builds and must never fail the build.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  disableLogger: true,
  // Skip the plugin entirely (no network calls, no upload attempt) when
  // there's nothing to authenticate with.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  widenClientFileUpload: true,
  reactComponentAnnotation: { enabled: true },
  tunnelRoute: false,
  automaticVercelMonitors: false,
});
