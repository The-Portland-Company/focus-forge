import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCanonicalRedirectUrl } from "@/lib/auth/canonical-host";

const OLD = "focusforge.theportlandcompany.com";

describe("getCanonicalRedirectUrl", () => {
  it("redirects old-host page loads to focusforge.dev, keeping path and query", () => {
    assert.equal(
      getCanonicalRedirectUrl(`https://${OLD}/today?x=1`, OLD)?.toString(),
      "https://focusforge.dev/today?x=1",
    );
  });

  it("keeps /api, /auth/callback and /.well-known serving on the old host", () => {
    for (const path of ["/api/mobile/tasks", "/api", "/auth/callback?code=1", "/.well-known/oauth-protected-resource/mcp"]) {
      assert.equal(getCanonicalRedirectUrl(`https://${OLD}${path}`, OLD), null, path);
    }
  });

  it("never redirects non-GET requests on the old host", () => {
    assert.equal(getCanonicalRedirectUrl(`https://${OLD}/today`, OLD, "POST"), null);
  });

  it("redirects www and older aliases entirely", () => {
    assert.equal(
      getCanonicalRedirectUrl("https://www.focusforge.dev/api/x", "www.focusforge.dev", "POST")?.toString(),
      "https://focusforge.dev/api/x",
    );
    assert.equal(
      getCanonicalRedirectUrl("http://0.0.0.0:8080/", "focus-forge.theportlandcompany.com")?.toString(),
      "https://focusforge.dev/",
    );
  });

  it("leaves the canonical host and unknown hosts alone", () => {
    assert.equal(getCanonicalRedirectUrl("https://focusforge.dev/today", "focusforge.dev"), null);
    assert.equal(getCanonicalRedirectUrl("http://localhost:3244/", "localhost:3244"), null);
    assert.equal(getCanonicalRedirectUrl("https://x.up.railway.app/", "x.up.railway.app"), null);
  });
});

describe("login on the old host", () => {
  it("moves /auth/login to focusforge.dev so the PKCE cookie and callback share a host", () => {
    assert.equal(
      getCanonicalRedirectUrl(`https://${OLD}/auth/login?next=/today`, OLD)?.toString(),
      "https://focusforge.dev/auth/login?next=/today",
    );
  });
});
