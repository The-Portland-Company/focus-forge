/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HIDE_EMAIL_SIGNATURES,
  extractEmailSignatureContentParts,
} from "../email-signature-display";

test("email signature display defaults to hiding signatures", () => {
  assert.equal(DEFAULT_HIDE_EMAIL_SIGNATURES, true);
});

test("extractEmailSignatureContentParts splits gmail signature html", () => {
  const html =
    "<p>Need to be able to add a link.</p><div class=\"gmail_signature\">Thanks,<br />Spencer Hill<br />Follow us!</div>";

  const parts = extractEmailSignatureContentParts({ html });

  assert.equal(parts.hasSignature, true);
  assert.match(parts.bodyHtml || "", /Need to be able to add a link/);
  assert.match(parts.signatureHtml || "", /gmail_signature/);
  assert.match(parts.signatureHtml || "", /Follow us!/);
});

test("extractEmailSignatureContentParts splits html signatures with image blocks", () => {
  const html = [
    "<ul>",
    "<li>Need website url in footer</li>",
    "<li>Footer came in looking wonky</li>",
    "</ul>",
    "<p>Sincerely,</p>",
    "<p><img src=\"https://example.com/headshot.png\" alt=\"Ben Edtl\" /></p>",
    "<p><strong>Ben Edtl</strong><br />Managing Partner, Politogy, LLC<br />Follow us!</p>",
  ].join("");

  const parts = extractEmailSignatureContentParts({ html });

  assert.equal(parts.hasSignature, true);
  assert.match(parts.bodyHtml || "", /Need website url in footer/);
  assert.match(parts.signatureHtml || "", /headshot\.png/);
  assert.match(parts.signatureHtml || "", /Managing Partner, Politogy, LLC/);
});

test("extractEmailSignatureContentParts rewinds to the enclosing html block", () => {
  const html = [
    "<p>Thank you! Gonna test right now.</p>",
    "<p>Another weird thing is that it's not saving the from address.</p>",
    "<p>Sincerely,</p>",
    "<p><img src=\"https://example.com/ben.png\" alt=\"Ben Edtl\" /></p>",
    "<p><strong>Ben Edtl</strong></p>",
  ].join("");

  const parts = extractEmailSignatureContentParts({ html });

  assert.equal(parts.hasSignature, true);
  assert.doesNotMatch(parts.bodyHtml || "", /Sincerely,/);
  assert.match(parts.signatureHtml || "", /^<p>Sincerely,/);
});

test("extractEmailSignatureContentParts splits styled html signatures", () => {
  const html = [
    "<div><p>Thank you! Gonna test right now.</p>",
    "<p>Another weird thing is that it's not saving the from address in the sender information tab.</p>",
    "<div><span style=\"color:#8b3a3a;font-family:monospace\">Sincerely,</span></div>",
    "<div><img src=\"https://example.com/ben.png\" alt=\"Ben Edtl\" /></div>",
    "<div><strong>Ben Edtl</strong><br />Managing Partner, Politogy, LLC</div></div>",
  ].join("");

  const parts = extractEmailSignatureContentParts({ html });

  assert.equal(parts.hasSignature, true);
  assert.doesNotMatch(parts.bodyHtml || "", /Sincerely,/);
  assert.match(parts.signatureHtml || "", /Ben Edtl/);
});

test("extractEmailSignatureContentParts ignores head style noise in outlook html", () => {
  const html = [
    "<html><head><style>",
    ".MsoNormal{margin:0} .huge{font-family:Calibri} .x{color:#111}",
    "</style></head><body>",
    "<p>Thank you! Gonna test right now.</p>",
    "<p>Another weird thing is that it's not saving the from address.</p>",
    "<div><span style=\"color:#8b3a3a\">Sincerely,</span></div>",
    "<div><img src=\"https://example.com/ben.png\" alt=\"Ben Edtl\" /></div>",
    "<div><strong>Ben Edtl</strong><br />Managing Partner, Politogy, LLC</div>",
    "</body></html>",
  ].join("");

  const parts = extractEmailSignatureContentParts({ html });

  assert.equal(parts.hasSignature, true);
  assert.doesNotMatch(parts.bodyHtml || "", /Sincerely,/);
  assert.match(parts.signatureHtml || "", /Managing Partner, Politogy, LLC/);
});

test("extractEmailSignatureContentParts splits plain text signatures", () => {
  const text = [
    "Need to be able to add a link in edit mode.",
    "",
    "Sincerely,",
    "Ben Edtl",
    "Managing Partner, Politogy, LLC",
  ].join("\n");

  const parts = extractEmailSignatureContentParts({ text });

  assert.equal(parts.hasSignature, true);
  assert.match(parts.bodyText || "", /Need to be able to add a link/);
  assert.match(parts.signatureText || "", /Managing Partner/);
});

test("extractEmailSignatureContentParts leaves normal body content alone", () => {
  const html =
    "<p>Can you share pricing and a call time next week?</p><p>We need to move quickly.</p>";

  const parts = extractEmailSignatureContentParts({ html });

  assert.equal(parts.hasSignature, false);
  assert.equal(parts.signatureHtml, null);
  assert.match(parts.bodyHtml || "", /pricing and a call time/);
});
