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

test("extractEmailSignatureContentParts collapses html signatures and prior replies below them", () => {
  const html = [
    "<p>No requested shipping method is there.</p>",
    "<p>This is required to be able to ship via customer paid for UPS ground.</p>",
    "<p>Thanks-</p>",
    "<p>John</p>",
    "<p>John Clemens</p>",
    "<p><img src=\"https://example.com/nuera-logo.png\" alt=\"NuEra\" /></p>",
    "<p><a href=\"https://www.NuEraHeat.com\">www.NuEraHeat.com</a></p>",
    "<p><strong>From:</strong> Spencer Hill &lt;spencerhill@theportlandcompany.com&gt;</p>",
    "<p><strong>Sent:</strong> Friday, April 10, 2026 4:00 PM</p>",
    "<p><strong>To:</strong> John Clemens &lt;john@nueraheat.com&gt;</p>",
    "<p><strong>Subject:</strong> Re: couple things</p>",
    "<p>Okay, updates made. Give it a shot.</p>",
  ].join("");

  const parts = extractEmailSignatureContentParts({ html });

  assert.equal(parts.hasSignature, true);
  assert.doesNotMatch(parts.bodyHtml || "", /Thanks-/);
  assert.match(parts.bodyHtml || "", /No requested shipping method/);
  assert.match(parts.signatureHtml || "", /Thanks-/);
  assert.match(parts.signatureHtml || "", /NuEraHeat\.com/);
  assert.match(parts.signatureHtml || "", /Subject:/);
  assert.match(parts.signatureHtml || "", /Okay, updates made/);
});

test("extractEmailSignatureContentParts collapses plain text signatures and prior replies below them", () => {
  const text = [
    "No requested shipping method is there.",
    "This is required to be able to ship via customer paid for UPS ground.",
    "",
    "Thanks-",
    "John",
    "John Clemens",
    "www.NuEraHeat.com",
    "From: Spencer Hill <spencerhill@theportlandcompany.com>",
    "Sent: Friday, April 10, 2026 4:00 PM",
    "To: John Clemens <john@nueraheat.com>",
    "Subject: Re: couple things",
    "",
    "Okay, updates made. Give it a shot.",
  ].join("\n");

  const parts = extractEmailSignatureContentParts({ text });

  assert.equal(parts.hasSignature, true);
  assert.doesNotMatch(parts.bodyText || "", /Thanks-/);
  assert.match(parts.bodyText || "", /No requested shipping method/);
  assert.match(parts.signatureText || "", /Thanks-/);
  assert.match(parts.signatureText || "", /From:/);
  assert.match(parts.signatureText || "", /Okay, updates made/);
});

test("extractEmailSignatureContentParts collapses on-wrote reply tails", () => {
  const text = [
    "Quick update below.",
    "",
    "Best -",
    "Spencer",
    "",
    "On Fri, Apr 10, 2026 at 4:00 PM John Clemens <john@nueraheat.com> wrote:",
    "> Can you update the footer?",
  ].join("\n");

  const parts = extractEmailSignatureContentParts({ text });

  assert.equal(parts.hasSignature, true);
  assert.match(parts.bodyText || "", /Quick update below/);
  assert.match(parts.signatureText || "", /On Fri, Apr 10, 2026/);
});

test("extractEmailSignatureContentParts does not strip in-body thanks", () => {
  const text = [
    "Thanks for sending this over.",
    "We need pricing and the next available install date.",
  ].join("\n");

  const parts = extractEmailSignatureContentParts({ text });

  assert.equal(parts.hasSignature, false);
  assert.equal(parts.signatureText, null);
  assert.match(parts.bodyText || "", /Thanks for sending this over/);
});

test("extractEmailSignatureContentParts leaves normal body content alone", () => {
  const html =
    "<p>Can you share pricing and a call time next week?</p><p>We need to move quickly.</p>";

  const parts = extractEmailSignatureContentParts({ html });

  assert.equal(parts.hasSignature, false);
  assert.equal(parts.signatureHtml, null);
  assert.match(parts.bodyHtml || "", /pricing and a call time/);
});
