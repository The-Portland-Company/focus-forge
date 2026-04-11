/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReplyHtml,
  buildReplyPlainText,
  formatReplyAttachmentSize,
  isInlineAttachmentEligible,
} from "../email-reply";

test("isInlineAttachmentEligible allows images and pdfs", () => {
  assert.equal(
    isInlineAttachmentEligible({
      mimeType: "image/png",
      name: "diagram.png",
      type: "png",
    }),
    true,
  );
  assert.equal(
    isInlineAttachmentEligible({
      mimeType: "application/pdf",
      name: "proposal.pdf",
      type: "pdf",
    }),
    true,
  );
  assert.equal(
    isInlineAttachmentEligible({
      mimeType: "application/vnd.ms-excel",
      name: "sheet.xls",
      type: "xls",
    }),
    false,
  );
});

test("buildReplyHtml appends signature and inline attachments", () => {
  const html = buildReplyHtml({
    contentHtml: "<p>Hello team,</p><p>See the latest draft.</p>",
    signatureText: "Spencer Hill\nFocus Forge",
    attachments: [
      {
        id: "att-1",
        name: "preview.png",
        url: "user/path/preview.png",
        type: "png",
        mimeType: "image/png",
        inline: true,
        publicUrl: "https://files.example.com/preview.png",
      },
      {
        id: "att-2",
        name: "proposal.pdf",
        url: "user/path/proposal.pdf",
        type: "pdf",
        mimeType: "application/pdf",
        inline: true,
        publicUrl: "https://files.example.com/proposal.pdf",
      },
    ],
  });

  assert.match(html, /Hello team/);
  assert.match(html, /Spencer Hill<br\/>Focus Forge/);
  assert.match(html, /<img src="https:\/\/files\.example\.com\/preview\.png"/);
  assert.match(html, /proposal\.pdf/);
});

test("buildReplyPlainText includes inline attachment links", () => {
  const text = buildReplyPlainText({
    contentHtml: "<p>Hello team,</p><p>See the latest draft.</p>",
    signatureText: "Spencer Hill",
    attachments: [
      {
        id: "att-1",
        name: "preview.png",
        url: "user/path/preview.png",
        type: "png",
        mimeType: "image/png",
        inline: true,
        publicUrl: "https://files.example.com/preview.png",
      },
    ],
  });

  assert.match(text, /Hello team,/);
  assert.match(text, /Spencer Hill/);
  assert.match(text, /preview\.png: https:\/\/files\.example\.com\/preview\.png/);
});

test("formatReplyAttachmentSize formats bytes across ranges", () => {
  assert.equal(formatReplyAttachmentSize(980), "980 B");
  assert.equal(formatReplyAttachmentSize(2048), "2.0 KB");
  assert.equal(formatReplyAttachmentSize(3 * 1024 * 1024), "3.0 MB");
});
