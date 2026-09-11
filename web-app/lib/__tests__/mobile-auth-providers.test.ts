import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_AUTH_PROVIDERS,
  MOBILE_OAUTH_REDIRECT,
  buildProviderAuthorizeUrl,
  findMobileAuthProvider,
  getMobileAuthProviderStatuses,
  isAllowedMobileRedirect,
  resetMobileAuthProviderCache,
} from "../mobile/auth-providers";

const SUPABASE_URL = "https://project.supabase.co";

const withSupabaseEnv = async (run: () => Promise<void> | void) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  try {
    await run();
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
};

const stubFetch = async (
  external: Record<string, boolean> | Error,
  run: () => Promise<void>,
) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    if (external instanceof Error) throw external;
    return {
      ok: true,
      status: 200,
      json: async () => ({ external }),
    } as Response;
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test("provider ids are unique and Apple leads the list", () => {
  const ids = MOBILE_AUTH_PROVIDERS.map((provider) => provider.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(MOBILE_AUTH_PROVIDERS[0].id, "apple");
  assert.equal(MOBILE_AUTH_PROVIDERS[0].kind, "native");
});

test("findMobileAuthProvider is case-insensitive and rejects unknown ids", () => {
  assert.equal(findMobileAuthProvider("GitHub")?.id, "github");
  assert.equal(findMobileAuthProvider(" azure ")?.name, "Microsoft");
  assert.equal(findMobileAuthProvider("myspace"), null);
  assert.equal(findMobileAuthProvider(null), null);
});

test("only the app's own scheme is an allowed redirect target", () => {
  assert.equal(isAllowedMobileRedirect(MOBILE_OAUTH_REDIRECT), true);
  assert.equal(isAllowedMobileRedirect("focusforge://password-reset"), true);
  // An open redirect here would hand a real session to any site that asks.
  assert.equal(isAllowedMobileRedirect("https://evil.example/callback"), false);
  assert.equal(isAllowedMobileRedirect("javascript:alert(1)"), false);
  assert.equal(isAllowedMobileRedirect("not a url"), false);
});

test("authorize URL carries provider, redirect, and configured scopes", async () => {
  await withSupabaseEnv(() => {
    const github = findMobileAuthProvider("github")!;
    const url = new URL(buildProviderAuthorizeUrl(github, MOBILE_OAUTH_REDIRECT));

    assert.equal(url.origin + url.pathname, `${SUPABASE_URL}/auth/v1/authorize`);
    assert.equal(url.searchParams.get("provider"), "github");
    assert.equal(url.searchParams.get("redirect_to"), MOBILE_OAUTH_REDIRECT);
    assert.equal(url.searchParams.get("scopes"), "read:user user:email");

    const google = findMobileAuthProvider("google")!;
    const googleUrl = new URL(buildProviderAuthorizeUrl(google, MOBILE_OAUTH_REDIRECT));
    assert.equal(googleUrl.searchParams.get("scopes"), null);
  });
});

test("provider status follows GoTrue settings, including alias keys", async () => {
  await withSupabaseEnv(async () => {
    resetMobileAuthProviderCache();
    await stubFetch({ apple: true, google: true, github: false, slack: true }, async () => {
      const { providers, degraded } = await getMobileAuthProviderStatuses();
      const enabled = providers.filter((p) => p.enabled).map((p) => p.id);

      assert.equal(degraded, false);
      assert.deepEqual(enabled, ["apple", "google", "slack_oidc"]);
    });
    resetMobileAuthProviderCache();
  });
});

test("a settings failure degrades to no providers rather than dead buttons", async () => {
  await withSupabaseEnv(async () => {
    resetMobileAuthProviderCache();
    await stubFetch(new Error("network down"), async () => {
      const { providers, degraded } = await getMobileAuthProviderStatuses();
      assert.equal(degraded, true);
      assert.equal(providers.every((provider) => !provider.enabled), true);
    });
    resetMobileAuthProviderCache();
  });
});
