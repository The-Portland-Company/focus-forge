/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailSignatureContent } from "../email-signature-content";

test("EmailSignatureContent preserves inbound email layout in preserve mode", () => {
  const markup = renderToStaticMarkup(
    <EmailSignatureContent
      html={'<table width="600"><tbody><tr><td><img src="https://example.com/logo.png" width="320" /></td></tr></tbody></table>'}
      text={null}
      hideSignatures={false}
      contentKind="email"
      renderMode="preserve"
    />,
  );

  assert.match(markup, /focus-forge-email-content/);
  assert.match(markup, /<table/);
  assert.match(markup, /max-width:100%/);
});

test("EmailSignatureContent falls back to simplified rich text rendering when requested", () => {
  const markup = renderToStaticMarkup(
    <EmailSignatureContent
      html={'<table width="600"><tbody><tr><td><img src="https://example.com/logo.png" width="320" /></td></tr></tbody></table>'}
      text={null}
      hideSignatures={false}
      contentKind="email"
      renderMode="simplified"
    />,
  );

  assert.match(markup, /focus-forge-rich-content/);
  assert.doesNotMatch(markup, /focus-forge-email-content/);
});

test("EmailSignatureContent keeps app-authored rich text on the standard renderer", () => {
  const markup = renderToStaticMarkup(
    <EmailSignatureContent
      html={"<p><strong>Internal note</strong></p>"}
      text={null}
      hideSignatures={false}
      contentKind="rich_text"
      renderMode="preserve"
    />,
  );

  assert.match(markup, /focus-forge-rich-content/);
  assert.doesNotMatch(markup, /focus-forge-email-content/);
});
