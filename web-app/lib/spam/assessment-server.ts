/**
 * Server glue for spam explainability: load a thread's context, run or reuse an
 * assessment, and persist the policies a training conversation produces.
 *
 * Kept out of `lib/email-inbox/server.ts` (already 6.6k lines) and out of the
 * route handlers, so the API layer stays thin and this stays testable.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import {
  assessSpam,
  type SpamAssessment,
  type SpamAssessmentInput,
} from "@/lib/spam/assessment";
import {
  finalizeSpamPolicy,
  replyToTrainer,
  type SpamPolicyDraft,
  type SpamTrainerTurn,
} from "@/lib/spam/trainer";
import { recordSpamLabel } from "@/lib/spam/server";
import { buildSpamInputText } from "@/lib/spam/server";
import type { ModelSpec } from "@/lib/ai/structured-waterfall";

export interface SpamThreadContext {
  threadId: string;
  mailboxId: string | null;
  organizationId: string | null;
  subject: string | null;
  senderEmail: string | null;
  senderName: string | null;
  previewText: string | null;
  bodyText: string | null;
  classification: string | null;
  cachedAssessment: SpamAssessment | null;
  /** The mailbox owner's personal name(s), for the greeting signal. */
  recipientNames: string[];
  /** The mailbox owner's organization name, if any. */
  businessName: string | null;
}

/** Everything the assessment and the trainer need about one thread. */
export async function loadSpamThreadContext(
  threadId: string,
): Promise<SpamThreadContext | null> {
  const admin = getAdminClient();

  const { data: thread } = await admin
    .from("email_threads")
    .select(
      "id,mailbox_id,subject,preview_text,classification,spam_assessment_json",
    )
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return null;

  const { data: mailbox } = thread.mailbox_id
    ? await admin
        .from("mailboxes")
        .select("id,organization_id,owner_user_id")
        .eq("id", thread.mailbox_id)
        .maybeSingle()
    : { data: null };

  // Personal name(s) + business name feed the greeting-based spam signal. Both
  // best-effort: a missing profile or org just leaves the signal unevaluated.
  const { recipientNames, businessName } = await loadRecipientIdentity(
    mailbox?.owner_user_id ? String(mailbox.owner_user_id) : null,
    mailbox?.organization_id ? String(mailbox.organization_id) : null,
  );

  // Newest inbound message carries the text worth judging.
  const { data: messages } = await admin
    .from("email_messages")
    .select("body_text,metadata_json,received_at,sent_at")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(1);
  const message = messages?.[0] ?? null;

  const { data: participant } = await admin
    .from("email_participants")
    .select("email_address,display_name")
    .eq("thread_id", threadId)
    .eq("participant_role", "from")
    .limit(1)
    .maybeSingle();

  return {
    threadId: String(thread.id),
    mailboxId: thread.mailbox_id ? String(thread.mailbox_id) : null,
    organizationId: mailbox?.organization_id
      ? String(mailbox.organization_id)
      : null,
    subject: thread.subject ?? null,
    senderEmail: participant?.email_address ?? null,
    senderName: participant?.display_name ?? null,
    previewText: thread.preview_text ?? null,
    bodyText: message?.body_text ?? null,
    classification: thread.classification ?? null,
    cachedAssessment:
      (thread.spam_assessment_json as SpamAssessment | null) ?? null,
    recipientNames,
    businessName,
  };
}

/**
 * The recipient's personal name(s) and business name, for the greeting signal.
 * Best-effort — any lookup failure returns empty rather than throwing, so it can
 * never break a sync or an assessment.
 */
export async function loadRecipientIdentity(
  ownerUserId: string | null,
  organizationId: string | null,
): Promise<{ recipientNames: string[]; businessName: string | null }> {
  const admin = getAdminClient();
  let recipientNames: string[] = [];
  let businessName: string | null = null;

  if (ownerUserId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name,last_name")
      .eq("id", ownerUserId)
      .maybeSingle();
    const first = (profile?.first_name || "").trim();
    const last = (profile?.last_name || "").trim();
    recipientNames = [first, last, [first, last].filter(Boolean).join(" ")]
      .map((n) => n.trim())
      .filter(Boolean);
    // De-dupe (first === full when there is no last name, etc.).
    recipientNames = Array.from(new Set(recipientNames));
  }

  if (organizationId) {
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();
    businessName = (org?.name || "").trim() || null;
  }

  return { recipientNames, businessName };
}

/** The user's active policy statements, newest first. */
export async function listSpamPolicyStatements(
  userId: string,
): Promise<string[]> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("spam_policies")
    .select("statement")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(40);
  return (data || [])
    .map((row: { statement?: string | null }) => (row.statement || "").trim())
    .filter(Boolean);
}

/**
 * Produce an assessment for a thread and cache it.
 *
 * `force` re-runs even when one is cached — the user asking again after a
 * training conversation should get a fresh answer, not the stale one their
 * correction was aimed at.
 */
