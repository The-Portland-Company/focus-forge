/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeEmailHtml } from "../email-html-sanitize";
import {
  DEFAULT_EMAIL_HTML_RENDER_MODE,
  getEmailHtmlRenderModeToggleLabel,
  normalizeEmailHtmlRenderMode,
} from "../email-html-render-mode";

test("sanitizeEmailHtml preserves email table structure and safe sizing attributes", () => {
  const html = [
    '<table width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;margin:0 auto;background-color:#111827;">',
    "<tbody><tr><td align=\"center\">",
    '<img src="https://example.com/logo.png" alt="Logo" width="320" height="180" style="width:320px;height:180px;" />',
    "</td></tr></tbody></table>",
  ].join("");

  const sanitized = sanitizeEmailHtml(html);

  assert.match(sanitized, /<table/);
  assert.match(sanitized, /width="600"/);
  assert.match(sanitized, /cellpadding="0"/);
  assert.match(sanitized, /background-color: #111827/);
  assert.match(sanitized, /<img/);
  assert.match(sanitized, /width="320"/);
  assert.match(sanitized, /height="180"/);
});

test("sanitizeEmailHtml strips dangerous script and css payloads", () => {
  const html = [
    '<div style="position:fixed;color:#fff;background:url(https://evil.test/x.png)">Hello</div>',
    '<img src="https://example.com/a.png" onerror="alert(1)" style="width:200px;expression(alert(2));" />',
    "<script>alert(3)</script>",
  ].join("");

  const sanitized = sanitizeEmailHtml(html);

  assert.doesNotMatch(sanitized, /script/i);
  assert.doesNotMatch(sanitized, /onerror/i);
  assert.doesNotMatch(sanitized, /position:\s*fixed/i);
  assert.doesNotMatch(sanitized, /url\(/i);
  assert.doesNotMatch(sanitized, /expression\(/i);
});

test("sanitizeEmailHtml bounds images to the thread panel width", () => {
  const sanitized = sanitizeEmailHtml(
    '<img src="https://example.com/hero.png" alt="Hero" width="640" />',
  );

  assert.match(sanitized, /max-width: 100%/);
  assert.match(sanitized, /height: auto/);
  assert.match(sanitized, /display: block/);
});

test("email html render mode defaults and labels remain stable", () => {
  assert.equal(DEFAULT_EMAIL_HTML_RENDER_MODE, "preserve");
  assert.equal(normalizeEmailHtmlRenderMode("simplified"), "simplified");
  assert.equal(normalizeEmailHtmlRenderMode("unexpected"), "preserve");
  assert.equal(
    getEmailHtmlRenderModeToggleLabel("preserve"),
    "Simplified App View",
  );
});
