/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  collectThreadAttachments,
  formatAttachmentSize,
  isGalleryAttachment,
  isImageAttachment,
  resolveAttachmentUrl,
} from "../attachments";
import type { ConversationEntry } from "@/lib/types";

test("isImageAttachment detects image mime types case-insensitively", () => {
  assert.equal(isImageAttachment("image/png"), true);
  assert.equal(isImageAttachment("IMAGE/JPEG"), true);
  assert.equal(isImageAttachment("application/pdf"), false);
  assert.equal(isImageAttachment(null), false);
});

test("isGalleryAttachment hides related and inline cid parts", () => {
  assert.equal(
    isGalleryAttachment({ size: 1, related: true } as never),
    false,
  );
  assert.equal(
    isGalleryAttachment({
      size: 1,
      related: false,
      contentDisposition: "inline",
      cid: "logo@x",
    } as never),
    false,
  );
  assert.equal(
    isGalleryAttachment({
      size: 1,
      related: false,
      contentDisposition: "attachment",
    } as never),
    true,
  );
});

test("resolveAttachmentUrl prefers explicit url then builds the route", () => {
  assert.equal(
    resolveAttachmentUrl("msg1", { size: 1, related: false, url: "/x" } as never),
    "/x",
  );
  assert.equal(
    resolveAttachmentUrl("msg1", {
      size: 1,
      related: false,
      attachmentIndex: 2,
    } as never),
    "/api/email/messages/msg1/attachments/2",
  );
  assert.equal(
    resolveAttachmentUrl("msg1", { size: 1, related: false } as never),
    null,
  );
});

test("collectThreadAttachments flattens, filters, and classifies", () => {
  const conversation = [
    {
      id: "m1",
      attachments: [
        {
          filename: "photo.png",
          contentType: "image/png",
          size: 100,
          related: false,
          attachmentIndex: 0,
          url: "/api/email/messages/m1/attachments/0",
        },
        {
          filename: "logo.png",
          contentType: "image/png",
          size: 5,
          related: false,
          contentDisposition: "inline",
          cid: "logo@x",
          attachmentIndex: 1,
        },
      ],
    },
    {
      id: "m2",
      attachments: [
        {
          filename: "report.pdf",
          contentType: "application/pdf",
          size: 2048,
          related: false,
          attachmentIndex: 0,
        },
      ],
    },
  ] as unknown as ConversationEntry[];

  const result = collectThreadAttachments(conversation);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((a) => a.filename),
    ["photo.png", "report.pdf"],
  );
  assert.equal(result[0].isImage, true);
  assert.equal(result[1].isImage, false);
  assert.equal(result[1].url, "/api/email/messages/m2/attachments/0");
});

test("collectThreadAttachments handles empty input", () => {
  assert.deepEqual(collectThreadAttachments(null), []);
  assert.deepEqual(collectThreadAttachments([]), []);
});

test("formatAttachmentSize renders human-readable sizes", () => {
  assert.equal(formatAttachmentSize(0), "");
  assert.equal(formatAttachmentSize(512), "512 B");
  assert.equal(formatAttachmentSize(1024), "1 KB");
  assert.equal(formatAttachmentSize(1536), "1.5 KB");
  assert.equal(formatAttachmentSize(1024 * 1024 * 3), "3 MB");
});
