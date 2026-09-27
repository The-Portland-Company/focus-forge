import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAuthenticationResultsHeader,
  resolveAuthResultsVerdict,
  splitAuthenticationResultsHeaders,
} from "@/lib/email-inbox/auth-results";

test("DMARC-aligned pass is authenticated", () => {
  const header =
    "mx.google.com; dkim=pass header.i=@example.com header.s=selector1 header.b=abc123; " +
    "spf=pass smtp.mailfrom=example.com; " +
    "dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=example.com";

  const verdict = parseAuthenticationResultsHeader(header);

  assert.equal(verdict.status, "authenticated");
  assert.equal(verdict.spf?.result, "pass");
  assert.equal(verdict.spf?.domain, "example.com");
  assert.equal(verdict.dkim?.result, "pass");
  assert.equal(verdict.dmarc?.result, "pass");
  assert.equal(verdict.dmarc?.aligned, true);
  assert.equal(verdict.authServId, "mx.google.com");
});

test("DKIM fail with SPF pass does not authenticate", () => {
  const header =
    "mx.google.com; dkim=fail header.i=@example.com header.s=selector1; " +
    "spf=pass smtp.mailfrom=example.com; " +
    "dmarc=fail header.from=example.com";

  const verdict = parseAuthenticationResultsHeader(header);

  assert.equal(verdict.status, "unauthenticated");
  assert.equal(verdict.spf?.result, "pass");
  assert.equal(verdict.dkim?.result, "fail");
  assert.equal(verdict.dmarc?.result, "fail");
  assert.equal(verdict.dmarc?.aligned, false);
});

test("spoofed From with alignment failure is unauthenticated even when SPF/DKIM pass their own domains", () => {
  // SPF/DKIM pass for the envelope/signing domain (attacker.com) but the
  // visible From header is a different domain, so DMARC alignment fails.
  const header =
    "mx.google.com; dkim=pass header.i=@attacker.com header.s=s1; " +
    "spf=pass smtp.mailfrom=attacker.com; " +
    "dmarc=fail (p=REJECT) header.from=bank.example.com";

  const verdict = parseAuthenticationResultsHeader(header);

  assert.equal(verdict.dmarc?.result, "fail");
  assert.equal(verdict.dmarc?.aligned, false);
  assert.equal(verdict.status, "unauthenticated");
});

test("multiple Authentication-Results headers: trusts the first (most recently added, closest-hop) segment", () => {
  // raw_headers joins repeated header values with ", " (see provider.ts
  // normalizeHeaders). The first segment is the one our own/boundary MTA
  // added; a later, further-out segment could be attacker-controlled.
  const joined =
    "mx.google.com; dkim=pass header.i=@example.com; spf=pass smtp.mailfrom=example.com; dmarc=pass header.from=example.com, " +
    "attacker-relay.example; dkim=pass header.i=@attacker.com; spf=pass smtp.mailfrom=attacker.com; dmarc=pass header.from=attacker.com";

  const segments = splitAuthenticationResultsHeaders(joined);
  assert.equal(segments.length, 2);

  const verdict = resolveAuthResultsVerdict({ "authentication-results": joined });

  assert.equal(verdict.headerCount, 2);
  assert.equal(verdict.authServId, "mx.google.com");
  assert.equal(verdict.status, "authenticated");
  assert.equal(verdict.dmarc?.domain, "example.com");
});

test("missing Authentication-Results header is recorded as unknown, never implied pass", () => {
  const verdict = resolveAuthResultsVerdict({ "content-type": "text/plain" });

  assert.equal(verdict.status, "unknown");
  assert.equal(verdict.spf, null);
  assert.equal(verdict.dkim, null);
  assert.equal(verdict.dmarc, null);
  assert.equal(verdict.headerCount, 0);

  const verdictNoHeaders = resolveAuthResultsVerdict(undefined);
  assert.equal(verdictNoHeaders.status, "unknown");

  const verdictEmpty = resolveAuthResultsVerdict({ "authentication-results": "   " });
  assert.equal(verdictEmpty.status, "unknown");
});

test("authserv-id with no resinfo (no authentication attempted) is a real none, not unknown", () => {
  const verdict = parseAuthenticationResultsHeader("mx.example.com;");
  assert.equal(verdict.status, "unauthenticated");
  assert.equal(verdict.spf?.result, "none");
  assert.equal(verdict.dkim?.result, "none");
  assert.equal(verdict.dmarc?.result, "none");
});
