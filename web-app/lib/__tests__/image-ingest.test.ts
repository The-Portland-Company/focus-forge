import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractImageUrls,
  isBlockedHost,
  fetchImageForVision,
  SCREENSHOTER_HOST,
  type FetchLike,
} from "../ai-agent/image-ingest";
import { describeImagesInMessage } from "../ai-agent/providers";

// ---- URL detection ----

test("extractImageUrls matches image extensions", () => {
  const text = "look at https://example.com/a.png and https://x.io/b.JPEG?v=2 plus http://y/c.webp";
  assert.deepEqual(extractImageUrls(text), [
    "https://example.com/a.png",
    "https://x.io/b.JPEG?v=2",
    "http://y/c.webp",
  ]);
});

test("extractImageUrls matches the screenshoter host without an extension", () => {
  const url = `https://${SCREENSHOTER_HOST}/s/veybtp98.webp`;
  assert.deepEqual(extractImageUrls(`see ${url}`), [url]);
  const noExt = `https://${SCREENSHOTER_HOST}/s/abc`;
  assert.deepEqual(extractImageUrls(`see ${noExt}`), [noExt]);
});

test("extractImageUrls ignores non-image URLs", () => {
  const text = "visit https://example.com/page.html and https://github.com/foo/bar";
  assert.deepEqual(extractImageUrls(text), []);
});

test("extractImageUrls strips trailing punctuation and de-dupes", () => {
  const text = "img https://e.com/a.png. again https://e.com/a.png!";
  assert.deepEqual(extractImageUrls(text), ["https://e.com/a.png"]);
});

// ---- SSRF guard ----

test("isBlockedHost rejects localhost and private/loopback/link-local IPs", () => {
  for (const h of [
    "localhost",
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
    "metadata.google.internal",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isBlockedHost(h), true, `${h} should be blocked`);
  }
});

test("isBlockedHost accepts public hosts/IPs", () => {
  for (const h of ["example.com", "8.8.8.8", "1.1.1.1", SCREENSHOTER_HOST, "172.15.0.1", "172.32.0.1"]) {
    assert.equal(isBlockedHost(h), false, `${h} should be allowed`);
  }
});

test("fetchImageForVision rejects a private-IP URL without fetching", async () => {
  let called = false;
  const spyFetch: FetchLike = async () => {
    called = true;
    throw new Error("should not be called");
  };
  const r = await fetchImageForVision("http://127.0.0.1/a.png", { fetchImpl: spyFetch });
  assert.equal(r.ok, false);
  assert.equal(called, false);
  if (!r.ok) assert.match(r.reason, /blocked host/);
});

test("fetchImageForVision returns a base64 image block on success (injected fetch)", async () => {
  const fakeBytes = new Uint8Array([1, 2, 3, 4]);
  const okFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "image/png" : null) },
    arrayBuffer: async () => fakeBytes.buffer,
  });
  const r = await fetchImageForVision("https://example.com/a.png", { fetchImpl: okFetch });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.block.type, "image");
    assert.equal(r.block.source.media_type, "image/png");
    assert.equal(r.block.source.data, Buffer.from(fakeBytes).toString("base64"));
  }
});

test("fetchImageForVision rejects a non-image content-type", async () => {
  const htmlFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  const r = await fetchImageForVision("https://example.com/page", { fetchImpl: htmlFetch });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /not an image/);
});

test("fetchImageForVision enforces the size cap", async () => {
  const bigFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (n: string) =>
        n.toLowerCase() === "content-type" ? "image/png" : n.toLowerCase() === "content-length" ? "999999" : null,
    },
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  const r = await fetchImageForVision("https://example.com/a.png", { fetchImpl: bigFetch, maxBytes: 1000 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /too large/);
});

// ---- Graceful fallback when ingestion is disabled ----

test("describeImagesInMessage falls back honestly when no API key", async () => {
  const res = await describeImagesInMessage("check https://example.com/shot.png", {
    apiKey: () => undefined,
  });
  assert.equal(res.hadImageUrls, true);
  assert.deepEqual(res.describedUrls, []);
  assert.deepEqual(res.failedUrls, ["https://example.com/shot.png"]);
  assert.match(res.context, /can't view|paste the task/i);
});

test("describeImagesInMessage is a no-op when no image URLs are present", async () => {
  const res = await describeImagesInMessage("just a normal message with no images", {
    apiKey: () => "key",
  });
  assert.equal(res.hadImageUrls, false);
  assert.equal(res.context, "");
});
