import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AGENT_APPROVAL_SECRET = "unit-test-approval-secret";

import { hashSendParams, mintSendApproval, validateSendApproval } from "../ai-agent/approval";
import { findPendingSendDraft, loadSendPreview } from "../ai-agent/send-preview";

const USER = "11111111-1111-1111-1111-111111111111";
const DRAFT = "22222222-2222-2222-2222-222222222222";
const MAILBOX = "33333333-3333-3333-3333-333333333333";

/**
 * Fake admin client covering exactly what loadSendPreview / findPendingSendDraft
 * touch on email_reply_drafts and email_outbound_drafts.
 */
function makeFakeAdmin(rows: any[]) {
  const thenable = (produce: (filters: Record<string, unknown>) => any) => {
    const filters: Record<string, unknown> = {};
    const builder: any = {
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      is(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      neq(column: string, value: unknown) {
        filters[`neq:${column}`] = value;
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle: async () => produce(filters),
      then: (resolve: any, reject: any) => Promise.resolve(produce(filters)).then(resolve, reject),
    };
    return builder;
  };

  return {
    from(table: string) {
      assert.ok(table === "email_reply_drafts" || table === "email_outbound_drafts", `unexpected table ${table}`);
      return {
        select: () =>
          thenable((filters) => {
            if (filters.id) {
              const row =
                rows.find(
                  (r) => r.id === filters.id && r.created_by_user_id === filters.created_by_user_id,
                ) || null;
              return { data: row, error: null };
            }
            // findPendingSendDraft's narrower select("id") lookup — most
            // recent not-yet-sent draft for the user.
            const candidates = rows
              .filter((r) => r.created_by_user_id === filters.created_by_user_id && !r.sent_at && r.status !== "sent")
              .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
            return { data: candidates[0] ? { id: candidates[0].id } : null, error: null };
          }),
      };
    },
  } as any;
}

function draftRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: DRAFT,
    created_by_user_id: USER,
    mailbox_id: MAILBOX,
    thread_id: "44444444-4444-4444-4444-444444444444",
    to_json: [{ email: "client@example.com" }],
    cc_json: [],
    subject: "Re: Invoice 4821",
    content_html: "<p>Paid this morning.</p>",
    content_text: "Paid this morning.",
    status: "draft",
    sent_at: null,
    updated_at: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// loadSendPreview: the re-derivation the approve-send route relies on.
// ---------------------------------------------------------------------------

test("loadSendPreview rebuilds the exact action from the persisted draft", async () => {
  const admin = makeFakeAdmin([draftRow()]);
  const preview = await loadSendPreview(admin, USER, "send_reply", DRAFT);
  assert.ok(preview);
  assert.equal(preview!.subject, "Re: Invoice 4821");
  assert.deepEqual(preview!.recipients, ["client@example.com"]);
  assert.equal(preview!.paramsHash, hashSendParams(preview!.action));
});

test("loadSendPreview returns null for a draft that isn't the user's", async () => {
  const admin = makeFakeAdmin([draftRow({ created_by_user_id: "someone-else" })]);
  const preview = await loadSendPreview(admin, USER, "send_reply", DRAFT);
  assert.equal(preview, null);
});

test("loadSendPreview's hash changes when the persisted draft changes — this is what makes a stale client-supplied hash detectable", async () => {
  const original = await loadSendPreview(makeFakeAdmin([draftRow()]), USER, "send_reply", DRAFT);
  const edited = await loadSendPreview(
    makeFakeAdmin([draftRow({ content_text: "Actually, refund issued instead." })]),
    USER,
    "send_reply",
    DRAFT,
  );
  assert.ok(original && edited);
  assert.notEqual(original!.paramsHash, edited!.paramsHash);
});

// ---------------------------------------------------------------------------
// Mint route behavior, exercised at the logic level: re-derive server-side,
// compare to the client's hash, mint only on a match, refuse on drift.
// (Mirrors app/api/ai-agent/approve-send/route.ts, which has no logic beyond
// this — auth, then this comparison, then mintSendApproval.)
// ---------------------------------------------------------------------------

async function approveLikeTheRoute(admin: any, expectedParamsHash: string) {
  const preview = await loadSendPreview(admin, USER, "send_reply", DRAFT);
  if (!preview) return { ok: false as const, error: "not_found" };
  if (preview.sentAt || preview.status === "sent") return { ok: false as const, error: "already_sent" };
  if (preview.paramsHash !== expectedParamsHash) return { ok: false as const, error: "draft_changed" };
  return { ok: true as const, approval: mintSendApproval(preview.action, { approvedByUserId: USER }) };
}

test("approve-send mints only when the client's hash still matches the persisted draft", async () => {
  const admin = makeFakeAdmin([draftRow()]);
  const preview = await loadSendPreview(admin, USER, "send_reply", DRAFT);
  const result = await approveLikeTheRoute(admin, preview!.paramsHash);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.approval.signature);

  const validation = validateSendApproval(result.ok ? result.approval : null, preview!.action);
  assert.equal(validation.valid, true);
});

test("approve-send refuses when the draft changed since the client previewed it", async () => {
  // Client previewed the draft, holds its hash…
  const staleHash = (await loadSendPreview(makeFakeAdmin([draftRow()]), USER, "send_reply", DRAFT))!.paramsHash;

  // …but by the time they click approve, the agent (or the human) edited the
  // draft. The route must recompute from what's ACTUALLY persisted now, not
  // trust the client's hash, and refuse the mismatch.
  const adminAfterEdit = makeFakeAdmin([draftRow({ subject: "Re: Invoice 4821 (corrected)" })]);
  const result = await approveLikeTheRoute(adminAfterEdit, staleHash);
  assert.equal(result.ok, false);
  assert.equal((result as any).error, "draft_changed");
});

test("approve-send refuses to mint for an already-sent draft", async () => {
  const admin = makeFakeAdmin([draftRow({ status: "sent", sent_at: "2026-09-21T10:05:00.000Z" })]);
  const preview = await loadSendPreview(admin, USER, "send_reply", DRAFT);
  const result = await approveLikeTheRoute(admin, preview!.paramsHash);
  assert.equal(result.ok, false);
  assert.equal((result as any).error, "already_sent");
});

test("a tampered client-supplied paramsHash is refused the same way as a real edit", async () => {
  const admin = makeFakeAdmin([draftRow()]);
  const result = await approveLikeTheRoute(admin, "0".repeat(64));
  assert.equal(result.ok, false);
  assert.equal((result as any).error, "draft_changed");
});

// ---------------------------------------------------------------------------
// findPendingSendDraft: what the chat route uses to describe a needsApproval
// result to the UI (it only sees the tool NAME that ran, not its payload).
// ---------------------------------------------------------------------------

test("findPendingSendDraft finds the most recent unsent draft for the user", async () => {
  const older = draftRow({ id: "aaaaaaaa-0000-0000-0000-000000000000", updated_at: "2026-09-21T09:00:00.000Z" });
  const newer = draftRow({ updated_at: "2026-09-21T10:00:00.000Z" });
  const admin = makeFakeAdmin([older, newer]);
  const preview = await findPendingSendDraft(admin, USER, "send_reply");
  assert.ok(preview);
  assert.equal(preview!.action.draftId, DRAFT);
});

test("findPendingSendDraft ignores already-sent drafts", async () => {
  const admin = makeFakeAdmin([draftRow({ status: "sent", sent_at: "2026-09-21T10:05:00.000Z" })]);
  const preview = await findPendingSendDraft(admin, USER, "send_reply");
  assert.equal(preview, null);
});
