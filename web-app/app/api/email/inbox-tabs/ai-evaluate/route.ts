import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getAdminClient } from "@/lib/supabase/admin";
import { judgeAiTabPrompts } from "@/lib/email-inbox/ai-tab-judge";
import {
  aiIntentKey,
  MAX_AI_INTENT_PROMPT_LENGTH,
} from "@/lib/email-inbox/inbox-tabs";

/** Threads judged per request. Keeps one call bounded; the inbox asks again. */
const MAX_THREADS_PER_REQUEST = 12;
/** Distinct AI questions honored per request. */
const MAX_PROMPTS = 6;

/**
 * POST /api/email/inbox-tabs/ai-evaluate
 *
 * Body: `{ threadIds: string[], prompts: string[] }`
 *
 * Answers each "AI decides" tab question for the given threads and caches the
 * verdicts on `email_threads.ai_tab_verdicts_json`. Only (thread, question)
 * pairs with no cached answer cost a model call; everything already decided is
 * returned from the cache. Response: `{ verdicts: { [threadId]: { [key]: bool } } }`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const body = await request.json().catch(() => ({}));
  const threadIds = Array.isArray(body?.threadIds)
    ? body.threadIds
        .filter((id: unknown): id is string => typeof id === "string")
        .slice(0, MAX_THREADS_PER_REQUEST)
    : [];
  const prompts = Array.isArray(body?.prompts)
    ? Array.from(
        new Set(
          body.prompts
            .filter((p: unknown): p is string => typeof p === "string")
            .map((p: string) => aiIntentKey(p))
            .filter((p: string) => p.length > 0 && p.length <= MAX_AI_INTENT_PROMPT_LENGTH),
        ),
      ).slice(0, MAX_PROMPTS)
    : [];

  if (threadIds.length === 0 || prompts.length === 0) {
    return NextResponse.json({ verdicts: {} });
  }

  // Read through the caller's RLS-scoped client: a thread the user cannot see
  // simply doesn't come back, so we never judge (or write to) someone else's mail.
  const db = auth.supabase as any;
  const { data: rows, error } = await db
    .from("email_threads")
    .select(
      "id,subject,summary_text,preview_text,ai_tab_verdicts_json,mailbox_id",
    )
    .in("id", threadIds);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admin = getAdminClient();
  const verdicts: Record<string, Record<string, boolean>> = {};

  for (const row of rows || []) {
    const cached: Record<string, boolean> =
      row.ai_tab_verdicts_json && typeof row.ai_tab_verdicts_json === "object"
        ? row.ai_tab_verdicts_json
        : {};
    const missing = (prompts as string[]).filter(
      (prompt) => cached[prompt] === undefined,
    );

    if (missing.length === 0) {
      verdicts[row.id] = cached;
      continue;
    }

    const judged = await judgeAiTabPrompts({
      subject: row.subject ?? null,
      summaryText: row.summary_text ?? null,
      previewText: row.preview_text ?? null,
      senderEmail: null,
      prompts: missing,
    });

    // A provider outage returns {} — cache nothing so the next pass retries.
    if (Object.keys(judged).length === 0) {
      verdicts[row.id] = cached;
      continue;
    }

    const merged = { ...cached, ...judged };
    const { error: writeError } = await admin
      .from("email_threads")
      .update({ ai_tab_verdicts_json: merged })
      .eq("id", row.id);
    if (writeError) {
      console.error("[ai-evaluate] failed to cache verdicts:", writeError.message);
    }
    verdicts[row.id] = merged;
  }

  return NextResponse.json({ verdicts });
}