export async function runThreadSpamAssessment(params: {
  userId: string;
  context: SpamThreadContext;
  knnConfidence?: number | null;
  force?: boolean;
}): Promise<SpamAssessment | null> {
  if (!params.force && params.context.cachedAssessment) {
    return params.context.cachedAssessment;
  }

  const policies = await listSpamPolicyStatements(params.userId);
  const input: SpamAssessmentInput = {
    subject: params.context.subject,
    senderEmail: params.context.senderEmail,
    senderName: params.context.senderName,
    previewText: params.context.previewText,
    bodyText: params.context.bodyText,
    currentClassification: params.context.classification,
    knnConfidence: params.knnConfidence ?? null,
    policies,
    recipientNames: params.context.recipientNames,
    businessName: params.context.businessName,
  };

  const assessment = await assessSpam(input, new Date().toISOString());
  if (!assessment) return null;

  await getAdminClient()
    .from("email_threads")
    .update({
      spam_assessment_json: assessment,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.context.threadId);

  return assessment;
}

/**
 * Pipeline variant of {@link runThreadSpamAssessment}: takes the fields the sync
 * path has ALREADY loaded (no second thread/mailbox/message read), runs the
 * explainable assessment, and caches it to `spam_assessment_json` so the
 * quarantine review shows cited reasons. Returns the verdict so the caller can
 * veto an AI false positive. Best-effort — every failure resolves to null and
 * the caller keeps the AI's quarantine decision.
 *
 * This is the ONE targeted LLM call in the auto-catch design: it runs only on
 * the already-flagged (AI → quarantine) subset, never on every inbound message.
 */
export async function persistPipelineSpamAssessment(params: {
  userId: string;
  organizationId: string | null;
  threadId: string;
  subject: string | null;
  senderEmail: string | null;
  senderName: string | null;
  previewText: string | null;
  bodyText: string | null;
  currentClassification: string | null;
  knnConfidence: number | null;
  recipientNames: string[];
  businessName: string | null;
  /** Optional model chain (e.g. the org email chain). Defaults to assessSpam's. */
  chain?: ModelSpec[] | null;
}): Promise<{ verdict: "spam" | "not_spam"; confidence: number } | null> {
  try {
    const policies = await listSpamPolicyStatements(params.userId);
    const input: SpamAssessmentInput = {
      subject: params.subject,
      senderEmail: params.senderEmail,
      senderName: params.senderName,
      previewText: params.previewText,
      bodyText: params.bodyText,
      currentClassification: params.currentClassification,
      knnConfidence: params.knnConfidence,
      policies,
      recipientNames: params.recipientNames,
      businessName: params.businessName,
    };

    const assessment = await assessSpam(
      input,
      new Date().toISOString(),
      params.chain ?? undefined,
    );
    if (!assessment) return null;

    await getAdminClient()
      .from("email_threads")
      .update({
        spam_assessment_json: assessment,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.threadId);

    return { verdict: assessment.verdict, confidence: assessment.confidence };
  } catch (error) {
    console.error("[spam] pipeline assessment failed (best-effort):", error);
    return null;
  }
}

/** One turn of the training conversation. */
export async function continueSpamTraining(params: {
  context: SpamThreadContext;
  turns: SpamTrainerTurn[];
}): Promise<string> {
  return replyToTrainer({
    assessment: params.context.cachedAssessment,
    subject: params.context.subject,
    senderEmail: params.context.senderEmail,
    turns: params.turns,
  });
}

/**
 * Close the conversation: write the finalized sentence, save it, and record the
 * matching training example so the k-NN classifier moves too — the sentence
 * steers future assessments, the example steers the scorer.
 */
export async function saveSpamPolicyFromTraining(params: {
  userId: string;
  context: SpamThreadContext;
  turns: SpamTrainerTurn[];
}): Promise<{ policy: SpamPolicyDraft; id: string } | null> {
  const draft = await finalizeSpamPolicy({
    assessment: params.context.cachedAssessment,
    subject: params.context.subject,
    senderEmail: params.context.senderEmail,
    turns: params.turns,
  });
  if (!draft) return null;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("spam_policies")
    .insert({
      user_id: params.userId,
      organization_id: params.context.organizationId,
      mailbox_id: params.context.mailboxId,
      statement: draft.statement,
      assessment: draft.assessment,
      label: draft.label,
      source_thread_id: params.context.threadId,
      transcript_json: params.turns,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Best-effort: a failed embedding must not lose the policy the user just
  // agreed to. The statement is already saved above.
  try {
    await recordSpamLabel({
      userId: params.userId,
      organizationId: params.context.organizationId,
      mailboxId: params.context.mailboxId,
      threadId: params.context.threadId,
      text: buildSpamInputText(
        { subject: params.context.subject },
        {
          subject: params.context.subject,
          body_text: params.context.bodyText || params.context.previewText,
          senderEmail: params.context.senderEmail,
        },
      ),
      label: draft.label,
      note: draft.statement,
    });
  } catch (error) {
    console.error("[spam] policy saved but training label failed:", error);
  }

  return { policy: draft, id: String(data.id) };
}
