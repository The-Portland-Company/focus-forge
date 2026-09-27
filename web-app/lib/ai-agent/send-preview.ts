import type { SupabaseClient } from "@supabase/supabase-js";

import {
  hashSendParams,
  normalizeRecipients,
  type HighImpactSendTool,
  type SendAction,
} from "@/lib/ai-agent/approval";

/**
 * Re-derives the exact SendAction a send tool would transmit, read straight
 * from the persisted draft — never from anything the client or the model
 * supplies. Shared by the chat routes (to describe a pending approval) and
 * the approve-send mint route (to re-derive the params hash server-side
 * before minting), so both always compute the same hash the tool layer will
 * check at execution time (see lib/ai-agent/tools.ts `loadSendTarget`, which
 * this mirrors — that file is owned by another workstream and not imported
 * here to avoid coupling to its internals).
 */

type SendDraftKind = "reply" | "outbound";

const SEND_DRAFT_TABLES: Record<SendDraftKind, string> = {
  reply: "email_reply_drafts",
  outbound: "email_outbound_drafts",
};

const TOOL_KIND: Record<HighImpactSendTool, SendDraftKind> = {
  send_reply: "reply",
  send_message: "outbound",
};

function toAddressList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object" && typeof (entry as any).email === "string"
          ? String((entry as any).email)
          : "",
    )
    .filter(Boolean);
}

export type LoadedSendPreview = {
  action: SendAction;
  paramsHash: string;
  status: string;
  sentAt: string | null;
  subject: string;
  recipients: string[];
  bodyPreview: string;
};

/**
 * Loads the draft a send tool targets, scoped to drafts the given user owns
 * (mirrors the tool layer's own scoping) and rebuilds the action + params
 * hash from what is actually persisted right now.
 */
export async function loadSendPreview(
  admin: SupabaseClient,
  userId: string,
  tool: HighImpactSendTool,
  draftId: string,
): Promise<LoadedSendPreview | null> {
  const kind = TOOL_KIND[tool];
  if (!kind || !draftId) return null;

  const { data: row } = await admin
    .from(SEND_DRAFT_TABLES[kind])
    .select("*")
    .eq("id", draftId)
    .eq("created_by_user_id", userId)
    .maybeSingle();
  if (!row) return null;

  const recipients = normalizeRecipients([
    ...toAddressList(row.to_json),
    ...toAddressList(row.cc_json),
    ...(kind === "outbound" ? toAddressList(row.bcc_json) : []),
  ]);

  const action: SendAction = {
    actorUserId: userId,
    tool,
    draftId: String(row.id),
    mailboxId: String(row.mailbox_id),
    threadId: row.thread_id ? String(row.thread_id) : null,
    recipients,
    subject: String(row.subject || ""),
    body: String(row.content_html || row.content_text || ""),
    bodyText: row.content_text ?? null,
  };

  const plainBody = (action.bodyText || action.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return {
    action,
    paramsHash: hashSendParams(action),
    status: String(row.status || ""),
    sentAt: row.sent_at ?? null,
    subject: action.subject,
    recipients: action.recipients,
    bodyPreview: plainBody.slice(0, 600),
  };
}

/**
 * Finds the most recent NOT-YET-SENT draft of the given kind for this user —
 * used right after an agent turn to describe, to the UI, the exact draft a
 * `send_reply` / `send_message` call that came back `needsApproval` was
 * referring to (the chat route only sees the tool's *name* ran, not its
 * result payload).
 */
export async function findPendingSendDraft(
  admin: SupabaseClient,
  userId: string,
  tool: HighImpactSendTool,
): Promise<LoadedSendPreview | null> {
  const kind = TOOL_KIND[tool];
  const { data: row } = await admin
    .from(SEND_DRAFT_TABLES[kind])
    .select("id")
    .eq("created_by_user_id", userId)
    .is("sent_at", null)
    .neq("status", "sent")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row?.id) return null;
  return loadSendPreview(admin, userId, tool, String(row.id));
}
