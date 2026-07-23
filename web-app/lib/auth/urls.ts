export function getAppBaseUrl(options?: {
  requestUrl?: string | null;
  // Only a couple keys are read; accept a partial env so callers/tests can
  // pass a minimal object without the full ProcessEnv (e.g. NODE_ENV).
  env?: Partial<NodeJS.ProcessEnv>;
}) {
  const env = options?.env ?? process.env;
  const configuredUrl =
    env.NEXT_PUBLIC_APP_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (options?.requestUrl) {
    try {
      return new URL(options.requestUrl).origin;
    } catch {
      // Ignore invalid request URLs and fall through to the local default.
    }
  }

  return "http://localhost:3244";
}

export function getResetPasswordUrl(options?: {
  requestUrl?: string | null;
  // Only a couple keys are read; accept a partial env so callers/tests can
  // pass a minimal object without the full ProcessEnv (e.g. NODE_ENV).
  env?: Partial<NodeJS.ProcessEnv>;
}) {
  return `${getAppBaseUrl(options)}/auth/reset-password`;
}
