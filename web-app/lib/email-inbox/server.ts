import { cache } from "react";
import {
  SupabaseAdapter,
  resolveVisibleProjectIds,
} from "@/lib/db/supabase-adapter";
import {
  analyzeThreadWithAI,
  buildProjectReplyContextSnapshot,
  formatAiGeneratedTaskName,
  generateReplyDraftWithAI,
  repairGenericTaskName,
} from "@/lib/email-inbox/ai";
import {
  classifySpam,
  recordSpamLabel,
  buildSpamInputText,
  getSpamConfidenceThreshold,
  getSpamFallbackMode,
  type SpamClassification,
} from "@/lib/spam/server";
import { resolveEmailChain } from "@/lib/ai/email-provider";
import {
  mergeEmailReplySettings,
  type EmailReplySettingsOverride,
} from "@/lib/email-inbox/reply-settings";
import {
  applyEmailRules,
  type EmailRuleContext,
} from "@/lib/email-inbox/rules";
import {
  applySpamKnnOverride,
  resolveRuleDrivenThreadState,
  isContentSpamExemptSender,
} from "@/lib/email-inbox/reprocess";
import {
  normalizeParticipant,
  parseAddressString,
} from "@/lib/email-inbox/parse-sender";
import {
  buildSpamExceptionRevertPayload,
  buildSpamExceptionRulePayload,
  generateSpamExceptionRuleDraft,
} from "@/lib/email-inbox/spam-exception";
import {
  SPAM_MIRROR_SWEEP_LIMIT,
  SPAM_PROVIDER_LABEL_MARKER,
  selectSpamThreadsNeedingProviderMirror,
} from "@/lib/email-inbox/spam-mirror";
import {
  buildParticipantSummary,
  buildThreadKey,
  coerceConversationEntry,
  coerceMailbox,
  coerceRule,
  coerceSummaryProfile,
  extractMailboxErrorMessage,
  extractPlainTextPreview,
  getMailboxPasswordValidationError,
  isQuarantinedEmailStatus,
  normalizeMailboxPassword,
  normalizeSubject,
  sortInboxItems,
} from "@/lib/email-inbox/shared";
import { encryptMailboxCredentials } from "@/lib/email-inbox/crypto";
import {
  buildMailboxSyncCursor,
  applyMailboxThreadAction,
  applyMailboxThreadLabel,
  emptyMailboxTrash,
  fetchMailboxAttachmentByProviderMessageId,
  fetchMailboxMessagesByProviderMessageIds,
  fetchMailboxFolderUids,
  fetchMailboxMessageReadStates,
  fetchMailboxMessages,
  fetchMailboxSentMessages,
  fetchMailboxDraftMessages,
  deleteMailboxDraftMessage,
  fetchMailboxStorageQuota,
  sendMailboxReply,
  type MailboxTransportRow,
} from "@/lib/email-inbox/provider";
import { MAILBOX_PROVIDER_PRESETS } from "@/lib/email-inbox/provider-presets";
import { matchInboxTab } from "@/lib/email-inbox/inbox-tabs";
import {
  hasApnsConfiguration,
  isApnsPermanentFailure,
  sendApnsNotification,
} from "@/lib/push/apns";
import {
  buildEmailPushNotificationContent,
  shouldSendEmailPushNotification,
} from "@/lib/push/email";
import type {
  ConversationEntry,
  EmailOutboundDraft,
  EmailReplyAddress,
  EmailReplyDraft,
  EmailRule,
  EmailSpamExceptionResult,
  InboxItem,
  InboxParticipant,
  InboxTaskSuggestion,
  Mailbox as MailboxType,
  Mailbox,
  SummaryProfile,
} from "@/lib/types";
import { getAdminClient } from "@/lib/supabase/admin";
import { logEmailAction } from "@/lib/email-inbox/action-log";
import {
  createPersonalContact,
  getContactAddressesForUser,
  getContactsByEmailForUser,
} from "./contacts";
import { attachContactsToRecipients } from "@/lib/email-thread-ui";
import { getLocalDateString } from "@/lib/date-utils";
import { retrieveRelevantAIMemory } from "@/lib/ai-memory/retrieval";
import { getLatestActivePlaybook } from "@/lib/ai-memory/playbook";
import {
  buildAIMemoryPromptBlock,
  buildPlaybookPromptBlock,
} from "@/lib/ai-memory/prompt";
import { maybeCreateAIMemoryFromEvent } from "@/lib/ai-memory/write";
import { recordDecisionTrace } from "@/lib/ai-memory/trace";
import { normalizeRichText } from "@/lib/rich-text-sanitize";
import {
  buildReplyHtml,
  buildReplyPlainText,
  type EmailReplyAttachment,
} from "@/lib/email-reply";
import { getProjectAiExportForUser } from "@/lib/project-ai-export";
import {
  collectThreadAttachments,
  countStoredGalleryAttachments,
} from "@/lib/email-inbox/attachments";

type VisibleScope = {
  orgMemberships: Array<{ organization_id: string; is_owner: boolean | null }>;
  orgIds: string[];
  role: string | null;
};

type ProjectOption = {
  id: string;
  name: string;
  description?: string | null;
  organization_id: string | null;
};

function isUniqueViolation(error: any) {
  return (
    error?.code === "23505" ||
    /duplicate key value violates unique constraint/i.test(
      String(error?.message || ""),
    )
  );
}

function hasStoredMessageAttachments(row: any) {
  return Array.isArray(row?.metadata_json?.attachments);
}

function messageLikelyHasAttachments(row: any) {
  const hasAttachHeader = String(
    row?.raw_headers?.["x-ms-has-attach"] ||
      row?.raw_headers?.["x-has-attachment"] ||
      "",
  )
    .trim()
    .toLowerCase();

  if (hasAttachHeader === "yes" || hasAttachHeader === "true") {
    return true;
  }

  const contentType = String(row?.raw_headers?.["content-type"] || "")
    .trim()
    .toLowerCase();

  return contentType.includes("multipart/mixed");
}

// Strong refs to in-flight attachment-metadata backfills, so an un-awaited
// promise on the persistent Railway Node server isn't GC'd before it settles.
const pendingAttachmentBackfills = new Set<Promise<void>>();
// Threads whose attachment metadata was checked recently, so reopening one does
// not re-run an IMAP fetch for messages that simply have no attachments.
const attachmentBackfillCheckedAt = new Map<string, number>();
const ATTACHMENT_BACKFILL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Returns the subset of message rows that still need their attachment metadata
 * fetched from the provider (likely has attachments per headers, but nothing
 * stored in metadata_json.attachments yet, and addressable by provider id).
 */
function messageRowsNeedingAttachmentBackfill(messageRows: any[]): any[] {
  return (messageRows || []).filter(
    (row) =>
      row?.provider_message_id &&
      !hasStoredMessageAttachments(row) &&
      messageLikelyHasAttachments(row),
  );
}

/**
 * Backfill attachment metadata for the given messages OUT of the read hot path.
 *
 * Previously this ran synchronously inside getThreadDetailForUser, opening a
 * FRESH IMAP connection (TCP + TLS + LOGIN + SELECT) and downloading the full
 * raw MIME source PER MESSAGE, sequentially, on every thread open — the dominant
 * "opening an email is slow" cost. Now it (a) runs in the background so the
 * conversation renders immediately, and (b) fetches every pending message over a
 * SINGLE IMAP connection. Once persisted, the realtime/next-open path serves the
 * stored metadata with no IMAP at all. Failure-isolated: errors are logged and
 * leave the cheap (no-attachments-chip) view in place for a later retry.
 */
function backfillMessageAttachmentMetadataInBackground(
  mailbox: MailboxTransportRow,
  threadId: string,
  messageRows: any[],
): void {
  // Cheap pre-check on data the read path already has: if every message has
  // stored attachment metadata there is nothing to do and no query to run.
  const missing = (messageRows || []).filter(
    (row) => row?.provider_message_id && !hasStoredMessageAttachments(row),
  );
  if (missing.length === 0) {
    return;
  }

  // Opening the same thread repeatedly used to re-run this IMAP fetch every
  // time for messages that legitimately have no attachments. Once a thread has
  // been checked, skip it for a while.
  const lastChecked = attachmentBackfillCheckedAt.get(threadId) || 0;
  if (Date.now() - lastChecked < ATTACHMENT_BACKFILL_COOLDOWN_MS) {
    return;
  }
  attachmentBackfillCheckedAt.set(threadId, Date.now());

  const task = (async () => {
    try {
      const admin = getAdminClient();
      // Headers are excluded from the read path, so fetch them for the handful
      // of candidate rows to decide which really need an IMAP round trip.
      const { data: headerRows } = await admin
        .from("email_messages")
        .select("id,provider_message_id,metadata_json,raw_headers")
        .in(
          "id",
          missing.map((row) => row.id),
        );
      const pending = messageRowsNeedingAttachmentBackfill(headerRows || []);
      if (pending.length === 0) {
        return;
      }

      const fetched = await fetchMailboxMessagesByProviderMessageIds(
        mailbox,
        pending.map((row) => String(row.provider_message_id)),
      );

      for (const row of pending) {
        const refreshed = fetched.get(String(row.provider_message_id));
        if (!refreshed) {
          continue;
        }
        const nextMetadata = {
          ...(row.metadata_json || {}),
          attachments: refreshed.attachments,
        };
        await admin
          .from("email_messages")
          .update({ metadata_json: nextMetadata })
          .eq("id", row.id);
      }
    } catch (error) {
      console.error("Attachment metadata backfill failed", error);
    }
  })();

  pendingAttachmentBackfills.add(task);
  void task.finally(() => pendingAttachmentBackfills.delete(task));
}

// Request-scoped memoization. A single email API request fans out into many
// access checks (ensureThreadAccess -> ensureMailboxAccess, ensureProjectAccess,
// ensureOrganizationAccess, etc.), each of which previously re-queried
// user_organizations + profiles (and mailboxes/mailbox_members/projects).
// React's cache() dedupes these by argument within one server request, which
// collapses the dominant source of repeated auth/permission egress.
const getVisibleScope = cache(async function getVisibleScope(
  userId: string,
): Promise<VisibleScope> {
  const admin = getAdminClient();
  const [{ data: memberships }, { data: profile }] = await Promise.all([
    admin
      .from("user_organizations")
      .select("organization_id,is_owner")
      .eq("user_id", userId),
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);

  const orgMemberships =
    (memberships as Array<{
      organization_id: string;
      is_owner: boolean | null;
    }>) || [];

  return {
    orgMemberships,
    orgIds: orgMemberships.map((membership) => membership.organization_id),
    role: (profile?.role as string | null) || null,
  };
});

const getAccessibleMailboxRows = cache(async function getAccessibleMailboxRows(
  userId: string,
) {
  const admin = getAdminClient();
  const scope = await getVisibleScope(userId);
  const { data: mailboxes } = await admin
    .from("mailboxes")
    .select("*")
    .order("created_at");
  const { data: memberships } = await admin
    .from("mailbox_members")
    .select("*")
    .eq("user_id", userId);

  const membershipIds = new Set(
    (memberships || []).map((row: any) => String(row.mailbox_id)),
  );

  return (mailboxes || []).filter((mailbox: any) => {
    if (scope.role === "super_admin") return true;
    if (mailbox.owner_user_id === userId) return true;
    if (membershipIds.has(String(mailbox.id))) return true;
    if (mailbox.is_shared && mailbox.organization_id) {
      return scope.orgIds.includes(String(mailbox.organization_id));
    }
    return false;
  });
});

const getVisibleProjectsForUser = cache(async function getVisibleProjectsForUser(
  userId: string,
  organizationId?: string | null,
): Promise<ProjectOption[]> {
  const admin = getAdminClient();
  const scope = await getVisibleScope(userId);
  const { data: explicitMembershipRows } = await admin
    .from("user_projects")
    .select("project_id, projects!inner(organization_id)")
    .eq("user_id", userId);

  const explicitProjects = (explicitMembershipRows || []).map((row: any) => ({
    id: String(row.project_id),
    organization_id: String(row.projects.organization_id),
  }));

  const visibility = resolveVisibleProjectIds({
    orgMemberships: scope.orgMemberships,
    explicitProjects,
  });

  const { data: projects } = await admin
    .from("projects")
    .select("id,name,description,organization_id")
    .order("name");

  return (projects || []).filter((project: any) => {
    if (
      organizationId &&
      String(project.organization_id) !== String(organizationId)
    ) {
      return false;
    }
    return (
      visibility.fullyVisibleOrganizationIds.has(
        String(project.organization_id),
      ) || visibility.explicitProjectIds.has(String(project.id))
    );
  });
});

async function ensureMailboxAccess(userId: string, mailboxId: string) {
  const mailboxRows = await getAccessibleMailboxRows(userId);
  const mailbox = mailboxRows.find((row: any) => row.id === mailboxId);
  if (!mailbox) {
    throw new Error("Mailbox not found");
  }
  return mailbox;
}

async function ensureMailboxManage(userId: string, mailboxId: string) {
  const mailbox = await ensureMailboxAccess(userId, mailboxId);
  if (mailbox.owner_user_id === userId) return mailbox;

  const admin = getAdminClient();
  const [{ data: membership }, scope] = await Promise.all([
    admin
      .from("mailbox_members")
      .select("role")
      .eq("mailbox_id", mailboxId)
      .eq("user_id", userId)
      .maybeSingle(),
    getVisibleScope(userId),
  ]);

  const membershipRole = String(membership?.role || "");
  if (membershipRole === "triage" || membershipRole === "manager")
    return mailbox;
  if (mailbox.is_shared && mailbox.organization_id) {
    const isOwner = scope.orgMemberships.some(
      (row) =>
        row.organization_id === mailbox.organization_id &&
        (row.is_owner ||
          scope.role === "admin" ||
          scope.role === "super_admin"),
    );
    if (isOwner) return mailbox;
  }

  throw new Error("Mailbox management requires elevated access");
}

async function ensureProjectAccess(userId: string, projectId: string) {
  const projects = await getVisibleProjectsForUser(userId);
  const project = projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  return project;
}

async function ensureOrganizationAccess(
  userId: string,
  organizationId: string,
) {
  const scope = await getVisibleScope(userId);
  if (scope.role === "admin" || scope.role === "super_admin") {
    return;
  }

  if (!scope.orgIds.includes(organizationId)) {
    throw new Error("Organization not found");
  }
}

async function ensureThreadAccess(userId: string, threadId: string) {
  const admin = getAdminClient();
  const { data: thread } = await admin
    .from("email_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) {
    throw new Error("Email thread not found");
  }

  await ensureMailboxAccess(userId, String(thread.mailbox_id));
  return thread;
}

async function ensureReplyDraftAccess(userId: string, draftId: string) {
  const admin = getAdminClient();
  const { data: draft } = await admin
    .from("email_reply_drafts")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();

  if (!draft) {
    throw new Error("Reply draft not found");
  }

  await ensureThreadAccess(userId, String(draft.thread_id));
  return draft;
}

async function ensureOutboundDraftAccess(userId: string, draftId: string) {
  const admin = getAdminClient();
  const { data: draft } = await admin
    .from("email_outbound_drafts")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();

  if (!draft) {
    throw new Error("Outbound draft not found");
  }

  await ensureMailboxAccess(userId, String(draft.mailbox_id));
  return draft;
}

async function getLatestThreadMessage(threadId: string) {
  const admin = getAdminClient();
  const { data: latestMessage } = await admin
    .from("email_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("received_at", { ascending: false })
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return latestMessage;
}

function serializeRuleConditions(rule: Pick<EmailRule, "conditions">) {
  return JSON.stringify(
    [...rule.conditions]
      .map((condition) => ({
        field: condition.field,
        operator: condition.operator,
        value: condition.value.trim().toLowerCase(),
      }))
      .sort((a, b) =>
        `${a.field}:${a.operator}:${a.value}`.localeCompare(
          `${b.field}:${b.operator}:${b.value}`,
        ),
      ),
  );
}

async function findMatchingNeverSpamRule(params: {
  userId: string;
  mailboxId: string | null;
  conditions: EmailRule["conditions"];
}) {
  const rules = await listRulesForUser(params.userId);
  const targetConditions = serializeRuleConditions({
    conditions: params.conditions,
  });

  return (
    rules.find((rule) => {
      if (Boolean(rule.mailboxId) !== Boolean(params.mailboxId)) {
        return false;
      }

      if ((rule.mailboxId || null) !== (params.mailboxId || null)) {
        return false;
      }

      if (!rule.actions.some((action) => action.type === "never_spam")) {
        return false;
      }

      return serializeRuleConditions(rule) === targetConditions;
    }) || null
  );
}

async function ensureMailboxSummaryProfile(params: {
  userId: string;
  mailboxId: string;
  organizationId?: string | null;
  mailboxName: string;
  existingSummaryProfileId?: string | null;
}) {
  if (params.existingSummaryProfileId) {
    return params.existingSummaryProfileId;
  }

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("email_ai_profiles")
    .insert({
      organization_id: params.organizationId ?? null,
      mailbox_id: params.mailboxId,
      user_id: params.userId,
      name: `${params.mailboxName} Default`,
      summary_style: "action_first",
      instruction_text:
        "Summarize email in an action-first format, identify tone, and propose concrete tasks.",
      settings_json: {
        toneDetection: true,
        routeToProjects: true,
        generateTasks: true,
      },
      is_default: true,
    })
    .select()
    .single();

  if (!profile?.id) return null;

  await admin
    .from("mailboxes")
    .update({ summary_profile_id: profile.id })
    .eq("id", params.mailboxId);

  return profile.id;
}

async function upsertContact(
  mailbox: any,
  address: { email: string; name?: string | null },
) {
  const admin = getAdminClient();
  const normalizedEmail = address.email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data: linkedProfile } = await admin
    .from("profiles")
    .select("id,email,first_name,last_name")
    .eq("email", normalizedEmail)
    .maybeSingle();

  let query = admin
    .from("contacts")
    .select("*")
    .eq("email", normalizedEmail)
    .limit(1);
  if (mailbox.organization_id) {
    query = query.eq("organization_id", mailbox.organization_id);
  } else {
    query = query.is("organization_id", null);
  }

  const { data: existingContacts } = await query;
  const existing = existingContacts?.[0];

  if (existing) {
    return existing;
  }

  const { data: contact, error: insertError } = await admin
    .from("contacts")
    .insert({
      organization_id: mailbox.organization_id ?? null,
      profile_id: linkedProfile?.id ?? null,
      email: normalizedEmail,
      display_name:
        address.name ||
        (linkedProfile
          ? `${linkedProfile.first_name || ""} ${linkedProfile.last_name || ""}`.trim()
          : null),
    })
    .select()
    .single();

  if (insertError && isUniqueViolation(insertError)) {
    const retryQuery = mailbox.organization_id
      ? admin
          .from("contacts")
          .select("*")
          .eq("organization_id", mailbox.organization_id)
          .eq("email", normalizedEmail)
          .limit(1)
      : admin
          .from("contacts")
          .select("*")
          .is("organization_id", null)
          .eq("email", normalizedEmail)
          .limit(1);

    const { data: retriedContacts } = await retryQuery;
    return retriedContacts?.[0] ?? null;
  }
  if (insertError) {
    throw new Error(insertError.message || "Failed to store contact");
  }

  return contact;
}

/**
 * Chronological order for a thread's conversation entries. Outbound messages
 * have a null received_at (only sent_at), so a SQL `ORDER BY received_at` alone
 * sinks every reply to the bottom regardless of when it was sent. coerce sets
 * createdAt to received_at ?? sent_at ?? created_at, so sorting on it restores
 * true interleaved order between inbound and outbound.
 */
function compareConversationEntriesByTime(
  a: ConversationEntry,
  b: ConversationEntry,
) {
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return aTime - bTime;
}

/**
 * Resolve the thread an incoming/outgoing message belongs to WITHOUT creating
 * one. Matches first by RFC references (In-Reply-To / References pointing at a
 * message we already stored), then by the deterministic thread key. Returns
 * null when no existing thread matches. Outbound Sent-folder ingestion uses
 * this to attach replies only to conversations already in the inbox.
 */
async function findExistingThreadForMessage(mailbox: any, message: any) {
  const admin = getAdminClient();

  // Same Message-ID means the same email, so it belongs on whatever thread we
  // already filed it under — check this before anything else.
  //
  // Without it, sending yourself an email (or CC'ing your own address) produced
  // two threads: the composer creates one at send time with the Message-ID and
  // no provider uid, then the INBOX sync sees the delivered copy, fails to
  // match on References (a new email has none) or on thread_key, and starts a
  // second thread. The Sent-folder sync already deduped this way; the inbound
  // path did not.
  if (message.internetMessageId) {
    const { data: sameMessage } = await admin
      .from("email_messages")
      .select("thread_id")
      .eq("mailbox_id", mailbox.id)
      .eq("internet_message_id", message.internetMessageId)
      .limit(1)
      .maybeSingle();

    if (sameMessage?.thread_id) {
      const { data: sameThread } = await admin
        .from("email_threads")
        .select("id,origin")
        .eq("id", sameMessage.thread_id)
        .maybeSingle();
      if (sameThread?.id) return sameThread;
    }
  }

  const referenceIds = [
    message.inReplyTo,
    ...(message.references || []),
  ].filter(Boolean);

  if (referenceIds.length > 0) {
    const { data: referenced } = await admin
      .from("email_messages")
      .select("thread_id,internet_message_id")
      .in("internet_message_id", referenceIds);

    if (referenced && referenced.length > 0) {
      const { data: referencedThread } = await admin
        .from("email_threads")
        .select("id,origin")
        .eq("id", referenced[0].thread_id)
        .maybeSingle();

      if (referencedThread?.id) {
        return referencedThread;
      }
    }
  }

  const threadKey = buildThreadKey({
    mailboxId: mailbox.id,
    subject: message.subject,
    inReplyTo: message.inReplyTo,
    references: message.references,
    fromEmail: message.from?.[0]?.email || null,
  });

  const { data: existing } = await admin
    .from("email_threads")
    .select("id,origin")
    .eq("mailbox_id", mailbox.id)
    .eq("thread_key", threadKey)
    .maybeSingle();

  return existing?.id ? existing : null;
}

async function findThreadForMessage(mailbox: any, message: any) {
  const admin = getAdminClient();

  const matched = await findExistingThreadForMessage(mailbox, message);
  if (matched?.id) {
    return matched;
  }

  const threadKey = buildThreadKey({
    mailboxId: mailbox.id,
    subject: message.subject,
    inReplyTo: message.inReplyTo,
    references: message.references,
    fromEmail: message.from?.[0]?.email || null,
  });

  const threadPayload = {
    mailbox_id: mailbox.id,
    project_id: null,
    summary_profile_id: mailbox.summary_profile_id ?? null,
    owner_user_id: mailbox.owner_user_id,
    provider_thread_id: null,
    thread_key: threadKey,
    origin: "inbound",
    status: "active",
    classification: "unknown",
    resolution_state: "open",
    action_title: message.subject || "Untitled email",
    subject: message.subject || "Untitled email",
    normalized_subject: normalizeSubject(message.subject),
    preview_text: extractPlainTextPreview(message.bodyText, 240),
    is_unread: message.isUnread,
    latest_message_at:
      message.receivedAt || message.sentAt || new Date().toISOString(),
    latest_inbound_at:
      message.receivedAt || message.sentAt || new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: created, error: createError } = await admin
    .from("email_threads")
    .insert(threadPayload)
    .select()
    .single();

  if (createError && isUniqueViolation(createError)) {
    const { data: retriedExisting, error: retryError } = await admin
      .from("email_threads")
      .select("id,origin")
      .eq("mailbox_id", mailbox.id)
      .eq("thread_key", threadKey)
      .maybeSingle();

    if (retriedExisting?.id) {
      return retriedExisting;
    }
    throw new Error(retryError?.message || createError.message);
  }
  if (createError || !created?.id) {
    throw new Error(createError?.message || "Failed to create email thread");
  }

  return {
    id: created.id,
    origin: "inbound",
  };
}

async function persistParticipants(
  threadId: string,
  messageId: string,
  mailbox: any,
  grouped: Record<string, Array<{ email: string; name?: string | null }>>,
) {
  const admin = getAdminClient();
  for (const [participantRole, addresses] of Object.entries(grouped)) {
    for (const rawAddress of addresses) {
      // Defensive: some providers hand us a raw "Name <email>" string in the
      // email field with an empty name. Split it apart so we never persist a
      // participant that has neither a usable name nor email.
      const address = (() => {
        const email = (rawAddress.email ?? "").trim();
        const name = (rawAddress.name ?? "").trim() || null;
        if (email.includes("<") || (!name && email.includes(" "))) {
          const parsed = parseAddressString(email);
          if (parsed.email) {
            return { email: parsed.email, name: name || parsed.name || null };
          }
        }
        return { email: email.toLowerCase(), name };
      })();

      if (!address.email && !address.name) {
        continue;
      }

      const contact = await upsertContact(mailbox, address);
      const { data: linkedProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", address.email)
        .maybeSingle();

      await admin.from("email_participants").insert({
        thread_id: threadId,
        message_id: messageId,
        contact_id: contact?.id ?? null,
        profile_id: linkedProfile?.id ?? null,
        email_address: address.email,
        display_name: address.name ?? null,
        participant_role: participantRole,
      });
    }
  }
}

async function ingestMailboxMessage(mailbox: any, message: any) {
  const admin = getAdminClient();
  const { data: existing } = await admin
    .from("email_messages")
    .select("id,thread_id")
    .eq("mailbox_id", mailbox.id)
    .eq("provider_message_id", message.providerMessageId)
    .maybeSingle();

  if (existing?.id) {
    return {
      threadId: existing.thread_id as string,
      messageId: existing.id as string,
      inserted: false,
    };
  }

  const thread = await findThreadForMessage(mailbox, message);
  const threadId = String(thread.id);
  const senderContact = message.from?.[0]
    ? await upsertContact(mailbox, message.from[0])
    : null;

  const { data: senderProfile } = message.from?.[0]
    ? await admin
        .from("profiles")
        .select("id")
        .eq("email", message.from[0].email)
        .maybeSingle()
    : { data: null };

  const messagePayload = {
    thread_id: threadId,
    mailbox_id: mailbox.id,
    contact_id: senderContact?.id ?? null,
    profile_id: senderProfile?.id ?? null,
    direction: "inbound",
    provider_message_id: message.providerMessageId,
    internet_message_id: message.internetMessageId ?? null,
    in_reply_to_message_id: message.inReplyTo ?? null,
    subject: message.subject || null,
    body_text: message.bodyText || "",
    body_html: message.bodyHtml || null,
    sent_at: message.sentAt ?? null,
    received_at: message.receivedAt ?? null,
    raw_headers: message.rawHeaders || {},
    metadata_json: {
      from: message.from,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      replyTo: message.replyTo,
      isUnread: message.isUnread,
      attachments: message.attachments || [],
    },
  };

  const { data: inserted, error: insertError } = await admin
    .from("email_messages")
    .insert(messagePayload)
    .select()
    .single();

  if (insertError && isUniqueViolation(insertError)) {
    const { data: existingAfterConflict, error: retryError } = await admin
      .from("email_messages")
      .select("id,thread_id")
      .eq("mailbox_id", mailbox.id)
      .eq("provider_message_id", message.providerMessageId)
      .maybeSingle();

    if (existingAfterConflict?.id) {
      return {
        threadId: existingAfterConflict.thread_id as string,
        messageId: existingAfterConflict.id as string,
        inserted: false,
      };
    }

    throw new Error(retryError?.message || insertError.message);
  }

  if (insertError || !inserted) {
    throw new Error(
      insertError?.message || "Failed to store inbound email message",
    );
  }

  await persistParticipants(threadId, inserted.id, mailbox, {
    from: message.from || [],
    to: message.to || [],
    cc: message.cc || [],
    bcc: message.bcc || [],
    reply_to: message.replyTo || [],
  });

  // Never move a thread's recency markers BACKWARD. Provider messages arrive
  // out of order (backfills, re-syncs, batches not sorted by date), so writing
  // this message's timestamp unconditionally would clobber a newer value and
  // sink the thread in the latest_message_at-ordered inbox — leaving Forge's
  // order/position out of sync with the provider. Only advance forward, and
  // only refresh the newest-message fields (subject/preview/unread) when this
  // message is actually the newest one we've seen for the thread.
  const incomingTs =
    message.receivedAt || message.sentAt || new Date().toISOString();
  const { data: threadTimes } = await admin
    .from("email_threads")
    .select("latest_message_at,latest_inbound_at")
    .eq("id", threadId)
    .maybeSingle();

  const maxTs = (a: string | null | undefined, b: string) =>
    a && new Date(a).getTime() >= new Date(b).getTime() ? a : b;
  const isNewest =
    !threadTimes?.latest_message_at ||
    new Date(incomingTs).getTime() >=
      new Date(threadTimes.latest_message_at).getTime();

  const threadUpdate: Record<string, unknown> = {
    latest_message_at: maxTs(threadTimes?.latest_message_at, incomingTs),
    latest_inbound_at: maxTs(threadTimes?.latest_inbound_at, incomingTs),
    origin: thread.origin === "outbound" ? "mixed" : thread.origin || "inbound",
    updated_at: new Date().toISOString(),
  };
  if (isNewest) {
    threadUpdate.subject = message.subject || "Untitled email";
    threadUpdate.normalized_subject = normalizeSubject(message.subject);
    threadUpdate.preview_text = extractPlainTextPreview(message.bodyText, 240);
    // A genuinely newer inbound message on a thread we already knew about is a
    // new reply in the thread — mark the thread unread even if the provider had
    // already marked the message read (e.g. read in another client). Threads
    // being seen for the first time have no prior latest_message_at and fall
    // back to the provider's own read state, so a backfill isn't force-unread.
    const isNewInboundReply =
      Boolean(threadTimes?.latest_message_at) &&
      new Date(incomingTs).getTime() >
        new Date(threadTimes!.latest_message_at as string).getTime();
    threadUpdate.is_unread = isNewInboundReply ? true : message.isUnread;
  }

  await admin.from("email_threads").update(threadUpdate).eq("id", threadId);

  return { threadId, messageId: inserted.id as string, inserted: true };
}

/**
 * Ingest a message pulled from the provider's Sent folder as an OUTBOUND entry
 * on its conversation. This surfaces replies the user sent outside the app
 * (directly in Gmail / Apple Mail / etc.) in the threaded view.
 *
 * - Dedups by Message-ID first, which also merges with app-composed replies
 *   (those store internet_message_id but a null provider_message_id); when the
 *   provider echoes one back we just backfill its provider_message_id.
 * - Only attaches to threads that already exist locally; sent mail that doesn't
 *   belong to a known inbox conversation is skipped (returns null) so the Sent
 *   sync never floods the inbox with outbound-only threads.
 */
/**
 * Reconcile the mailbox's provider Drafts folder (e.g. Gmail's) into
 * email_outbound_drafts, so drafts composed outside the app appear on the
 * Drafts page.
 *
 * Full mirror of the (small) Drafts folder each sync: upsert every provider
 * draft by its `draft:<uid>` id, and delete Focus rows previously synced from
 * the provider whose uid is no longer present (edited or deleted in Gmail —
 * Gmail assigns a new uid when a draft is re-saved, so the stale row must go).
 * App-composed drafts (provider_message_id IS NULL) are never touched.
 */
async function syncMailboxProviderDrafts(mailbox: any) {
  const admin = getAdminClient();
  const transportMailbox = mailbox as MailboxTransportRow;

  const drafts = await fetchMailboxDraftMessages(transportMailbox, {
    limit: 50,
  });

  // Existing provider-synced rows for this mailbox, keyed by provider id. Fetched
  // once so each draft is a lookup, not a round trip. Explicit update-or-insert
  // rather than PostgREST upsert: the unique index is PARTIAL (WHERE
  // provider_message_id IS NOT NULL) and cannot serve as an ON CONFLICT arbiter,
  // so an upsert would error and the whole draft sync would be lost.
  const { data: existing } = await admin
    .from("email_outbound_drafts")
    .select("id,provider_message_id")
    .eq("mailbox_id", mailbox.id)
    .not("provider_message_id", "is", null);
  const existingByProviderId = new Map<string, string>();
  for (const row of existing || []) {
    if (row.provider_message_id) {
      existingByProviderId.set(row.provider_message_id, row.id);
    }
  }

  const seenProviderIds = new Set<string>();
  for (const draft of drafts) {
    seenProviderIds.add(draft.providerMessageId);
    const mapAddrs = (list: any[]) =>
      (list || []).map((a: any) => ({ email: a.email, name: a.name ?? null }));

    const fields = {
      status: "draft" as const,
      subject: draft.subject || "",
      content_text: draft.bodyText || "",
      content_html: draft.bodyHtml || null,
      to_json: mapAddrs(draft.to),
      cc_json: mapAddrs(draft.cc),
      bcc_json: mapAddrs(draft.bcc),
      internet_message_id: draft.internetMessageId ?? null,
      provider_folder_path: draft.folderPath,
      updated_at: new Date().toISOString(),
    };

    const existingId = existingByProviderId.get(draft.providerMessageId);
    if (existingId) {
      await admin
        .from("email_outbound_drafts")
        .update(fields)
        .eq("id", existingId);
    } else {
      await admin.from("email_outbound_drafts").insert({
        mailbox_id: mailbox.id,
        created_by_user_id: mailbox.owner_user_id ?? null,
        provider_message_id: draft.providerMessageId,
        ...fields,
      });
    }
  }

  const stale = (existing || [])
    .filter((row: any) => !seenProviderIds.has(row.provider_message_id))
    .map((row: any) => row.id);

  if (stale.length > 0) {
    await admin.from("email_outbound_drafts").delete().in("id", stale);
  }

  return { syncedDraftCount: drafts.length, removedDraftCount: stale.length };
}

async function ingestOutboundMailboxMessage(mailbox: any, message: any) {
  const admin = getAdminClient();

  if (message.internetMessageId) {
    const { data: existingByMid } = await admin
      .from("email_messages")
      .select("id,thread_id,provider_message_id")
      .eq("mailbox_id", mailbox.id)
      .eq("internet_message_id", message.internetMessageId)
      .maybeSingle();

    if (existingByMid?.id) {
      if (!existingByMid.provider_message_id && message.providerMessageId) {
        await admin
          .from("email_messages")
          .update({ provider_message_id: message.providerMessageId })
          .eq("id", existingByMid.id);
      }
      return {
        threadId: existingByMid.thread_id as string,
        messageId: existingByMid.id as string,
        inserted: false,
      };
    }
  }

  const { data: existingByUid } = await admin
    .from("email_messages")
    .select("id,thread_id")
    .eq("mailbox_id", mailbox.id)
    .eq("provider_message_id", message.providerMessageId)
    .maybeSingle();

  if (existingByUid?.id) {
    return {
      threadId: existingByUid.thread_id as string,
      messageId: existingByUid.id as string,
      inserted: false,
    };
  }

  const thread = await findExistingThreadForMessage(mailbox, message);
  if (!thread?.id) {
    return null;
  }
  const threadId = String(thread.id);
  const timestamp =
    message.sentAt || message.receivedAt || new Date().toISOString();

  const messagePayload = {
    thread_id: threadId,
    mailbox_id: mailbox.id,
    direction: "outbound",
    provider_message_id: message.providerMessageId,
    internet_message_id: message.internetMessageId ?? null,
    in_reply_to_message_id: message.inReplyTo ?? null,
    subject: message.subject || null,
    body_text: message.bodyText || "",
    body_html: message.bodyHtml || null,
    sent_at: timestamp,
    received_at: null,
    raw_headers: message.rawHeaders || {},
    metadata_json: {
      from: message.from,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      replyTo: message.replyTo,
      attachments: message.attachments || [],
    },
  };

  const { data: inserted, error: insertError } = await admin
    .from("email_messages")
    .insert(messagePayload)
    .select()
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      const { data: existingAfterConflict } = await admin
        .from("email_messages")
        .select("id,thread_id")
        .eq("mailbox_id", mailbox.id)
        .eq("provider_message_id", message.providerMessageId)
        .maybeSingle();
      if (existingAfterConflict?.id) {
        return {
          threadId: existingAfterConflict.thread_id as string,
          messageId: existingAfterConflict.id as string,
          inserted: false,
        };
      }
    }
    throw new Error(
      insertError.message || "Failed to store outbound email message",
    );
  }

  if (!inserted?.id) {
    throw new Error("Failed to store outbound email message");
  }

  await persistParticipants(threadId, inserted.id, mailbox, {
    from: message.from || [],
    to: message.to || [],
    cc: message.cc || [],
    bcc: message.bcc || [],
    reply_to: message.replyTo || [],
  });

  await admin
    .from("email_threads")
    .update({
      latest_message_at: timestamp,
      latest_outbound_at: timestamp,
      origin: thread.origin === "inbound" ? "mixed" : thread.origin || "mixed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  return { threadId, messageId: inserted.id as string, inserted: true };
}

function buildRuleContext(mailbox: any, message: any): EmailRuleContext {
  const senderEmail = String(
    message.contact_email || message.author_email || "",
  ).toLowerCase();
  const senderDomain = senderEmail.includes("@")
    ? senderEmail.split("@")[1]
    : "";
  const metadata = message.metadata_json || {};
  const participants = [
    ...(metadata.from || []),
    ...(metadata.to || []),
    ...(metadata.cc || []),
  ]
    .map((participant: any) => String(participant.email || "").toLowerCase())
    .filter(Boolean);

  return {
    senderEmail,
    senderDomain,
    subject: String(message.subject || ""),
    body: String(message.body_text || ""),
    mailbox: String(mailbox.email_address || ""),
    participants,
  };
}

function mapThreadToInboxItem(params: {
  row: any;
  mailbox: Mailbox | undefined;
  participants: InboxParticipant[];
  taskCount: number;
  projectIds?: string[];
  messageCount?: number;
  attachmentCount?: number;
}): InboxItem {
  // Full project association list: the primary project_id first (for back-compat
  // and as the default task target), then any additional links from the
  // email_thread_projects join table, de-duped.
  const primaryProjectId = params.row.project_id
    ? String(params.row.project_id)
    : null;
  const projectIds: string[] = [];
  if (primaryProjectId) projectIds.push(primaryProjectId);
  for (const id of params.projectIds || []) {
    const value = String(id);
    if (value && !projectIds.includes(value)) projectIds.push(value);
  }
  return {
    id: params.row.id,
    mailboxId: params.row.mailbox_id,
    mailboxName: params.mailbox?.name,
    mailboxEmailAddress: params.mailbox?.emailAddress,
    projectId: params.row.project_id ?? null,
    projectIds,
    ownerUserId: params.row.owner_user_id ?? null,
    summaryProfileId: params.row.summary_profile_id ?? null,
    status: params.row.status,
    classification: params.row.classification,
    resolutionState: params.row.resolution_state,
    actionTitle: params.row.action_title,
    subject: params.row.subject,
    normalizedSubject: params.row.normalized_subject ?? null,
    summaryText: params.row.summary_text ?? null,
    previewText: params.row.preview_text ?? null,
    actionConfidence: params.row.action_confidence ?? null,
    actionReason: params.row.action_reason ?? null,
    latestMessageAt: params.row.latest_message_at ?? null,
    latestInboundAt: params.row.latest_inbound_at ?? null,
    latestOutboundAt: params.row.latest_outbound_at ?? null,
    origin:
      params.row.origin === "outbound" || params.row.origin === "mixed"
        ? params.row.origin
        : "inbound",
    isUnread: Boolean(params.row.is_unread),
    isStarred: Boolean(params.row.is_starred),
    workDueDate: params.row.work_due_date ?? null,
    boomerangUntil: params.row.boomerang_until ?? null,
    boomerangTaskId: params.row.boomerang_task_id ?? null,
    workDueTime: params.row.work_due_time ?? null,
    needsProject: Boolean(params.row.needs_project),
    alwaysDelete: Boolean(params.row.always_delete),
    derivedTaskCount: params.taskCount,
    // Conversation length. Defaults to 1 — a thread always has at least its own
    // message, so the UI never shows 0.
    messageCount:
      params.messageCount && params.messageCount > 0 ? params.messageCount : 1,
    // Thread-wide attachment total for the list paperclip badge. Shipped in the
    // initial payload so the badge paints on first render instead of the client
    // lazy-fetching each thread.
    attachmentCount:
      params.attachmentCount && params.attachmentCount > 0
        ? params.attachmentCount
        : 0,
    matchedRuleIds: Array.isArray(params.row.analysis_json?.matchedRuleIds)
      ? params.row.analysis_json.matchedRuleIds
          .map((value: unknown) => String(value || "").trim())
          .filter(Boolean)
      : [],
    inboxTabId: params.row.inbox_tab_id ?? null,
    priority: (params.row.priority ?? null) as 1 | 2 | 3 | 4 | null,
    // Cached "AI decides" verdicts (see the ai_tab_verdicts_json migration).
    aiTabVerdicts:
      params.row.ai_tab_verdicts_json &&
      typeof params.row.ai_tab_verdicts_json === "object"
        ? (params.row.ai_tab_verdicts_json as Record<string, boolean>)
        : {},
    participants: params.participants,
    taskSuggestions: Array.isArray(params.row.task_suggestions_json)
      ? params.row.task_suggestions_json
      : [],
    createdAt: params.row.created_at,
    updatedAt: params.row.updated_at,
  };
}

const ACTIVE_REPLY_DRAFT_STATUSES = ["draft", "scheduled", "sending", "failed"];

function mapReplyAddressList(value: unknown): EmailReplyAddress[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => ({
      email: String((entry as any)?.email || "").trim(),
      name:
        typeof (entry as any)?.name === "string"
          ? String((entry as any).name).trim() || null
          : null,
    }))
    .filter((entry) => entry.email);
}

function coerceReplyDraft(
  row: any,
  extra?: Partial<EmailReplyDraft>,
): EmailReplyDraft {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    mailboxId: String(row.mailbox_id),
    projectId: row.project_id ? String(row.project_id) : null,
    createdByUserId: row.created_by_user_id
      ? String(row.created_by_user_id)
      : null,
    source: row.source === "ai" ? "ai" : "manual",
    status: row.status,
    replyMode:
      row.reply_mode === "internal_note" ? "internal_note" : "reply_all",
    subject: String(row.subject || ""),
    contentText: row.content_text ?? null,
    contentHtml: row.content_html ?? null,
    signatureText: row.signature_text ?? null,
    to: mapReplyAddressList(row.to_json),
    cc: mapReplyAddressList(row.cc_json),
    attachments: Array.isArray(row.attachments_json)
      ? row.attachments_json
      : [],
    scheduledFor: row.scheduled_for ?? null,
    sentAt: row.sent_at ?? null,
    lastError: row.last_error ?? null,
    contextSnapshot: row.context_snapshot_json ?? {},
    aiMetadata: row.ai_metadata_json ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

function coerceOutboundDraft(
  row: any,
  extra?: Partial<EmailOutboundDraft>,
): EmailOutboundDraft {
  return {
    id: String(row.id),
    threadId: row.thread_id ? String(row.thread_id) : null,
    mailboxId: String(row.mailbox_id),
    projectId: row.project_id ? String(row.project_id) : null,
    createdByUserId: row.created_by_user_id
      ? String(row.created_by_user_id)
      : null,
    status: row.status,
    subject: String(row.subject || ""),
    contentText: row.content_text ?? null,
    contentHtml: row.content_html ?? null,
    signatureText: row.signature_text ?? null,
    to: mapReplyAddressList(row.to_json),
    cc: mapReplyAddressList(row.cc_json),
    bcc: mapReplyAddressList(row.bcc_json),
    attachments: Array.isArray(row.attachments_json)
      ? row.attachments_json
      : [],
    scheduledFor: row.scheduled_for ?? null,
    sentAt: row.sent_at ?? null,
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

function normalizeAddressList(value: EmailReplyAddress[] | undefined) {
  return mapReplyAddressList(value || []);
}

function buildOutboundThreadKey(params: {
  mailboxId: string;
  subject?: string | null;
  primaryRecipientEmail?: string | null;
}) {
  return buildThreadKey({
    mailboxId: params.mailboxId,
    subject: params.subject,
    fromEmail: params.primaryRecipientEmail,
  });
}

function validateOutboundDraftForSend(draft: {
  subject?: string | null;
  content_text?: string | null;
  content_html?: string | null;
  to_json?: unknown;
}) {
  const to = mapReplyAddressList(draft.to_json);

  if (to.length === 0) {
    throw new Error("Add at least one To recipient.");
  }

  if (!String(draft.subject || "").trim()) {
    throw new Error("Add a subject before sending.");
  }

  if (
    !String(draft.content_html || "").trim() &&
    !String(draft.content_text || "").trim()
  ) {
    throw new Error("Add email content before sending.");
  }

  return { to };
}

async function getActiveReplyDraftForThread(threadId: string) {
  const admin = getAdminClient();
  const { data: row } = await admin
    .from("email_reply_drafts")
    .select("*")
    .eq("thread_id", threadId)
    .in("status", ACTIVE_REPLY_DRAFT_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return row ? coerceReplyDraft(row) : null;
}

function mapParticipantRow(row: any): InboxParticipant {
  // Normalize so raw "Name <email>" header strings that may have landed in
  // either column are split back into name/email — the inbox should never show
  // "Unknown sender" when any identifying info exists in the row.
  return normalizeParticipant({
    id: row.id,
    emailAddress: row.email_address ?? "",
    displayName: row.display_name ?? null,
    participantRole: row.participant_role,
    profileId: row.profile_id ?? null,
    contactId: row.contact_id ?? null,
  });
}

/**
 * Fetches every email_participants row for the given thread ids without
 * tripping Supabase's implicit 1000-row response cap. The inbox list view can
 * load hundreds of threads (3-4 participants each), so a single
 * `.in("thread_id", threadIds)` silently truncates — dropping "from" rows for
 * later threads and rendering them as "Unknown sender". We batch the thread ids
 * and page through each batch with `.range()` until it is exhausted.
 */
async function fetchParticipantRowsForThreads(
  admin: ReturnType<typeof getAdminClient>,
  threadIds: string[],
): Promise<any[]> {
  const THREAD_BATCH = 150;
  const PAGE_SIZE = 1000;
  const rows: any[] = [];

  for (let i = 0; i < threadIds.length; i += THREAD_BATCH) {
    const batch = threadIds.slice(i, i + THREAD_BATCH);
    let from = 0;
    // Page through this batch until a short page signals the end.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await admin
        .from("email_participants")
        .select("*")
        .in("thread_id", batch)
        .range(from, from + PAGE_SIZE - 1);
      const page = data || [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return rows;
}

function appendParticipant(
  map: Map<string, InboxParticipant[]>,
  key: string,
  participant: InboxParticipant,
) {
  const current = map.get(key) || [];
  const exists = current.some(
    (entry) =>
      entry.emailAddress === participant.emailAddress &&
      entry.participantRole === participant.participantRole &&
      entry.profileId === participant.profileId &&
      entry.contactId === participant.contactId,
  );

  if (!exists) {
    current.push(participant);
    map.set(key, current);
  }
}

async function listMailboxPushRecipientIds(mailbox: any) {
  const admin = getAdminClient();
  const recipientIds = new Set<string>();

  if (mailbox.owner_user_id) {
    recipientIds.add(String(mailbox.owner_user_id));
  }

  const [{ data: memberRows }, { data: orgRows }] = await Promise.all([
    admin
      .from("mailbox_members")
      .select("user_id")
      .eq("mailbox_id", mailbox.id),
    mailbox.is_shared && mailbox.organization_id
      ? admin
          .from("user_organizations")
          .select("user_id")
          .eq("organization_id", mailbox.organization_id)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  [...(memberRows || []), ...(orgRows || [])].forEach((row: any) => {
    if (row?.user_id) {
      recipientIds.add(String(row.user_id));
    }
  });

  return Array.from(recipientIds);
}

// Mirrors provider-side archiving: any triage-visible thread whose inbound
// messages have all left the synced folder (e.g. archived in Gmail) is moved
// to 'archived' here too, so the app inbox only shows what's in the provider
// inbox. Threads already quarantined/deleted/resolved are left untouched.
async function mirrorProviderFolderState(params: {
  mailboxId: string;
  mailbox: MailboxTransportRow;
}) {
  const admin = getAdminClient();

  let folderUids: string[];
  try {
    folderUids = await fetchMailboxFolderUids(params.mailbox);
  } catch {
    // Non-fatal: mirroring is best-effort; the next sync retries.
    return { archivedThreadCount: 0 };
  }
  const presentUids = new Set(folderUids);

  // SAFETY: an empty INBOX read is almost always a transient IMAP hiccup, not a
  // genuinely empty inbox. Acting on it archived ~900 threads in one bad sync.
  // Treat empty as "unknown" and do nothing this pass — never archive the whole
  // inbox on a single suspicious read.
  if (presentUids.size === 0) {
    console.warn(
      "[email] mirrorProviderFolderState: INBOX returned 0 uids — skipping archive/restore this pass",
    );
    return { archivedThreadCount: 0, restoredThreadCount: 0 };
  }

  // RESTORE (self-heal): a thread whose inbound message is back in the INBOX
  // must be active, even if a previous bad pass archived it. This is the inverse
  // of the archive rule and is what recovers the mass-archive damage on the next
  // sync. Bounded to threads that actually have a provider message id.
  const { data: archivedRows } = await admin
    .from("email_threads")
    .select("id,project_id")
    .eq("mailbox_id", params.mailboxId)
    .eq("status", "archived");
  const archivedIds = (archivedRows ?? []).map((row: any) => String(row.id));
  const projectByThread = new Map<string, string | null>(
    (archivedRows ?? []).map((row: any) => [
      String(row.id),
      row.project_id ?? null,
    ]),
  );
  const restoreChunk = 100;
  const toRestore: string[] = [];
  for (let i = 0; i < archivedIds.length; i += restoreChunk) {
    const chunk = archivedIds.slice(i, i + restoreChunk);
    const { data: msgRows } = await admin
      .from("email_messages")
      .select("thread_id,provider_message_id")
      .eq("mailbox_id", params.mailboxId)
      .eq("direction", "inbound")
      .not("provider_message_id", "is", null)
      .in("thread_id", chunk);
    const present = new Set<string>();
    (msgRows ?? []).forEach((row: any) => {
      if (presentUids.has(String(row.provider_message_id || ""))) {
        present.add(String(row.thread_id));
      }
    });
    for (const id of chunk) if (present.has(id)) toRestore.push(id);
  }
  for (let i = 0; i < toRestore.length; i += restoreChunk) {
    const chunk = toRestore.slice(i, i + restoreChunk);
    // active when it has a project, else needs_project — matching how a freshly
    // ingested inbox thread is classified.
    const withProject = chunk.filter((id) => projectByThread.get(id));
    const withoutProject = chunk.filter((id) => !projectByThread.get(id));
    if (withProject.length > 0) {
      await admin
        .from("email_threads")
        .update({ status: "active" })
        .in("id", withProject);
    }
    if (withoutProject.length > 0) {
      await admin
        .from("email_threads")
        .update({ status: "needs_project", needs_project: true })
        .in("id", withoutProject);
    }
  }
  const restoredThreadCount = toRestore.length;

  // Threads Forge itself filed under a category label are deliberately no
  // longer in the synced folder — that removal IS the feature. Without this
  // guard the very next sync would read their absence as "the user archived it
  // in Gmail" and archive them here too, yanking them out of the tab the user
  // just filed them into.
  const { data: threadRows } = await admin
    .from("email_threads")
    .select("id")
    .eq("mailbox_id", params.mailboxId)
    .is("provider_label_synced_at", null)
    .in("status", ["active", "needs_project"]);

  const threadIds = (threadRows ?? []).map((row: any) => String(row.id));
  if (threadIds.length === 0) {
    return { archivedThreadCount: 0 };
  }

  // A thread is still "in the inbox" when at least one of its inbound
  // messages is still present in the synced folder.
  const stillPresent = new Set<string>();
  const chunkSize = 100;
  for (let i = 0; i < threadIds.length; i += chunkSize) {
    const chunk = threadIds.slice(i, i + chunkSize);
    const { data: messageRows } = await admin
      .from("email_messages")
      .select("thread_id,provider_message_id")
      .eq("mailbox_id", params.mailboxId)
      .eq("direction", "inbound")
      .not("provider_message_id", "is", null)
      .in("thread_id", chunk);
    (messageRows ?? []).forEach((row: any) => {
      if (presentUids.has(String(row.provider_message_id || ""))) {
        stillPresent.add(String(row.thread_id));
      }
    });
  }

  const departedThreadIds = threadIds.filter(
    (id: string) => !stillPresent.has(id),
  );
  if (departedThreadIds.length === 0) {
    return { archivedThreadCount: 0, restoredThreadCount };
  }

  // SAFETY CAP: a single sync marking a large share of the inbox as "departed"
  // is far more likely a partial/stale INBOX read than the user archiving
  // hundreds of emails at once. Skip archiving in that case — a missed archive
  // self-corrects on the next healthy sync, but a wrongful mass-archive does
  // not. The cap only trips on both a big absolute count and a big fraction, so
  // small/normal inboxes clearing out are unaffected.
  const departedFraction = departedThreadIds.length / threadIds.length;
  if (departedThreadIds.length > 25 && departedFraction > 0.5) {
    console.warn(
      `[email] mirrorProviderFolderState: ${departedThreadIds.length}/${threadIds.length} threads absent from INBOX — refusing to mass-archive (suspected partial read)`,
    );
    return { archivedThreadCount: 0, restoredThreadCount, skippedMassArchive: true };
  }

  for (let i = 0; i < departedThreadIds.length; i += chunkSize) {
    const chunk = departedThreadIds.slice(i, i + chunkSize);
    await admin
      .from("email_threads")
      .update({ status: "archived", is_unread: false })
      .in("id", chunk);
  }

  return { archivedThreadCount: departedThreadIds.length, restoredThreadCount };
}

async function syncMailboxThreadReadStates(params: {
  mailboxId: string;
  mailbox: MailboxTransportRow;
  providerMessageIds?: string[];
}) {
  const admin = getAdminClient();
  const providerMessageIds = (params.providerMessageIds || []).filter(Boolean);
  let query = admin
    .from("email_messages")
    .select("thread_id,provider_message_id")
    .eq("mailbox_id", params.mailboxId)
    .not("provider_message_id", "is", null);

  if (providerMessageIds.length > 0) {
    query = query.in("provider_message_id", providerMessageIds);
  } else {
    query = query.order("created_at", { ascending: false }).limit(250);
  }

  const { data: messageRows } = await query;

  if (!messageRows || messageRows.length === 0) {
    await admin
      .from("email_threads")
      .update({ is_unread: false })
      .eq("mailbox_id", params.mailboxId);
    return;
  }

  const threadIdByProviderMessageId = new Map<string, string>();
  const unreadByThreadId = new Map<string, boolean>();

  (messageRows as any[]).forEach((row) => {
    const threadId = String(row.thread_id || "");
    const providerMessageId = String(row.provider_message_id || "");

    if (!threadId || !providerMessageId) {
      return;
    }

    threadIdByProviderMessageId.set(providerMessageId, threadId);
    unreadByThreadId.set(threadId, false);
  });

  const readStates = await fetchMailboxMessageReadStates(
    params.mailbox,
    Array.from(threadIdByProviderMessageId.keys()),
  );

  readStates.forEach((state) => {
    const threadId = threadIdByProviderMessageId.get(state.providerMessageId);

    if (threadId && state.isUnread) {
      unreadByThreadId.set(threadId, true);
    }
  });

  await Promise.all(
    Array.from(unreadByThreadId.entries()).map(([threadId, isUnread]) =>
      admin
        .from("email_threads")
        .update({ is_unread: isUnread })
        .eq("id", threadId),
    ),
  );
}

async function sendNewEmailPushNotifications(params: {
  mailbox: any;
  thread: any;
  message: any;
  messageId: string;
  hadPreviousSync: boolean;
}) {
  if (!params.thread?.id) {
    return { attempted: 0, delivered: 0 };
  }

  if (
    !shouldSendEmailPushNotification({
      hadPreviousSync: params.hadPreviousSync,
      status: params.thread?.status ?? null,
      classification: params.thread?.classification ?? null,
      alwaysDelete: params.thread?.always_delete ?? false,
    })
  ) {
    return { attempted: 0, delivered: 0 };
  }

  if (!hasApnsConfiguration()) {
    return { attempted: 0, delivered: 0 };
  }

  const recipientIds = await listMailboxPushRecipientIds(params.mailbox);
  if (recipientIds.length === 0) {
    return { attempted: 0, delivered: 0 };
  }

  const admin = getAdminClient();
  const { data: devices } = await admin
    .from("mobile_push_devices")
    .select("*")
    .in("user_id", recipientIds)
    .in("platform", ["ios", "macos"])
    .eq("is_active", true);

  if (!devices || devices.length === 0) {
    return { attempted: 0, delivered: 0 };
  }

  const sender = params.message.from?.[0] || null;
  const alert = buildEmailPushNotificationContent({
    mailboxName:
      params.mailbox.display_name ||
      params.mailbox.name ||
      params.mailbox.email_address,
    mailboxEmailAddress: params.mailbox.email_address,
    senderName: sender?.name ?? null,
    senderEmail: sender?.email ?? null,
    subject: params.message.subject ?? params.thread?.subject ?? null,
  });

  let delivered = 0;
  const now = new Date().toISOString();

  for (const device of devices as any[]) {
    const pushToken = String(device.push_token || "").trim();
    const topic = String(device.bundle_id || "").trim();
    if (!pushToken || !topic) {
      continue;
    }

    const result = await sendApnsNotification({
      deviceToken: pushToken,
      topic,
      environment: device.environment === "sandbox" ? "sandbox" : "production",
      collapseId: String(params.thread.id),
      payload: {
        aps: {
          alert,
          sound: "default",
          "thread-id": String(params.thread.id),
        },
        type: "email_message_received",
        threadId: String(params.thread.id),
        mailboxId: String(params.mailbox.id),
        messageId: params.messageId,
        subject: params.message.subject ?? null,
        senderEmail: sender?.email ?? null,
      },
    });

    if (result.ok) {
      delivered += 1;
      await admin
        .from("mobile_push_devices")
        .update({
          last_notified_at: now,
          last_error_at: null,
          last_error_message: null,
        })
        .eq("id", device.id);
      continue;
    }

    if (result.status === 0) {
      return { attempted: 0, delivered: 0 };
    }

    const nextState: Record<string, unknown> = {
      last_error_at: now,
      last_error_message:
        result.reason || result.responseText || "Push delivery failed.",
    };

    if (isApnsPermanentFailure(result)) {
      nextState.is_active = false;
    }

    await admin
      .from("mobile_push_devices")
      .update(nextState)
      .eq("id", device.id);
  }

  return {
    attempted: devices.length,
    delivered,
  };
}

export async function suggestRecipients(params: {
  userId: string;
  query?: string | null;
  limit?: number;
}): Promise<Array<{ email: string; name: string | null; count: number }>> {
  const admin = getAdminClient();
  const accessibleMailboxRows = await getAccessibleMailboxRows(params.userId);
  const mailboxIds = accessibleMailboxRows.map((row: any) => String(row.id));
  const limit =
    typeof params.limit === "number" && params.limit > 0
      ? Math.floor(params.limit)
      : 8;

  if (mailboxIds.length === 0) {
    return [];
  }

  const MESSAGE_CAP = 2000;
  const [{ data: messageRows }, { data: draftRows }] = await Promise.all([
    admin
      // Message recipients live inside metadata_json ({to,cc,from,bcc}); the
      // old to_json/cc_json/from_json columns never existed here, so this query
      // returned nothing and message-derived suggestions silently vanished.
      .from("email_messages")
      .select("metadata_json")
      .in("mailbox_id", mailboxIds)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_CAP),
    admin
      .from("email_outbound_drafts")
      .select("to_json,cc_json,bcc_json")
      .in("mailbox_id", mailboxIds)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_CAP),
  ]);

  const aggregates = new Map<
    string,
    { email: string; name: string | null; count: number }
  >();

  const ingestAddressList = (value: unknown) => {
    for (const address of mapReplyAddressList(value)) {
      const email = address.email.trim().toLowerCase();
      if (!email) {
        continue;
      }
      const existing = aggregates.get(email);
      if (existing) {
        existing.count += 1;
        if (!existing.name && address.name) {
          existing.name = address.name;
        }
      } else {
        aggregates.set(email, {
          email,
          name: address.name || null,
          count: 1,
        });
      }
    }
  };

  for (const row of (messageRows || []) as any[]) {
    const meta = row.metadata_json || {};
    ingestAddressList(meta.to);
    ingestAddressList(meta.cc);
    ingestAddressList(meta.from);
  }
  for (const row of (draftRows || []) as any[]) {
    ingestAddressList(row.to_json);
    ingestAddressList(row.cc_json);
    ingestAddressList(row.bcc_json);
  }

  // Merge in saved contacts (personal + org-shared) so the address book is suggestable
  // even for people the user has not emailed yet. Existing correspondents keep their
  // frequency-based ranking; contacts only seen here get a base count of 1.
  try {
    const contactAddresses = await getContactAddressesForUser(params.userId);
    for (const address of contactAddresses) {
      const email = address.email.trim().toLowerCase();
      if (!email) continue;
      const existing = aggregates.get(email);
      if (existing) {
        if (!existing.name && address.name) existing.name = address.name;
      } else {
        aggregates.set(email, { email, name: address.name || null, count: 1 });
      }
    }
  } catch {
    // Non-fatal: fall back to message/draft-derived suggestions only.
  }

  const trimmedQuery = (params.query || "").trim().toLowerCase();
  let results = Array.from(aggregates.values());

  if (trimmedQuery) {
    results = results.filter(
      (entry) =>
        entry.email.includes(trimmedQuery) ||
        (entry.name ? entry.name.toLowerCase().includes(trimmedQuery) : false),
    );
  }

  results.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.email.localeCompare(b.email);
  });

  return results.slice(0, limit);
}

export async function listMailboxesForUser(userId: string): Promise<Mailbox[]> {
  const admin = getAdminClient();
  const rows = await getAccessibleMailboxRows(userId);
  const mailboxIds = rows.map((row: any) => row.id);
  let membersByMailbox = new Map<string, Mailbox["members"]>();

  if (mailboxIds.length > 0) {
    const { data: membershipRows } = await admin
      .from("mailbox_members")
      .select(
        "mailbox_id,user_id,role,profiles!inner(first_name,last_name,email)",
      )
      .in("mailbox_id", mailboxIds);

    membersByMailbox = ((membershipRows || []) as any[]).reduce(
      (map: Map<string, Mailbox["members"]>, row: any) => {
        const current = map.get(String(row.mailbox_id)) || [];
        current.push({
          userId: row.user_id,
          role: row.role,
          name:
            `${row.profiles.first_name || ""} ${row.profiles.last_name || ""}`.trim() ||
            row.profiles.email,
          email: row.profiles.email,
        });
        map.set(String(row.mailbox_id), current);
        return map;
      },
      new Map<string, Mailbox["members"]>(),
    );
  }

  return rows.map((row: any) =>
    coerceMailbox(row, membersByMailbox.get(String(row.id)) || []),
  );
}

export type MailboxStorageStat = {
  mailboxId: string;
  label: string;
  used: number;
  total: number;
};

// Per-mailbox storage-quota cache (IMAP QUOTA is slow + rate-limited), keyed by
// mailbox id, refreshed at most once per hour.
const STORAGE_CACHE_TTL_MS = 60 * 60 * 1000;
const mailboxStorageCache = new Map<
  string,
  { stat: MailboxStorageStat | null; fetchedAt: number }
>();

/**
 * Returns per-mailbox storage usage for every mailbox the user can access that
 * exposes an IMAP QUOTA. Mailboxes without quota data are omitted. Cached
 * server-side for one hour per mailbox.
 */
export async function getMailboxStorageStatsForUser(
  userId: string,
): Promise<MailboxStorageStat[]> {
  const rows = await getAccessibleMailboxRows(userId);
  const now = Date.now();

  const results = await Promise.all(
    rows.map(async (row: any) => {
      const mailboxId = String(row.id);
      const cached = mailboxStorageCache.get(mailboxId);
      if (cached && now - cached.fetchedAt < STORAGE_CACHE_TTL_MS) {
        return cached.stat;
      }

      let stat: MailboxStorageStat | null = null;
      try {
        const quota = await fetchMailboxStorageQuota(
          row as MailboxTransportRow,
        );
        if (quota) {
          stat = {
            mailboxId,
            label: row.email_address || row.display_name || "Mailbox",
            used: quota.used,
            total: quota.total,
          };
        }
      } catch {
        stat = null;
      }

      mailboxStorageCache.set(mailboxId, { stat, fetchedAt: now });
      return stat;
    }),
  );

  return results.filter((stat): stat is MailboxStorageStat => stat !== null);
}

export async function listSummaryProfilesForUser(
  userId: string,
): Promise<SummaryProfile[]> {
  const admin = getAdminClient();
  const accessibleMailboxRows = await getAccessibleMailboxRows(userId);
  const scope = await getVisibleScope(userId);
  const mailboxIds = accessibleMailboxRows.map((row: any) => row.id);
  const queries = [];

  if (mailboxIds.length > 0) {
    queries.push(
      admin.from("email_ai_profiles").select("*").in("mailbox_id", mailboxIds),
    );
  }
  if (scope.orgIds.length > 0) {
    queries.push(
      admin
        .from("email_ai_profiles")
        .select("*")
        .in("organization_id", scope.orgIds),
    );
  }
  queries.push(
    admin.from("email_ai_profiles").select("*").eq("user_id", userId),
  );

  const results = await Promise.all(queries);
  const merged = new Map<string, SummaryProfile>();
  results.forEach((result) => {
    (result.data || []).forEach((row: any) => {
      merged.set(String(row.id), coerceSummaryProfile(row));
    });
  });

  if (merged.size === 0) {
    const fallback = {
      id: "default",
      user_id: userId,
      organization_id: null,
      mailbox_id: null,
      name: "Action First",
      summary_style: "action_first",
      instruction_text:
        "Summaries should lead with the next concrete action, then note blockers and participant tone.",
      settings_json: {
        toneDetection: true,
        routeToProjects: true,
        generateTasks: true,
      },
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return [coerceSummaryProfile(fallback)];
  }

  return Array.from(merged.values()).sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault),
  );
}

export async function listRulesForUser(userId: string): Promise<EmailRule[]> {
  const admin = getAdminClient();
  const accessibleMailboxRows = await getAccessibleMailboxRows(userId);
  const scope = await getVisibleScope(userId);
  const mailboxIds = accessibleMailboxRows.map((row: any) => row.id);

  const results = await Promise.all([
    mailboxIds.length > 0
      ? admin.from("email_rules").select("*").in("mailbox_id", mailboxIds)
      : Promise.resolve({ data: [] as any[] }),
    scope.orgIds.length > 0
      ? admin
          .from("email_rules")
          .select("*")
          .in("organization_id", scope.orgIds)
      : Promise.resolve({ data: [] as any[] }),
    admin.from("email_rules").select("*").eq("user_id", userId),
  ]);

  const merged = new Map<string, EmailRule>();
  results.forEach((result) => {
    (result.data || []).forEach((row: any) => {
      merged.set(String(row.id), coerceRule(row));
    });
  });

  return Array.from(merged.values()).sort((a, b) => a.priority - b.priority);
}

export async function getRuleStatsForUser(userId: string) {
  const rules = await listRulesForUser(userId);
  return {
    active: rules.filter((rule) => rule.isActive).length,
    quarantine: rules.filter((rule) =>
      rule.actions.some((action) => action.type === "quarantine"),
    ).length,
    alwaysDelete: rules.filter((rule) =>
      rule.actions.some((action) => action.type === "always_delete"),
    ).length,
  };
}

// Thread columns matched by a free-text inbox search. Keep aligned with the
// fields a human scans when looking for a thread.
const SEARCH_THREAD_COLUMNS = [
  "subject",
  "normalized_subject",
  "preview_text",
  "summary_text",
  "action_title",
] as const;

/**
 * Split a free-text search query into individual terms (AND semantics).
 * Strips PostgREST `.or()` filter metacharacters (commas, parens, percent,
 * backslash, asterisk) that would otherwise break the generated filter string
 * or be interpreted as wildcards. Pure helper — unit tested.
 */
export function parseInboxSearchTerms(query: string): string[] {
  if (!query) return [];
  return query
    .split(/\s+/)
    .map((term) => term.replace(/[,()%*\\]/g, "").trim())
    .filter((term) => term.length > 0);
}

/**
 * Build the PostgREST `.or()` filter expression that matches a single term
 * against every searchable thread column via ILIKE. Pure helper — unit tested.
 */
export function buildThreadSearchOrFilter(term: string): string {
  return SEARCH_THREAD_COLUMNS.map(
    (column) => `${column}.ilike.%${term}%`,
  ).join(",");
}

/**
 * Resolve the set of thread ids (within the user's accessible mailboxes) that
 * match a free-text search query. A thread matches a term if any searchable
 * thread column ILIKEs it OR any of its participants' display name / email
 * address ILIKEs it. Multi-word queries use AND-of-terms: a thread must match
 * EVERY term (across the combined searchable surface) to be included.
 *
 * PostgREST cannot easily OR a thread-column filter against a participant
 * subquery, so each term is resolved in two reads (threads + participants) and
 * the id sets are unioned; the per-term union sets are then intersected to get
 * the AND-of-terms result.
 */
async function resolveSearchThreadIds(
  admin: ReturnType<typeof getAdminClient>,
  mailboxIds: string[],
  terms: string[],
): Promise<string[]> {
  let intersection: Set<string> = new Set<string>();

  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i];
    const [{ data: threadMatches }, { data: participantMatches }] =
      await Promise.all([
        admin
          .from("email_threads")
          .select("id")
          .in("mailbox_id", mailboxIds)
          .or(buildThreadSearchOrFilter(term)),
        // email_participants has no mailbox_id column, so match participants
        // globally here; the final thread query re-scopes to the user's
        // mailboxes (`.in("mailbox_id", mailboxIds)` + `.in("id", matchedIds)`),
        // so cross-mailbox thread ids can't leak into the result.
        admin
          .from("email_participants")
          .select("thread_id")
          .or(`display_name.ilike.%${term}%,email_address.ilike.%${term}%`),
      ]);

    const termSet = new Set<string>();
    ((threadMatches || []) as any[]).forEach((row) =>
      termSet.add(String(row.id)),
    );
    ((participantMatches || []) as any[]).forEach((row) =>
      termSet.add(String(row.thread_id)),
    );

    if (i === 0) {
      intersection = termSet;
    } else {
      intersection = new Set<string>(
        Array.from(intersection).filter((id) => termSet.has(id)),
      );
    }

    // Early-out: once the running intersection is empty, no thread can match.
    if (intersection.size === 0) {
      return [];
    }
  }

  return Array.from(intersection);
}

export async function listInboxItemsForUser(
  userId: string,
  options: {
    status?: string;
    mailboxId?: string;
    projectId?: string;
    search?: string;
  } = {},
) {
  const admin = getAdminClient();
  const mailboxes = await listMailboxesForUser(userId);
  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
  if (mailboxIds.length === 0) {
    return [];
  }

  // Server-side search resolves matching thread ids across the WHOLE mailbox
  // set (not just the recent-200 window) so a query finds matches regardless of
  // recency. We then fetch the LIST_THREAD_COLUMNS rows for those ids, still
  // scoped to the user's mailboxes and ordered by latest_message_at desc.
  const searchTerms = parseInboxSearchTerms((options.search || "").trim());
  const isSearching = searchTerms.length > 0;
  let searchThreadIds: string[] = [];
  if (isSearching) {
    searchThreadIds = await resolveSearchThreadIds(
      admin,
      mailboxIds,
      searchTerms,
    );
    if (searchThreadIds.length === 0) {
      return [];
    }
  }

  // Explicit column list: only the fields mapThreadToInboxItem actually reads
  // for the list view. This trims wire/egress vs `select("*")`. NOTE: the two
  // heavy JSON columns (analysis_json, task_suggestions_json) ARE consumed by
  // the mapper (matchedRuleIds + taskSuggestions), so they must stay. Any
  // email_threads column NOT in this list is intentionally not fetched for the
  // list view. Keep this in sync with mapThreadToInboxItem.
  const LIST_THREAD_COLUMNS =
    "id,mailbox_id,project_id,owner_user_id,summary_profile_id,status," +
    "classification,resolution_state,action_title,subject,normalized_subject," +
    "summary_text,preview_text,action_confidence,action_reason," +
    "latest_message_at,latest_inbound_at,latest_outbound_at,origin,is_unread," +
    "is_starred,work_due_date,work_due_time,needs_project,always_delete," +
    "boomerang_until,boomerang_task_id,inbox_tab_id,ai_tab_verdicts_json," +
    "priority," +
    "analysis_json,task_suggestions_json,created_at,updated_at";

  // Cap the result set: the UI paginates client-side at 50/page, so 200 keeps
  // several pages of the most-recent threads without dragging full history.
  // When searching, this caps the matched set (newest 200 matches) instead.
  const buildThreadQuery = () => {
    let query = admin
      .from("email_threads")
      .select(LIST_THREAD_COLUMNS)
      .in("mailbox_id", mailboxIds)
      .order("latest_message_at", { ascending: false })
      .limit(200);

    // When searching, restrict to the matched thread ids (resolved across the
    // full mailbox above). The mailbox scope + ordering + 200 cap still apply.
    if (isSearching) {
      query = query.in("id", searchThreadIds);
    }

    if (options.status) {
      query = query.eq("status", options.status);
    }
    if (options.mailboxId) {
      query = query.eq("mailbox_id", options.mailboxId);
    }
    if (options.projectId) {
      query = query.eq("project_id", options.projectId);
    }
    return query;
  };

  // The Sent folder filters this same snapshot down to outbound/mixed threads
  // client-side. Sent mail is a small slice of a busy mailbox, so the general
  // 200-thread window buried nearly all of it — 50 sent threads existed but
  // only the 10 newer than the window's cutoff were reachable. A second window
  // scoped to outbound/mixed gives Sent its own depth; the merge is by id, so
  // threads in both windows appear once and every other folder is unchanged.
  const [generalResult, outboundResult] = await Promise.all([
    buildThreadQuery(),
    buildThreadQuery().in("origin", ["outbound", "mixed"]),
  ]);

  const threadsById = new Map<string, any>();
  for (const row of [
    ...((generalResult.data as any[] | null) || []),
    ...((outboundResult.data as any[] | null) || []),
  ]) {
    if (row?.id && !threadsById.has(String(row.id))) {
      threadsById.set(String(row.id), row);
    }
  }

  let threads = Array.from(threadsById.values()).sort((left, right) =>
    String(right.latest_message_at || "").localeCompare(
      String(left.latest_message_at || ""),
    ),
  );
  if (threads.length === 0) {
    return [];
  }

  // Boomerang: hide threads that are still boomeranged — until their date/time
  // passes, or until their linked task is completed. Expired date-boomerangs are
  // cleared lazily so the thread returns cleanly.
  {
    const nowMs = Date.now();
    const boomerangTaskIds = Array.from(
      new Set(
        threads
          .map((t: any) => t.boomerang_task_id)
          .filter((id: any): id is string => Boolean(id)),
      ),
    );
    const completedTaskIds = new Set<string>();
    if (boomerangTaskIds.length > 0) {
      const { data: taskRows } = await admin
        .from("tasks")
        .select("id,completed")
        .in("id", boomerangTaskIds);
      for (const row of (taskRows || []) as any[]) {
        if (row.completed) completedTaskIds.add(String(row.id));
      }
    }
    const expiredDateThreadIds: string[] = [];
    const completedTaskThreadIds: string[] = [];
    threads = threads.filter((t: any) => {
      if (t.boomerang_until) {
        if (new Date(t.boomerang_until).getTime() > nowMs) return false; // still hidden
        expiredDateThreadIds.push(t.id); // due — reveal + clear below
      }
      if (t.boomerang_task_id) {
        if (!completedTaskIds.has(String(t.boomerang_task_id))) return false; // task not done
        completedTaskThreadIds.push(t.id); // done — reveal + clear below
      }
      return true;
    });
    const toClear = [...expiredDateThreadIds, ...completedTaskThreadIds];
    if (toClear.length > 0) {
      void admin
        .from("email_threads")
        .update({ boomerang_until: null, boomerang_task_id: null })
        .in("id", toClear);
    }
  }

  const threadIds = threads.map((thread: any) => thread.id);
  const [
    participantRows,
    { data: taskLinks },
    { data: projectLinks },
    { data: messageRows },
  ] = await Promise.all([
    fetchParticipantRowsForThreads(admin, threadIds),
    admin
      .from("email_thread_tasks")
      .select("thread_id,task_id")
      .in("thread_id", threadIds),
    admin
      .from("email_thread_projects")
      .select("thread_id,project_id")
      .in("thread_id", threadIds),
    // Per-thread message counts (conversation length) AND attachment totals for
    // the list badges. One grouped read over the capped thread set (<=200
    // threads), counted in JS — cheaper than one query per thread, and it lets
    // the attachment count ship in the initial payload instead of the client
    // lazy-fetching each thread just to render the paperclip badge. metadata_json
    // is the only place stored attachments live, so it is pulled here.
    admin
      .from("email_messages")
      .select("id,thread_id,metadata_json")
      .in("thread_id", threadIds),
  ]);

  const messageCountByThread = ((messageRows || []) as any[]).reduce(
    (map: Map<string, number>, row: any) => {
      const key = String(row.thread_id);
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    },
    new Map<string, number>(),
  );

  const attachmentCountByThread = ((messageRows || []) as any[]).reduce(
    (map: Map<string, number>, row: any) => {
      const count = countStoredGalleryAttachments(
        String(row.id),
        row.metadata_json?.attachments,
      );
      if (count > 0) {
        const key = String(row.thread_id);
        map.set(key, (map.get(key) || 0) + count);
      }
      return map;
    },
    new Map<string, number>(),
  );

  const projectIdsByThread = ((projectLinks || []) as any[]).reduce(
    (map: Map<string, string[]>, row: any) => {
      const key = String(row.thread_id);
      const current = map.get(key) || [];
      current.push(String(row.project_id));
      map.set(key, current);
      return map;
    },
    new Map<string, string[]>(),
  );

  const participantsByThread = new Map<string, InboxParticipant[]>();
  (participantRows || []).forEach((row: any) => {
    appendParticipant(
      participantsByThread,
      String(row.thread_id),
      mapParticipantRow(row),
    );
  });

  const taskCounts = ((taskLinks || []) as any[]).reduce(
    (map: Map<string, number>, row: any) => {
      map.set(String(row.thread_id), (map.get(String(row.thread_id)) || 0) + 1);
      return map;
    },
    new Map<string, number>(),
  );

  const mailboxMap = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));

  return sortInboxItems(
    threads.map((row: any) =>
      mapThreadToInboxItem({
        row,
        mailbox: mailboxMap.get(String(row.mailbox_id)),
        participants: participantsByThread.get(String(row.id)) || [],
        taskCount: taskCounts.get(String(row.id)) || 0,
        projectIds: projectIdsByThread.get(String(row.id)) || [],
        messageCount: messageCountByThread.get(String(row.id)) ?? 1,
        attachmentCount: attachmentCountByThread.get(String(row.id)) ?? 0,
      }),
    ),
  );
}

/**
 * Lightweight count of unread emails for the macOS Dock badge.
 * Counts inbound threads still flagged unread that are not spam and still live
 * in the active inbox (excludes quarantine/deleted/archived/resolved). Runs as a
 * head-only count so it can be polled cheaply from any view.
 */
/**
 * Count the drafts the Drafts page would show for this user: unsent outbound
 * drafts + unsent reply drafts across every mailbox they can access. Backs the
 * sidebar's Drafts badge, so it must match the page's own "not sent" rule.
 */
export async function getDraftCountForUser(userId: string): Promise<number> {
  const admin = getAdminClient();
  const mailboxes = await listMailboxesForUser(userId);
  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
  if (mailboxIds.length === 0) return 0;

  const [outbound, reply] = await Promise.all([
    admin
      .from("email_outbound_drafts")
      .select("id", { count: "exact", head: true })
      .in("mailbox_id", mailboxIds)
      .neq("status", "sent"),
    admin
      .from("email_reply_drafts")
      .select("id", { count: "exact", head: true })
      .in("mailbox_id", mailboxIds)
      .neq("status", "sent"),
  ]);

  return (outbound.count ?? 0) + (reply.count ?? 0);
}

export async function getUnreadBadgeCountForUser(
  userId: string,
): Promise<number> {
  const admin = getAdminClient();
  const mailboxes = await listMailboxesForUser(userId);
  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
  if (mailboxIds.length === 0) {
    return 0;
  }

  // Fetch the minimal set of unread threads still living in the active inbox and
  // count in JS. This mirrors the client badge logic exactly and avoids
  // PostgREST NULL quirks (`classification`/`origin` are nullable on inbound
  // threads, and `.neq()` would silently drop NULL rows).
  // Only `status`, `classification`, and `is_unread` are real columns here;
  // `origin` is derived in the app layer (always "inbound" for stored threads),
  // so we exclude spam by classification and count the rest. Counted in JS to
  // sidestep PostgREST NULL handling on the nullable `classification` column.
  const { data: rows } = await admin
    .from("email_threads")
    .select("classification")
    .in("mailbox_id", mailboxIds)
    .eq("is_unread", true)
    .in("status", ["active", "needs_project"]);

  if (!rows) {
    return 0;
  }

  return rows.reduce(
    (count: number, row: any) =>
      row.classification === "spam" ? count : count + 1,
    0,
  );
}

export async function listSenderHistoryForUser(
  userId: string,
  senderEmail: string,
) {
  const normalizedEmail = senderEmail.trim().toLowerCase();
  if (!normalizedEmail) {
    return [];
  }

  const admin = getAdminClient();
  const mailboxes = await listMailboxesForUser(userId);
  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);

  if (mailboxIds.length === 0) {
    return [];
  }

  const { data: senderRows } = await admin
    .from("email_participants")
    .select("thread_id")
    .in("mailbox_id", mailboxIds)
    .eq("participant_role", "from")
    .ilike("email_address", normalizedEmail);

  const threadIds = Array.from(
    new Set((senderRows || []).map((row: any) => String(row.thread_id))),
  );

  if (threadIds.length === 0) {
    return [];
  }

  const [
    { data: threads },
    participantRows,
    { data: messageRows },
    { data: projectLinks },
  ] = await Promise.all([
    admin
      .from("email_threads")
      .select("*")
      .in("id", threadIds)
      .order("latest_message_at", { ascending: false }),
    fetchParticipantRowsForThreads(admin, threadIds as string[]),
    admin
      .from("email_messages")
      .select("*")
      .in("thread_id", threadIds)
      .order("received_at", { ascending: true })
      .order("sent_at", { ascending: true }),
    admin
      .from("email_thread_projects")
      .select("thread_id,project_id")
      .in("thread_id", threadIds),
  ]);

  const projectIdsByThread = ((projectLinks || []) as any[]).reduce(
    (map: Map<string, string[]>, row: any) => {
      const key = String(row.thread_id);
      const current = map.get(key) || [];
      current.push(String(row.project_id));
      map.set(key, current);
      return map;
    },
    new Map<string, string[]>(),
  );

  const participantsByThread = new Map<string, InboxParticipant[]>();
  const participantsByMessage = new Map<string, InboxParticipant[]>();

  (participantRows || []).forEach((row: any) => {
    const participant = mapParticipantRow(row);
    appendParticipant(participantsByThread, String(row.thread_id), participant);
    if (row.message_id) {
      appendParticipant(
        participantsByMessage,
        String(row.message_id),
        participant,
      );
    }
  });

  const mailboxMap = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const messagesByThread = ((messageRows || []) as any[]).reduce(
    (map: Map<string, any[]>, row: any) => {
      const key = String(row.thread_id);
      const current = map.get(key) || [];
      current.push(row);
      map.set(key, current);
      return map;
    },
    new Map<string, any[]>(),
  );

  return sortInboxItems(
    ((threads || []) as any[]).map((row: any) => {
      const item = mapThreadToInboxItem({
        row,
        mailbox: mailboxMap.get(String(row.mailbox_id)),
        participants: participantsByThread.get(String(row.id)) || [],
        taskCount: 0,
        projectIds: projectIdsByThread.get(String(row.id)) || [],
        messageCount: (messagesByThread.get(String(row.id)) || []).length || 1,
      });

      const conversation = (messagesByThread.get(String(row.id)) || [])
        .map((messageRow: any) => ({
          ...coerceConversationEntry({
            ...messageRow,
            author_name: messageRow.metadata_json?.from?.[0]?.name ?? null,
            author_email: messageRow.metadata_json?.from?.[0]?.email ?? null,
            type: "email",
          }),
          participants: participantsByMessage.get(String(messageRow.id)) || [],
        }))
        .sort(compareConversationEntriesByTime);

      return {
        ...item,
        attachmentCount: collectThreadAttachments(conversation).length,
        conversation,
      };
    }),
  );
}

async function chooseSummaryProfile(
  mailbox: any,
  userId: string,
): Promise<SummaryProfile | null> {
  const profiles = await listSummaryProfilesForUser(userId);
  return (
    profiles.find((profile) => profile.id === mailbox.summary_profile_id) ||
    profiles.find(
      (profile) => profile.mailboxId === mailbox.id && profile.isDefault,
    ) ||
    profiles.find(
      (profile) => profile.userId === userId && profile.isDefault,
    ) ||
    profiles[0] ||
    null
  );
}

async function getUserEmailReplySettings(
  userId: string,
  override?: EmailReplySettingsOverride | null,
) {
  const admin = getAdminClient();
  const { data } = await admin
    .from("user_preferences")
    .select("email_reply_settings")
    .eq("user_id", userId)
    .maybeSingle();

  return mergeEmailReplySettings(data?.email_reply_settings, override);
}

async function createTasksForThreadInternal(params: {
  actorUserId: string;
  thread: any;
  projectId: string;
  suggestions: InboxTaskSuggestion[];
  generatedBy: "ai" | "user" | "rule";
}) {
  const admin = getAdminClient();

  // Never create tasks from quarantined (or spam) threads. This guards every
  // task-creation path — the AI/rule auto-pipeline and the explicit user
  // "Convert to task" action — since all of them funnel through here.
  if (isQuarantinedEmailStatus(params.thread?.status)) {
    return [];
  }

  const adapter = new SupabaseAdapter(admin, params.actorUserId);
  const { data: existingLinks } = await admin
    .from("email_thread_tasks")
    .select("task_id")
    .eq("thread_id", params.thread.id);

  if ((existingLinks || []).length > 0) {
    return existingLinks;
  }

  const { data: latestInbound } = await admin
    .from("email_messages")
    .select("*")
    .eq("thread_id", params.thread.id)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const createdLinks: any[] = [];
  let earliestDueDate: string | null = null;

  // Email-derived tasks should surface in the Today view alongside normal
  // tasks. If a suggestion carries no explicit due date, default it to today so
  // it lands in the Today bucket (Today/Overdue/Tomorrow/Rest-of-Week sorting
  // is purely due-date driven; a null due date would exclude it entirely).
  const todayDueDate = getLocalDateString(new Date());

  for (const suggestion of params.suggestions) {
    const task = await adapter.createTask({
      name:
        params.generatedBy === "ai"
          ? formatAiGeneratedTaskName(
              repairGenericTaskName(suggestion.name, params.thread.subject),
            )
          : suggestion.name,
      description:
        suggestion.description ||
        latestInbound?.body_html ||
        latestInbound?.body_text ||
        params.thread.summary_text ||
        params.thread.preview_text ||
        "",
      projectId: params.projectId,
      priority: suggestion.priority ?? 3,
      dueDate: suggestion.dueDate || todayDueDate,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await admin.from("email_thread_tasks").insert({
      thread_id: params.thread.id,
      task_id: task.id,
      created_by_user_id: params.actorUserId,
      generated_by: params.generatedBy,
      rationale: params.thread.action_reason ?? null,
    });

    createdLinks.push(task);
    const effectiveDueDate = suggestion.dueDate || todayDueDate;
    if (!earliestDueDate || effectiveDueDate < earliestDueDate) {
      earliestDueDate = effectiveDueDate;
    }
  }

  await admin
    .from("email_threads")
    .update({
      project_id: params.projectId,
      resolution_state: "taskified",
      needs_project: false,
      work_due_date: earliestDueDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.thread.id);

  return createdLinks;
}

export async function reprocessThread(
  threadId: string,
  actorUserId?: string,
  options?: { manual?: boolean },
) {
  const admin = getAdminClient();
  const { data: thread } = await admin
    .from("email_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) {
    throw new Error("Email thread not found");
  }

  const mailbox = await ensureMailboxAccess(
    actorUserId || thread.owner_user_id,
    String(thread.mailbox_id),
  );
  const latestMessage = await getLatestThreadMessage(String(thread.id));

  if (!latestMessage) {
    return thread;
  }

  const rules = await listRulesForUser(mailbox.owner_user_id);
  const relevantRules = rules.filter(
    (rule) =>
      !rule.mailboxId ||
      rule.mailboxId === mailbox.id ||
      (!rule.mailboxId && !rule.organizationId) ||
      (rule.organizationId && rule.organizationId === mailbox.organization_id),
  );

  const appliedRules = applyEmailRules(
    relevantRules,
    buildRuleContext(mailbox, latestMessage),
  );
  if (appliedRules.matchedRules.length > 0) {
    await admin.from("email_rule_runs").insert(
      appliedRules.matchedRules.map((rule) => ({
        rule_id: rule.id,
        thread_id: thread.id,
        message_id: latestMessage.id,
        matched: true,
        action_summary: rule.actions.map((action) => action.type).join(", "),
        explanation: `Matched rule "${rule.name}"`,
        confidence: 1,
      })),
    );
  }

  const preventSpamClassification = appliedRules.actions.includes("never_spam");

  // Sender-domain exemption: mail from these domains is never marked spam as a
  // result of its own content (k-NN model or LLM/heuristic spam axis). Explicit
  // user rules (subject/body/etc.) can still route it to spam — see
  // resolveRuleDrivenThreadState, which is intentionally NOT gated on this.
  const senderDomainSpamExempt = isContentSpamExemptSender(
    buildRuleContext(mailbox, latestMessage).senderEmail,
  );
  // Effective suppression for the automatic content classifier only.
  const suppressContentSpam =
    preventSpamClassification || senderDomainSpamExempt;

  // Private, trainable k-NN spam verdict (free, edge embeddings). Computed
  // before the LLM/heuristic analysis so a CONFIDENT verdict can override the
  // spam axis directly; a low-confidence verdict falls through to
  // analyzeThreadWithAI (the LLM/heuristic backstop) per SPAM_FALLBACK_MODE.
  // Never runs against a never_spam override. Best-effort — never breaks sync.
  const spamThreshold = getSpamConfidenceThreshold();
  const spamFallbackMode = getSpamFallbackMode();
  // Full enforcement of SPAM_FALLBACK_MODE=private: the external LLM classifier
  // never runs. The k-NN verdict (below) decides the spam axis when confident;
  // buildHeuristicAnalysis (local, no network) handles summary/routing/tasks for
  // everything else. In 'llm' mode the OpenAI backstop runs as before.
  // Credit-saving skip: when a user Rule already routes this email to spam or
  // always-delete, the paid LLM verdict can't change the outcome — so skip it
  // and let the local heuristic populate summary/routing (no network, no
  // credits). A manual re-analysis (options.manual, e.g. the Reprocess action)
  // always runs the full model.
  const ruleForcesSpam =
    appliedRules.actions.includes("spam") ||
    appliedRules.actions.includes("always_delete");
  const skipAiForSpamRule = ruleForcesSpam && !options?.manual;
  const forceHeuristicAnalysis =
    spamFallbackMode === "private" || skipAiForSpamRule;
  let spamVerdict: SpamClassification | null = null;
  if (!suppressContentSpam) {
    try {
      const spamInputText = buildSpamInputText(
        { subject: thread.subject },
        {
          subject: latestMessage.subject,
          body_text: latestMessage.body_text,
          senderEmail: buildRuleContext(mailbox, latestMessage).senderEmail,
        },
      );
      spamVerdict = await classifySpam(spamInputText, {
        userId: mailbox.owner_user_id,
        organizationId: mailbox.organization_id ?? undefined,
        mailboxId: mailbox.id,
      });
    } catch (e) {
      console.error("classifySpam (email) failed:", e);
    }
  }

  const profile = await chooseSummaryProfile(mailbox, mailbox.owner_user_id);
  const projectOptions = await getVisibleProjectsForUser(
    mailbox.owner_user_id,
    mailbox.organization_id,
  );
  // Retrieve AI-memory precedents + playbook (best-effort; never breaks AI).
  const memoryInputText = `${latestMessage.subject || thread.subject || ""}\n${
    latestMessage.body_text || ""
  }`.slice(0, 4000);
  let memoryBlock = "";
  let playbookBlock = "";
  let selectedMemoryIds: string[] = [];
  let selectedPlaybookId: string | null = null;
  try {
    const [memories, playbook] = await Promise.all([
      retrieveRelevantAIMemory(admin, {
        userId: mailbox.owner_user_id,
        organizationId: mailbox.organization_id ?? undefined,
        inputText: memoryInputText,
        memoryTypes: [
          "email_categorization",
          "project_routing",
          "priority_judgment",
          "urgency_judgment",
        ],
      }),
      getLatestActivePlaybook(admin, {
        userId: mailbox.owner_user_id,
        organizationId: mailbox.organization_id ?? undefined,
        playbookType: "email_categorization",
      }),
    ]);
    memoryBlock = buildAIMemoryPromptBlock(memories);
    playbookBlock = buildPlaybookPromptBlock(playbook);
    selectedMemoryIds = memories.map((m) => m.id);
    selectedPlaybookId = playbook?.id ?? null;
  } catch (e) {
    console.error("AI-memory retrieval (email classify) failed:", e);
  }

  // The mailbox's organization owns the provider waterfall for email triage
  // (settings → Email AI providers). Best-effort: a missing org or column just
  // means the DeepSeek-first default chain is used.
  let orgAiSettings: unknown = null;
  if (mailbox.organization_id) {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("ai_settings")
      .eq("id", mailbox.organization_id)
      .maybeSingle();
    if (orgError) {
      console.error("email AI settings lookup failed:", orgError);
    }
    orgAiSettings = (org as { ai_settings?: unknown } | null)?.ai_settings ?? null;
  }

  const aiResult = await analyzeThreadWithAI({
    subject: latestMessage.subject || thread.subject || "",
    bodyText: latestMessage.body_text || "",
    senderEmail: buildRuleContext(mailbox, latestMessage).senderEmail,
    mailboxEmail: mailbox.email_address,
    preventSpamClassification: suppressContentSpam,
    forceHeuristic: forceHeuristicAnalysis,
    chain: resolveEmailChain(orgAiSettings),
    profile,
    projectOptions: projectOptions.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
    })),
    memoryBlock,
    playbookBlock,
  });

  const ruleActions = new Set(appliedRules.actions);
  let { status, classification, needsProject, alwaysDelete } =
    resolveRuleDrivenThreadState({
      aiResult,
      ruleActions,
    });

  // A confident k-NN verdict can only UPGRADE the spam axis (never against a
  // never_spam override, already excluded above). It must never downgrade a
  // confident LLM spam verdict back to actionable — see applySpamKnnOverride.
  // Low-confidence verdicts leave the LLM/heuristic result untouched.
  const spamKnnConfident =
    !!spamVerdict &&
    spamVerdict.label !== null &&
    spamVerdict.exampleCount > 0 &&
    spamVerdict.confidence >= spamThreshold;
  const spamKnnUpgradedToSpam =
    spamKnnConfident && !suppressContentSpam && spamVerdict!.label === "spam";
  ({ classification, status, needsProject } = applySpamKnnOverride({
    classification,
    status,
    needsProject,
    knnLabel: spamVerdict?.label ?? null,
    knnConfident: spamKnnConfident,
    suppressContentSpam,
  }));

  const projectId =
    thread.project_id ||
    (aiResult.projectId &&
    projectOptions.some((project) => project.id === aiResult.projectId)
      ? aiResult.projectId
      : null);

  if (
    !projectId &&
    aiResult.taskSuggestions.length > 0 &&
    status === "active"
  ) {
    status = "needs_project";
    needsProject = true;
  }

  await admin
    .from("email_threads")
    .update({
      project_id: projectId,
      summary_profile_id: profile?.id ?? null,
      owner_user_id: ruleActions.has("assign_mailbox_owner")
        ? mailbox.owner_user_id
        : thread.owner_user_id,
      action_title: aiResult.actionTitle,
      summary_text: aiResult.summary,
      preview_text: extractPlainTextPreview(latestMessage.body_text || "", 240),
      action_confidence: aiResult.confidence,
      action_reason: aiResult.reason,
      classification,
      status,
      needs_project: needsProject,
      always_delete: alwaysDelete,
      task_suggestions_json: aiResult.taskSuggestions,
      analysis_json: {
        ai: aiResult,
        matchedRuleIds: appliedRules.matchedRules.map((rule) => rule.id),
        participantSummary: buildParticipantSummary(
          ((latestMessage.metadata_json?.from || []) as any[]).map((value) => ({
            id: `from-${value.email}`,
            emailAddress: value.email,
            displayName: value.name || null,
            participantRole: "from",
          })),
        ),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", thread.id);

  // Record a decision trace (best-effort).
  try {
    const matchedRuleIds = appliedRules.matchedRules.map((rule) => rule.id);
    const overriddenByRule =
      matchedRuleIds.length > 0 && ruleActions.size > 0;
    await recordDecisionTrace(admin, {
      userId: mailbox.owner_user_id,
      organizationId: mailbox.organization_id ?? undefined,
      sourceType: "email",
      sourceId: String(thread.id),
      aiCallType: "email_classification",
      inputText: memoryInputText,
      selectedMemoryIds,
      selectedPlaybookId,
      matchedRuleIds,
      promptContextSummary: `${selectedMemoryIds.length} memories, playbook ${
        selectedPlaybookId ? "v-active" : "none"
      }${
        spamVerdict
          ? `; spam-knn ${spamVerdict.label ?? "none"} conf=${spamVerdict.confidence.toFixed(
              2,
            )} n=${spamVerdict.exampleCount}${
              spamKnnUpgradedToSpam
                ? " (applied → spam)"
                : spamKnnConfident
                  ? " (advisory; not_spam never downgrades an LLM spam verdict)"
                  : ` (fallback=${spamFallbackMode})`
            }`
          : ""
      }${
        forceHeuristicAnalysis
          ? "; private mode → heuristic (no external LLM)"
          : ""
      }`,
      aiOutput: aiResult as unknown as Record<string, unknown>,
      finalOutput: {
        classification,
        status,
        needsProject,
        projectId,
        alwaysDelete,
        spam: spamVerdict
          ? {
              label: spamVerdict.label,
              confidence: spamVerdict.confidence,
              exampleCount: spamVerdict.exampleCount,
              // Confident enough to be consulted vs. actually changed the axis.
              usedKnn: spamKnnConfident,
              appliedKnn: spamKnnUpgradedToSpam,
              threshold: spamThreshold,
              fallbackMode: spamFallbackMode,
              forcedHeuristic: forceHeuristicAnalysis,
            }
          : null,
        forcedHeuristic: forceHeuristicAnalysis,
      },
      overriddenByRule,
      overrideReason: overriddenByRule
        ? `Rules applied: ${Array.from(ruleActions).join(", ")}`
        : null,
      modelProvider: "openai",
      modelName: "gpt-4.1",
    });
  } catch (e) {
    console.error("recordDecisionTrace (email) failed:", e);
  }

  if (
    projectId &&
    aiResult.taskSuggestions.length > 0 &&
    (aiResult.confidence >= 0.7 || ruleActions.has("generate_tasks")) &&
    status === "active"
  ) {
    await createTasksForThreadInternal({
      actorUserId: mailbox.owner_user_id,
      thread,
      projectId,
      suggestions: aiResult.taskSuggestions,
      generatedBy: ruleActions.has("generate_tasks") ? "rule" : "ai",
    });
  }

  const { data: refreshed } = await admin
    .from("email_threads")
    .select("*")
    .eq("id", thread.id)
    .maybeSingle();

  return refreshed;
}

export async function createMailbox(
  userId: string,
  input: {
    provider?: MailboxType["provider"];
    organizationId?: string | null;
    name: string;
    displayName?: string | null;
    emailAddress: string;
    loginUsername: string;
    password: string;
    imapHost: string;
    imapPort?: number;
    imapSecure?: boolean;
    smtpHost: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    isShared?: boolean;
    syncFolder?: string;
    quarantineFolder?: string | null;
    autoSyncEnabled?: boolean;
    syncFrequencyMinutes?: number;
  },
) {
  const admin = getAdminClient();
  const provider = input.provider ?? "imap_smtp";
  const providerPreset = MAILBOX_PROVIDER_PRESETS[provider];
  const emailAddress = input.emailAddress.trim().toLowerCase();
  const loginUsername = (input.loginUsername || emailAddress).trim();
  const normalizedPassword = normalizeMailboxPassword(provider, input.password);
  const imapHost = (input.imapHost || providerPreset.imapHost).trim();
  const smtpHost = (input.smtpHost || providerPreset.smtpHost).trim();
  const syncFolder = (input.syncFolder || providerPreset.syncFolder).trim();
  const imapPort = Number(input.imapPort || providerPreset.imapPort || 993);
  const smtpPort = Number(input.smtpPort || providerPreset.smtpPort || 465);

  if (input.organizationId) {
    await ensureOrganizationAccess(userId, input.organizationId);
  }
  if (input.isShared && !input.organizationId) {
    throw new Error("Shared mailboxes must belong to an organization.");
  }
  if (!loginUsername) {
    throw new Error("Login username is required.");
  }
  if (!imapHost || !smtpHost) {
    throw new Error("IMAP and SMTP hosts are required.");
  }
  if (!Number.isFinite(imapPort) || !Number.isFinite(smtpPort)) {
    throw new Error("IMAP and SMTP ports must be valid numbers.");
  }
  const passwordValidationError = getMailboxPasswordValidationError(
    provider,
    normalizedPassword,
  );
  if (passwordValidationError) {
    throw new Error(passwordValidationError);
  }

  const encrypted = encryptMailboxCredentials({
    password: normalizedPassword,
  });

  const { data: existingMailbox } = await admin
    .from("mailboxes")
    .select("*")
    .eq("email_address", emailAddress)
    .maybeSingle();

  let mailbox: any = null;

  if (existingMailbox?.id) {
    const accessibleMailboxes = await getAccessibleMailboxRows(userId);
    const existingAccessibleMailbox = accessibleMailboxes.find(
      (row: any) => String(row.id) === String(existingMailbox.id),
    );
    if (!existingAccessibleMailbox) {
      throw new Error("A mailbox with that email address already exists.");
    }

    const manageableMailbox = await ensureMailboxManage(
      userId,
      String(existingMailbox.id),
    );

    const { data: updatedMailbox } = await admin
      .from("mailboxes")
      .update({
        name: input.name,
        display_name: input.displayName ?? null,
        provider,
        login_username: loginUsername,
        credentials_encrypted: encrypted,
        imap_host: imapHost,
        imap_port: imapPort,
        imap_secure: input.imapSecure ?? true,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_secure: input.smtpSecure ?? true,
        sync_folder: syncFolder || "INBOX",
        quarantine_folder:
          input.quarantineFolder ?? manageableMailbox.quarantine_folder ?? null,
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingMailbox.id)
      .select()
      .single();

    mailbox = updatedMailbox;
  } else {
    const { data: createdMailbox } = await admin
      .from("mailboxes")
      .insert({
        organization_id: input.organizationId ?? null,
        owner_user_id: userId,
        name: input.name,
        display_name: input.displayName ?? null,
        email_address: emailAddress,
        provider,
        is_shared: Boolean(input.isShared),
        login_username: loginUsername,
        credentials_encrypted: encrypted,
        imap_host: imapHost,
        imap_port: imapPort,
        imap_secure: input.imapSecure ?? true,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_secure: input.smtpSecure ?? true,
        sync_folder: syncFolder || "INBOX",
        quarantine_folder: input.quarantineFolder ?? null,
        auto_sync_enabled: input.autoSyncEnabled ?? true,
        sync_frequency_minutes: input.syncFrequencyMinutes ?? 5,
      })
      .select()
      .single();

    mailbox = createdMailbox;
  }

  if (!mailbox) {
    throw new Error("Failed to create mailbox");
  }

  await admin.from("mailbox_members").upsert({
    mailbox_id: mailbox.id,
    user_id: userId,
    role: "manager",
  });

  const summaryProfileId = await ensureMailboxSummaryProfile({
    userId,
    mailboxId: mailbox.id,
    organizationId: mailbox.organization_id ?? input.organizationId ?? null,
    mailboxName: input.name,
    existingSummaryProfileId: mailbox.summary_profile_id ?? null,
  });
  if (summaryProfileId) mailbox.summary_profile_id = summaryProfileId;

  await admin.from("email_sync_state").upsert({
    mailbox_id: mailbox.id,
    sync_status: "idle",
    consecutive_failures: 0,
    updated_at: new Date().toISOString(),
  });

  return coerceMailbox(mailbox, [
    {
      userId,
      role: "manager",
    },
  ]);
}

// Partial update of an existing mailbox's settings + (optionally) connection
// credentials. Unlike `createMailbox` (which upserts by email and always
// re-encrypts a password), this is keyed by mailbox id, only touches the fields
// present in `patch`, and leaves stored credentials untouched when `password`
// is omitted/empty. This is what powers per-mailbox editing + auto-sync
// frequency config from clients. Requires manage-level access.
export async function updateMailboxSettings(
  userId: string,
  mailboxId: string,
  patch: {
    provider?: MailboxType["provider"];
    name?: string;
    displayName?: string | null;
    loginUsername?: string;
    password?: string | null;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    isShared?: boolean;
    syncFolder?: string;
    quarantineFolder?: string | null;
    autoSyncEnabled?: boolean;
    syncFrequencyMinutes?: number;
  },
) {
  const admin = getAdminClient();
  const existing = await ensureMailboxManage(userId, mailboxId);
  const provider = (patch.provider ??
    existing.provider) as MailboxType["provider"];

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Mailbox name is required.");
    update.name = name;
  }
  if (patch.displayName !== undefined) {
    update.display_name = patch.displayName?.trim() || null;
  }
  if (patch.provider !== undefined) {
    update.provider = provider;
  }
  if (patch.loginUsername !== undefined) {
    const loginUsername = patch.loginUsername.trim();
    if (!loginUsername) throw new Error("Login username is required.");
    update.login_username = loginUsername;
  }
  if (patch.imapHost !== undefined) {
    const imapHost = patch.imapHost.trim();
    if (!imapHost) throw new Error("IMAP host is required.");
    update.imap_host = imapHost;
  }
  if (patch.smtpHost !== undefined) {
    const smtpHost = patch.smtpHost.trim();
    if (!smtpHost) throw new Error("SMTP host is required.");
    update.smtp_host = smtpHost;
  }
  if (patch.imapPort !== undefined) {
    const imapPort = Number(patch.imapPort);
    if (!Number.isFinite(imapPort) || imapPort <= 0) {
      throw new Error("IMAP port must be a valid number.");
    }
    update.imap_port = imapPort;
  }
  if (patch.smtpPort !== undefined) {
    const smtpPort = Number(patch.smtpPort);
    if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
      throw new Error("SMTP port must be a valid number.");
    }
    update.smtp_port = smtpPort;
  }
  if (patch.imapSecure !== undefined) update.imap_secure = patch.imapSecure;
  if (patch.smtpSecure !== undefined) update.smtp_secure = patch.smtpSecure;
  if (patch.syncFolder !== undefined) {
    update.sync_folder = patch.syncFolder.trim() || "INBOX";
  }
  if (patch.quarantineFolder !== undefined) {
    update.quarantine_folder = patch.quarantineFolder?.trim() || null;
  }
  if (patch.autoSyncEnabled !== undefined) {
    update.auto_sync_enabled = Boolean(patch.autoSyncEnabled);
  }
  if (patch.syncFrequencyMinutes !== undefined) {
    const minutes = Number(patch.syncFrequencyMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      throw new Error("Sync frequency must be at least 1 minute.");
    }
    update.sync_frequency_minutes = Math.round(minutes);
  }
  if (patch.isShared !== undefined) {
    if (patch.isShared && !existing.organization_id) {
      throw new Error("Shared mailboxes must belong to an organization.");
    }
    update.is_shared = Boolean(patch.isShared);
  }

  if (patch.password !== undefined && patch.password !== null) {
    const normalizedPassword = normalizeMailboxPassword(
      provider,
      patch.password,
    );
    if (normalizedPassword) {
      const passwordValidationError = getMailboxPasswordValidationError(
        provider,
        normalizedPassword,
      );
      if (passwordValidationError) throw new Error(passwordValidationError);
      update.credentials_encrypted = encryptMailboxCredentials({
        password: normalizedPassword,
      });
      update.last_sync_error = null;
    }
  }

  const { data: updatedMailbox, error } = await admin
    .from("mailboxes")
    .update(update)
    .eq("id", mailboxId)
    .select()
    .single();

  if (error || !updatedMailbox) {
    throw new Error(error?.message || "Failed to update mailbox");
  }

  const mailboxes = await listMailboxesForUser(userId);
  const coerced = mailboxes.find(
    (row) => String(row.id) === String(mailboxId),
  );
  return coerced ?? coerceMailbox(updatedMailbox, []);
}

export async function deleteMailbox(userId: string, mailboxId: string) {
  const admin = getAdminClient();
  // ensureMailboxManage enforces ownership / elevated access before deletion.
  await ensureMailboxManage(userId, mailboxId);
  const { error } = await admin.from("mailboxes").delete().eq("id", mailboxId);
  if (error) {
    throw new Error(error.message || "Failed to delete mailbox");
  }
  return { id: mailboxId, deleted: true };
}

// Max number of threads analyzed by the AI concurrently per backfill batch.
// Keeps OpenAI usage bounded so a large sync can't fan out an unbounded number
// of parallel model calls.
const THREAD_ANALYSIS_CONCURRENCY = 3;

// Cap on how many previously-unanalyzed threads we retry per sync. Threads whose
// AI analysis failed (or never ran) leave `analysis_json` NULL and get picked up
// here on a later sync, without a dedicated `needs_analysis` column.
const THREAD_ANALYSIS_RETRY_LIMIT = 25;

// Strong references to in-flight background analysis tasks. On the persistent
// Railway Node server (`node start.js`) an un-awaited promise is fine to run to
// completion, but we must keep a reference so it isn't garbage-collected before
// it settles. Each task removes itself on completion.
const pendingThreadAnalysisTasks = new Set<Promise<void>>();

/**
 * Run the expensive AI analysis (`reprocessThread`) for a set of threads OUT of
 * the sync critical path. Threads are already persisted with a cheap preview, so
 * the inbox can render them immediately; this backfills analysis_json /
 * summary_text / task_suggestions_json / action_* and, because `email_threads`
 * has realtime enabled (REPLICA IDENTITY FULL + publication), each UPDATE pushes
 * to subscribed clients automatically (the row's owner_user_id / mailbox_id are
 * set, so the realtime filter matches).
 *
 * Idempotent and failure-isolated: a failure on one thread is logged and leaves
 * the cheap preview in place (a later sync retries it via the analysis_json IS
 * NULL sweep); it never loses the message or aborts the batch.
 */
function runThreadAnalysisInBackground(
  threadIds: string[],
  actorUserId: string,
): Promise<void> {
  const queue = Array.from(new Set(threadIds.map(String)));
  if (queue.length === 0) {
    return Promise.resolve();
  }

  const task = (async () => {
    const worker = async () => {
      for (;;) {
        const threadId = queue.shift();
        if (!threadId) return;
        try {
          await reprocessThread(threadId, actorUserId);
        } catch (error) {
          console.error(
            "[email-inbox] Background thread analysis failed",
            threadId,
            extractMailboxErrorMessage(error),
          );
        }
      }
    };

    const workerCount = Math.min(THREAD_ANALYSIS_CONCURRENCY, queue.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  })();

  pendingThreadAnalysisTasks.add(task);
  void task.finally(() => {
    pendingThreadAnalysisTasks.delete(task);
  });
  return task;
}

export async function syncMailboxById(userId: string, mailboxId: string) {
  const admin = getAdminClient();
  const mailbox = await ensureMailboxManage(userId, mailboxId);
  const transportMailbox = mailbox as MailboxTransportRow;
  const { data: syncState } = await admin
    .from("email_sync_state")
    .select("*")
    .eq("mailbox_id", mailboxId)
    .maybeSingle();

  const syncStateUpdatedAt = syncState?.updated_at
    ? new Date(syncState.updated_at).getTime()
    : 0;
  if (
    syncState?.sync_status === "syncing" &&
    syncStateUpdatedAt &&
    Date.now() - syncStateUpdatedAt < 2 * 60 * 1000
  ) {
    return {
      skipped: true,
      reason: "Mailbox sync already in progress",
      syncedMessageCount: 0,
      changedThreadCount: 0,
      pushNotificationCount: 0,
    };
  }

  await admin.from("email_sync_state").upsert({
    mailbox_id: mailboxId,
    sync_status: "syncing",
    updated_at: new Date().toISOString(),
  });

  try {
    const syncResult = await fetchMailboxMessages(transportMailbox, {
      lastSeenAt:
        syncState?.last_seen_message_at ?? mailbox.last_synced_at ?? null,
      syncCursor: syncState?.sync_cursor_json ?? null,
    });
    const messages = syncResult.messages;
    const changedThreadIds = new Set<string>();
    const notificationCandidates: Array<{
      message: any;
      messageId: string;
      threadId: string;
    }> = [];
    const hadPreviousSync = Boolean(
      syncState?.last_seen_message_at || mailbox.last_synced_at,
    );
    const syncedProviderMessageIds: string[] = [];

    for (const message of messages) {
      const result = await ingestMailboxMessage(mailbox, message);
      changedThreadIds.add(result.threadId);
      syncedProviderMessageIds.push(String(message.providerMessageId));
      if (result.inserted) {
        notificationCandidates.push({
          message,
          messageId: result.messageId,
          threadId: result.threadId,
        });
      }
    }

    // Ingest replies sent outside the app (Gmail / Apple Mail / etc.) from the
    // provider's Sent folder so they appear in the threaded conversation view.
    // Non-fatal: a failure here must not abort the inbound sync.
    try {
      const sentMessages = await fetchMailboxSentMessages(transportMailbox, {
        limit: 50,
      });
      for (const message of sentMessages) {
        const result = await ingestOutboundMailboxMessage(mailbox, message);
        if (result?.threadId) {
          changedThreadIds.add(result.threadId);
        }
      }
    } catch (sentSyncError) {
      console.error(
        "[email-inbox] Sent-folder sync failed",
        extractMailboxErrorMessage(sentSyncError),
      );
    }

    // Mirror the provider's Drafts folder so drafts written directly in Gmail
    // (etc.) show on the Drafts page. Non-fatal: never abort the inbound sync.
    try {
      await syncMailboxProviderDrafts(mailbox);
    } catch (draftSyncError) {
      console.error(
        "[email-inbox] Drafts-folder sync failed",
        extractMailboxErrorMessage(draftSyncError),
      );
    }

    // The changed threads are already persisted with a cheap preview
    // (subject / preview_text / latest_message_at / classification="unknown")
    // during ingest, so the inbox can render them immediately. Fetch those
    // rows for push notifications instead of blocking on the AI step.
    const processedThreads = new Map<string, any>();
    if (changedThreadIds.size > 0) {
      const { data: cheapThreads } = await admin
        .from("email_threads")
        .select("*")
        .in("id", Array.from(changedThreadIds));
      for (const thread of cheapThreads || []) {
        if (thread?.id) {
          processedThreads.set(String(thread.id), thread);
        }
      }
    }

    // Run the expensive AI analysis OUT of the sync critical path. Also retry a
    // bounded set of previously-unanalyzed threads (analysis_json IS NULL) for
    // this mailbox so transient AI failures self-heal on a later sync without a
    // dedicated needs_analysis column. The UPDATE that reprocessThread writes
    // pushes the backfilled analysis to realtime subscribers automatically.
    const threadsNeedingAnalysis = new Set<string>(
      Array.from(changedThreadIds).map(String),
    );
    try {
      const { data: pendingThreads } = await admin
        .from("email_threads")
        .select("id")
        .eq("mailbox_id", mailboxId)
        .is("analysis_json", null)
        .order("latest_message_at", { ascending: false })
        .limit(THREAD_ANALYSIS_RETRY_LIMIT);
      for (const row of pendingThreads || []) {
        if (row?.id) threadsNeedingAnalysis.add(String(row.id));
      }
    } catch (analysisQueueError) {
      console.error(
        "[email-inbox] Failed to enqueue unanalyzed threads for backfill",
        extractMailboxErrorMessage(analysisQueueError),
      );
    }
    runThreadAnalysisInBackground(
      Array.from(threadsNeedingAnalysis),
      mailbox.owner_user_id,
    );

    // Reconcile read/unread state across the recent message window on every
    // sync (not just the just-fetched UIDs). The newly synced messages are the
    // newest and therefore already within this window, and this ensures a
    // Gmail "mark as read" on an existing/older thread is reconciled even when
    // the same sync also ingested new mail.
    void syncedProviderMessageIds;
    await syncMailboxThreadReadStates({
      mailboxId,
      mailbox: transportMailbox,
    });

    const mirrorResult = await mirrorProviderFolderState({
      mailboxId,
      mailbox: transportMailbox,
    });

    let pushNotificationCount = 0;
    for (const candidate of notificationCandidates) {
      const result = await sendNewEmailPushNotifications({
        mailbox,
        thread: processedThreads.get(candidate.threadId),
        message: candidate.message,
        messageId: candidate.messageId,
        hadPreviousSync,
      });
      pushNotificationCount += result.delivered;
    }

    // Mirror each freshly-categorized thread into the provider: label it and
    // take it out of the Inbox. Runs after analysis (so `classification` is
    // settled) and only for threads this sync touched — never a sweep over the
    // user's existing mail. Each thread is independently best-effort so one bad
    // IMAP move can't fail the whole sync.
    //
    // Spam takes the same trip to a different destination: mail the classifier
    // flagged is pushed to the provider's Junk folder, so Gmail agrees with
    // Focus instead of leaving detected spam sitting in the Inbox.
    let providerLabeledThreadCount = 0;
    let providerSpamThreadCount = 0;
    if (mailbox.owner_user_id) {
      for (const threadId of changedThreadIds) {
        const spamResult = await mirrorThreadSpamToProvider({
          mailbox: transportMailbox,
          threadId,
        }).catch(() => null);
        if (spamResult?.movedToJunk) {
          providerSpamThreadCount += 1;
          continue;
        }
        const labelResult = await mirrorThreadCategoryToProvider({
          userId: String(mailbox.owner_user_id),
          threadId,
        }).catch(() => null);
        if (labelResult?.labeled) providerLabeledThreadCount += 1;
      }

      // Catch-up sweep for HISTORICAL spam — distinct from the touched-thread
      // mirror above. Spam detected on an earlier sync (before the mirror
      // existed, or when the provider move failed) never appears in
      // changedThreadIds again, so it would sit in the user's Inbox forever.
      // This picks up already-detected spam that was never pushed
      // provider-side and moves it with the same helper.
      //
      // Bounded by SPAM_MIRROR_SWEEP_LIMIT so a large backlog drains over a few
      // syncs rather than one huge IMAP burst, and idempotent via
      // SPAM_PROVIDER_LABEL_MARKER: a moved thread stops matching, so the sweep
      // converges to empty. Category/archive mirroring is deliberately NOT
      // swept — this is spam only.
      try {
        const { data: unmirroredSpamRows } = await admin
          .from("email_threads")
          .select("id,status,classification,provider_label_name")
          .eq("mailbox_id", mailboxId)
          .eq("classification", "spam")
          .in("status", ["spam", "quarantine"])
          .or(
            `provider_label_name.is.null,provider_label_name.neq.${SPAM_PROVIDER_LABEL_MARKER}`,
          )
          .order("updated_at", { ascending: false })
          .limit(SPAM_MIRROR_SWEEP_LIMIT);

        const sweepThreadIds = selectSpamThreadsNeedingProviderMirror({
          rows: unmirroredSpamRows,
          skipThreadIds: changedThreadIds,
          limit: SPAM_MIRROR_SWEEP_LIMIT,
        });

        for (const threadId of sweepThreadIds) {
          // Best-effort per thread: one bad IMAP move can't abort the sync.
          const sweepResult = await mirrorThreadSpamToProvider({
            mailbox: transportMailbox,
            threadId,
          }).catch(() => null);
          if (sweepResult?.movedToJunk) providerSpamThreadCount += 1;
        }
      } catch (spamSweepError) {
        console.error(
          "[email-inbox] Spam provider catch-up sweep failed",
          extractMailboxErrorMessage(spamSweepError),
        );
      }
    }

    await admin
      .from("mailboxes")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      })
      .eq("id", mailboxId);

    await admin.from("email_sync_state").upsert({
      mailbox_id: mailboxId,
      sync_status: "idle",
      consecutive_failures: 0,
      error_message: null,
      last_synced_at: new Date().toISOString(),
      last_seen_message_at: syncResult.syncCursor.lastSeenAt,
      sync_cursor_json: buildMailboxSyncCursor({
        previousCursor: syncState?.sync_cursor_json ?? null,
        fallbackLastSeenAt:
          syncState?.last_seen_message_at ?? mailbox.last_synced_at ?? null,
        messages,
        highestUid: syncResult.syncCursor.highestUid,
      }),
      updated_at: new Date().toISOString(),
    });

    return {
      syncedMessageCount: messages.length,
      changedThreadCount: changedThreadIds.size,
      pushNotificationCount,
      providerLabeledThreadCount,
      providerSpamThreadCount,
      archivedThreadCount: mirrorResult.archivedThreadCount,
    };
  } catch (error) {
    const message = extractMailboxErrorMessage(error);
    await admin
      .from("mailboxes")
      .update({
        last_sync_error: message,
      })
      .eq("id", mailboxId);

    await admin.from("email_sync_state").upsert({
      mailbox_id: mailboxId,
      sync_status: "error",
      consecutive_failures: Number(syncState?.consecutive_failures || 0) + 1,
      error_message: message,
      updated_at: new Date().toISOString(),
    });

    throw new Error(message);
  }
}

// Minimum interval between background IMAP polls per mailbox, in ms.
//
// The user-facing `syncFrequencyMinutes` (default 5) was historically used as
// the gate here, which capped worst-case "new mail -> shown" latency at ~5
// minutes regardless of how fast the client polled `sync-due`. We decouple the
// two: the actual poll floor is `min(syncFrequencyMinutes, FLOOR)` so a focused
// client can surface mail within ~1 minute while still respecting provider
// rate limits (60s polls are well within Gmail/IMAP allowances and far gentler
// on the server than a long-lived IDLE connection on Railway). Mailboxes
// configured to sync *less* often than the floor still honor their setting.
const BACKGROUND_SYNC_FLOOR_MS = 60 * 1000;

export async function syncDueMailboxesForUser(userId: string) {
  const mailboxes = await listMailboxesForUser(userId);
  const now = Date.now();
  const dueMailboxes = mailboxes.filter((mailbox) => {
    if (!mailbox.autoSyncEnabled) {
      return false;
    }

    const lastSyncedAt = mailbox.lastSyncedAt
      ? new Date(mailbox.lastSyncedAt).getTime()
      : 0;

    const dueAfterMs = Math.min(
      mailbox.syncFrequencyMinutes * 60 * 1000,
      BACKGROUND_SYNC_FLOOR_MS,
    );

    return now - lastSyncedAt >= dueAfterMs;
  });

  const results = await Promise.allSettled(
    dueMailboxes.map((mailbox) => syncMailboxById(userId, mailbox.id)),
  );

  return {
    dueMailboxCount: dueMailboxes.length,
    syncedMailboxCount: results.filter(
      (result) => result.status === "fulfilled" && !result.value?.skipped,
    ).length,
    syncedMessageCount: results.reduce((sum, result) => {
      if (result.status !== "fulfilled") return sum;
      return sum + Number(result.value?.syncedMessageCount || 0);
    }, 0),
    changedThreadCount: results.reduce((sum, result) => {
      if (result.status !== "fulfilled") return sum;
      return sum + Number(result.value?.changedThreadCount || 0);
    }, 0),
    errors: results
      .filter((result) => result.status === "rejected")
      .map((result) =>
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason || "Unknown sync error"),
      ),
  };
}

export async function getThreadDetailForUser(userId: string, threadId: string) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(userId, threadId);
  const mailbox = await ensureMailboxAccess(userId, String(thread.mailbox_id));
  const [
    mailboxes,
    { data: rawMessageRows },
    { data: taskLinks },
    { data: tasks },
    activeReplyDraft,
  ] = await Promise.all([
    listMailboxesForUser(userId),
    // Only the columns the conversation actually renders. `raw_headers` alone
    // is ~10KB per message (58-message threads exist), so `select("*")` was
    // shipping most of a megabyte of headers the UI never reads. The backfill
    // check below re-reads headers for the few candidate rows instead.
    admin
      .from("email_messages")
      .select(
        "id,thread_id,mailbox_id,direction,provider_message_id," +
          "internet_message_id,subject,body_text,body_html,sent_at," +
          "received_at,metadata_json,created_at",
      )
      .eq("thread_id", threadId)
      .order("received_at", { ascending: true })
      .order("sent_at", { ascending: true }),
    admin.from("email_thread_tasks").select("*").eq("thread_id", threadId),
    admin
      .from("tasks")
      .select("*")
      .in(
        "id",
        (
          await admin
            .from("email_thread_tasks")
            .select("task_id")
            .eq("thread_id", threadId)
        ).data?.map((row: any) => row.task_id) || [],
      ),
    getActiveReplyDraftForThread(threadId),
  ]);

  const messageRows = ((rawMessageRows || []) as any[]).map((row: any) => ({
    ...row,
  }));
  // Backfill any missing attachment metadata OUT of the read path (single IMAP
  // connection, fire-and-forget). The conversation renders immediately from
  // stored data; attachment chips appear on the next open once persisted.
  backfillMessageAttachmentMetadataInBackground(mailbox, threadId, messageRows);

  const participants =
    (
      await admin
        .from("email_participants")
        .select("*")
        .eq("thread_id", threadId)
    ).data || [];

  const participantMap = (participants as any[]).reduce(
    (map: Map<string, InboxParticipant[]>, row: any) => {
      const participant = mapParticipantRow(row);
      appendParticipant(map, "__thread__", participant);
      if (row.message_id) {
        appendParticipant(map, String(row.message_id), participant);
      }
      return map;
    },
    new Map<string, InboxParticipant[]>(),
  );

  const { data: projectLinkRows } = await admin
    .from("email_thread_projects")
    .select("project_id")
    .eq("thread_id", threadId);

  const mappedMailbox = mailboxes.find((entry) => entry.id === mailbox.id);
  const item = mapThreadToInboxItem({
    row: thread,
    mailbox: mappedMailbox,
    participants: participantMap.get("__thread__") || [],
    taskCount: (taskLinks || []).length,
    projectIds: ((projectLinkRows || []) as any[]).map((row) =>
      String(row.project_id),
    ),
    messageCount: (messageRows || []).length || 1,
  });

  const conversation: ConversationEntry[] = (messageRows || [])
    .map((row: any) =>
      coerceConversationEntry({
        ...row,
        author_name: row.metadata_json?.from?.[0]?.name ?? null,
        author_email: row.metadata_json?.from?.[0]?.email ?? null,
        type: "email",
      }),
    )
    .sort(compareConversationEntriesByTime);

  // Cross-reference every recipient on the thread against the user's contacts in
  // ONE query, so the header can label a badge "John Smith · NueraHeat" instead
  // of the raw address. Unmatched addresses stay as-is.
  const contactsByEmail = await getContactsByEmailForUser({
    userId,
    emails: conversation.flatMap((entry) =>
      [...(entry.to || []), ...(entry.cc || []), ...(entry.bcc || [])].map(
        (recipient) => recipient.email,
      ),
    ),
  });

  return {
    ...item,
    attachmentCount: collectThreadAttachments(conversation).length,
    conversation: conversation.map((entry: ConversationEntry) => ({
      ...entry,
      to: attachContactsToRecipients(entry.to, contactsByEmail),
      cc: attachContactsToRecipients(entry.cc, contactsByEmail),
      bcc: attachContactsToRecipients(entry.bcc, contactsByEmail),
      participants: participantMap.get(entry.id) || [],
    })),
    linkedTasks: tasks || [],
    activeReplyDraft,
  };
}

/** Toggle the app-level star flag on a thread the user can access. Returns the
 *  new starred state. Backed by email_threads.is_starred (not synced to Gmail). */
export async function setThreadStarredForUser(
  userId: string,
  threadId: string,
  isStarred: boolean,
): Promise<{ id: string; isStarred: boolean }> {
  const admin = getAdminClient();
  await ensureThreadAccess(userId, threadId);
  const { error } = await admin
    .from("email_threads")
    .update({ is_starred: isStarred })
    .eq("id", threadId);
  if (error) {
    throw new Error(error.message || "Failed to update starred state");
  }
  return { id: threadId, isStarred };
}

export async function getThreadAttachmentForUser(
  userId: string,
  messageId: string,
  attachmentIndex: number,
) {
  const admin = getAdminClient();
  const { data: row } = await admin
    .from("email_messages")
    .select(
      "id,thread_id,mailbox_id,provider_message_id,provider_folder_path,metadata_json",
    )
    .eq("id", messageId)
    .maybeSingle();

  if (
    !row?.id ||
    !row.thread_id ||
    !row.mailbox_id ||
    !row.provider_message_id
  ) {
    throw new Error("Attachment not found");
  }

  await ensureThreadAccess(userId, String(row.thread_id));
  const mailbox = await ensureMailboxAccess(userId, String(row.mailbox_id));

  // Open the folder the message actually lives in — a filed message's uid does
  // not resolve in INBOX any more.
  const attachment = await fetchMailboxAttachmentByProviderMessageId(
    mailboxForFolder(
      mailbox as MailboxTransportRow,
      row.provider_folder_path as string | null,
    ),
    String(row.provider_message_id),
    attachmentIndex,
  );

  if (!attachment?.content) {
    throw new Error("Attachment not found");
  }

  return attachment;
}

export async function assignProjectToThread(
  userId: string,
  threadId: string,
  projectId: string,
) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(userId, threadId);
  await ensureProjectAccess(userId, projectId);
  await admin
    .from("email_threads")
    .update({
      project_id: projectId,
      status: thread.origin === "outbound" ? thread.status : "active",
      needs_project: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  // Keep the multi-project join table in sync: setting the primary also ensures
  // a membership row exists for it.
  await admin
    .from("email_thread_projects")
    .upsert(
      { thread_id: threadId, project_id: projectId },
      { onConflict: "thread_id,project_id", ignoreDuplicates: true },
    );

  return await reprocessThread(thread.id, userId);
}

/** Returns the full ordered set of project ids a thread is associated with:
 *  the primary email_threads.project_id first, then any join-table links. */
export async function listThreadProjects(
  userId: string,
  threadId: string,
): Promise<string[]> {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(userId, threadId);
  const { data: rows } = await admin
    .from("email_thread_projects")
    .select("project_id")
    .eq("thread_id", threadId);

  const ids: string[] = [];
  const primary = thread.project_id ? String(thread.project_id) : null;
  if (primary) ids.push(primary);
  for (const row of (rows || []) as any[]) {
    const value = String(row.project_id);
    if (value && !ids.includes(value)) ids.push(value);
  }
  return ids;
}

/** Adds an additional project association to a thread. If the thread has no
 *  primary project yet, the added project becomes the primary (mirrors
 *  assignProjectToThread); otherwise it is purely an extra membership. Returns
 *  the refreshed thread detail. */
export async function addProjectToThread(
  userId: string,
  threadId: string,
  projectId: string,
) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(userId, threadId);
  await ensureProjectAccess(userId, projectId);

  if (!thread.project_id) {
    // No primary yet — promote this to primary (runs reprocess + status update).
    return await assignProjectToThread(userId, threadId, projectId);
  }

  await admin
    .from("email_thread_projects")
    .upsert(
      { thread_id: threadId, project_id: projectId },
      { onConflict: "thread_id,project_id", ignoreDuplicates: true },
    );

  return await getThreadDetailForUser(userId, threadId);
}

/** Removes a project association from a thread. If the removed project was the
 *  primary, the next remaining association (if any) is promoted to primary;
 *  otherwise the primary is cleared. Returns the refreshed thread detail. */
export async function removeProjectFromThread(
  userId: string,
  threadId: string,
  projectId: string,
) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(userId, threadId);

  await admin
    .from("email_thread_projects")
    .delete()
    .eq("thread_id", threadId)
    .eq("project_id", projectId);

  if (String(thread.project_id || "") === String(projectId)) {
    const { data: remaining } = await admin
      .from("email_thread_projects")
      .select("project_id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const nextPrimary = remaining?.project_id
      ? String(remaining.project_id)
      : null;

    await admin
      .from("email_threads")
      .update({
        project_id: nextPrimary,
        needs_project: nextPrimary ? false : true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);
  }

  return await getThreadDetailForUser(userId, threadId);
}

export async function createTasksForThread(
  userId: string,
  threadId: string,
  projectId?: string | null,
) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(userId, threadId);
  const targetProjectId = projectId || thread.project_id;
  if (!targetProjectId) {
    throw new Error("Choose a project before generating tasks.");
  }

  await ensureProjectAccess(userId, targetProjectId);

  const suggestions = Array.isArray(thread.task_suggestions_json)
    ? (thread.task_suggestions_json as InboxTaskSuggestion[])
    : [];

  const taskSuggestions =
    suggestions.length > 0
      ? suggestions
      : [
          {
            name: thread.action_title,
            description:
              thread.summary_text || thread.preview_text || thread.subject,
            priority: 3 as const,
          },
        ];

  const created = await createTasksForThreadInternal({
    actorUserId: userId,
    thread,
    projectId: targetProjectId,
    suggestions: taskSuggestions,
    generatedBy: "user",
  });

  // AI-memory hook: user taskified an email (best-effort).
  try {
    await maybeCreateAIMemoryFromEvent(admin, {
      user_id: userId,
      source_type: "email",
      source_id: String(thread.id),
      event_type: "email_taskified",
      after_json: {
        subject: thread.subject,
        summary: thread.summary_text,
        project_id: targetProjectId,
        task_count: taskSuggestions.length,
      },
      reason: "user_approved",
    });
  } catch (e) {
    console.error("AI-memory email_taskified hook failed:", e);
  }

  return created;
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function uniqueEmails(values: string[]) {
  return uniqueStrings(values.map((value) => value.toLowerCase()));
}

async function saveInternalThreadNote(params: {
  userId: string;
  threadId: string;
  content: string;
  contentHtml?: string;
}) {
  const admin = getAdminClient();
  const { data: link } = await admin
    .from("email_thread_tasks")
    .select("task_id")
    .eq("thread_id", params.threadId)
    .limit(1)
    .maybeSingle();

  if (!link?.task_id) {
    throw new Error("Create or link a task before leaving an internal note.");
  }

  const content = normalizeRichText(params.contentHtml || params.content);
  const { data: inserted } = await admin
    .from("comments")
    .insert({
      task_id: link.task_id,
      user_id: params.userId,
      content,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  return inserted;
}

async function resolveThreadReplyEnvelope(params: {
  threadId: string;
  mailbox: MailboxTransportRow;
}) {
  const admin = getAdminClient();
  const { data: messages } = await admin
    .from("email_messages")
    .select("*")
    .eq("thread_id", params.threadId)
    .order("received_at", { ascending: false })
    .order("sent_at", { ascending: false });

  const latestMessage = messages?.[0];
  if (!latestMessage) {
    throw new Error("No thread messages available to reply to.");
  }

  const metadata = latestMessage.metadata_json || {};
  const mailboxEmail = params.mailbox.email_address.toLowerCase();
  const to = mapReplyAddressList([
    ...((metadata.from || []) as any[]).map((entry) => ({
      email: entry.email,
      name: entry.name || null,
    })),
    ...((metadata.to || []) as any[]).map((entry) => ({
      email: entry.email,
      name: entry.name || null,
    })),
  ]).filter((entry) => entry.email.toLowerCase() !== mailboxEmail);
  const cc = mapReplyAddressList(
    ((metadata.cc || []) as any[]).map((entry) => ({
      email: entry.email,
      name: entry.name || null,
    })),
  ).filter((entry) => entry.email.toLowerCase() !== mailboxEmail);

  const dedupedTo = mapReplyAddressList(
    uniqueEmails(to.map((entry) => entry.email)).map((email) => {
      const match = to.find((entry) => entry.email.toLowerCase() === email);
      return {
        email,
        name: match?.name || null,
      };
    }),
  );
  const dedupedCc = mapReplyAddressList(
    uniqueEmails(cc.map((entry) => entry.email)).map((email) => {
      const match = cc.find((entry) => entry.email.toLowerCase() === email);
      return {
        email,
        name: match?.name || null,
      };
    }),
  );

  if (dedupedTo.length === 0) {
    throw new Error("No external recipients available for reply.");
  }

  return {
    latestMessage,
    to: dedupedTo,
    cc: dedupedCc,
    references: uniqueStrings(
      (messages || [])
        .map((message: any) => String(message.internet_message_id || "").trim())
        .filter(Boolean),
    ),
  };
}

async function resolveReplyAttachmentPayloads(
  attachments: EmailReplyAttachment[],
) {
  const admin = getAdminClient();

  return Promise.all(
    (attachments || []).map(async (attachment) => {
      if (
        attachment.storageProvider !== "supabase" ||
        !attachment.url ||
        !attachment.name
      ) {
        throw new Error(
          `Unsupported attachment source for ${attachment.name || "file"}.`,
        );
      }

      const { data, error } = await admin.storage
        .from("task-attachments")
        .download(attachment.url);

      if (error || !data) {
        throw new Error(
          `Failed to download attachment ${attachment.name}: ${error?.message || "unknown error"}`,
        );
      }

      let publicUrl: string | null = null;
      if (attachment.inline) {
        const { data: signed, error: signedUrlError } = await admin.storage
          .from("task-attachments")
          .createSignedUrl(attachment.url, 60 * 60 * 24 * 30);

        if (signedUrlError || !signed?.signedUrl) {
          throw new Error(
            `Failed to create inline URL for ${attachment.name}: ${signedUrlError?.message || "unknown error"}`,
          );
        }

        publicUrl = signed.signedUrl;
      }

      return {
        ...attachment,
        publicUrl,
        buffer: Buffer.from(await data.arrayBuffer()),
      };
    }),
  );
}

async function sendThreadReplyMessage(params: {
  threadId: string;
  mailbox: MailboxTransportRow;
  subject: string;
  contentHtml: string;
  signatureText?: string | null;
  attachments?: EmailReplyAttachment[];
  to?: EmailReplyAddress[];
  cc?: EmailReplyAddress[];
}) {
  const admin = getAdminClient();
  const envelope = await resolveThreadReplyEnvelope({
    threadId: params.threadId,
    mailbox: params.mailbox,
  });
  const to = params.to && params.to.length > 0 ? params.to : envelope.to;
  const cc = params.cc && params.cc.length > 0 ? params.cc : envelope.cc;
  const attachmentPayloads = await resolveReplyAttachmentPayloads(
    params.attachments || [],
  );

  const normalizedHtml = buildReplyHtml({
    contentHtml: params.contentHtml,
    signatureText: params.signatureText,
    attachments: attachmentPayloads,
  });
  const normalizedText = buildReplyPlainText({
    contentHtml: params.contentHtml,
    signatureText: params.signatureText,
    attachments: attachmentPayloads,
  });

  const info = await sendMailboxReply({
    mailbox: params.mailbox,
    to: to.map((entry) => entry.email),
    cc: cc.map((entry) => entry.email),
    subject: params.subject,
    text: normalizedText,
    html: normalizedHtml,
    attachments: attachmentPayloads.map((attachment) => ({
      filename: attachment.name,
      content: attachment.buffer,
      contentType: attachment.mimeType || null,
      contentDisposition: attachment.inline ? "inline" : "attachment",
    })),
    inReplyTo: envelope.latestMessage.internet_message_id ?? null,
    references: envelope.references,
  });

  const timestamp = new Date().toISOString();
  const { data: inserted } = await admin
    .from("email_messages")
    .insert({
      thread_id: params.threadId,
      mailbox_id: params.mailbox.id,
      direction: "outbound",
      provider_message_id: null,
      internet_message_id: info.messageId || null,
      in_reply_to_message_id:
        envelope.latestMessage.internet_message_id ?? null,
      subject: params.subject,
      body_text: normalizedText,
      body_html: normalizedHtml,
      sent_at: timestamp,
      raw_headers: {},
      metadata_json: {
        from: [
          {
            email: params.mailbox.email_address,
            name: params.mailbox.display_name || null,
          },
        ],
        to,
        cc,
      },
    })
    .select()
    .single();

  if (inserted?.id) {
    await persistParticipants(params.threadId, inserted.id, params.mailbox, {
      from: [
        {
          email: params.mailbox.email_address,
          name: params.mailbox.display_name || null,
        },
      ],
      to,
      cc,
    });
  }

  await admin
    .from("email_threads")
    .update({
      latest_outbound_at: timestamp,
      latest_message_at: timestamp,
      is_unread: false,
      updated_at: timestamp,
    })
    .eq("id", params.threadId);

  return inserted;
}

export async function replyToThread(params: {
  userId: string;
  threadId: string;
  content: string;
  contentHtml?: string;
  signatureText?: string | null;
  attachments?: EmailReplyAttachment[];
  mode: "reply_all" | "internal_note";
}) {
  const thread = await ensureThreadAccess(params.userId, params.threadId);
  const mailbox = (await ensureMailboxAccess(
    params.userId,
    String(thread.mailbox_id),
  )) as MailboxTransportRow;

  if (params.mode === "internal_note") {
    return saveInternalThreadNote({
      userId: params.userId,
      threadId: params.threadId,
      content: params.content,
      contentHtml: params.contentHtml,
    });
  }

  const subject = /^re:/i.test(thread.subject || "")
    ? thread.subject
    : `Re: ${thread.subject}`;

  return sendThreadReplyMessage({
    threadId: params.threadId,
    mailbox,
    subject,
    contentHtml: params.contentHtml || params.content,
    signatureText: params.signatureText,
    attachments: params.attachments,
  });
}

export type UnsubscribeStepResult = {
  attempted: boolean;
  ok: boolean;
  detail: string | null;
};

export type UnsubscribeResult = {
  link: UnsubscribeStepResult;
  reply: UnsubscribeStepResult;
  removed: UnsubscribeStepResult;
};

/**
 * Parse an RFC 2369 `List-Unsubscribe` header into its http(s) and mailto
 * targets. The header is a comma-separated list of angle-bracketed URIs, e.g.
 * `<https://ex.com/u?x=1>, <mailto:unsub@ex.com?subject=unsubscribe>`.
 */
function parseListUnsubscribe(headerValue: string | undefined | null): {
  httpUrl: string | null;
  mailto: string | null;
} {
  if (!headerValue) return { httpUrl: null, mailto: null };
  let httpUrl: string | null = null;
  let mailto: string | null = null;
  const matches = headerValue.match(/<([^>]+)>/g) || [];
  for (const raw of matches) {
    const value = raw.slice(1, -1).trim();
    if (/^https?:\/\//i.test(value)) {
      if (!httpUrl) httpUrl = value;
    } else if (/^mailto:/i.test(value)) {
      if (!mailto) mailto = value;
    }
  }
  return { httpUrl, mailto };
}

/**
 * One-shot "unsubscribe" for a thread. Runs three independent steps and reports
 * each one's outcome so the caller can surface a separate alert per step:
 *   1. link   — visit / POST the sender's List-Unsubscribe URL (one-click when
 *               the message advertises `List-Unsubscribe-Post`).
 *   2. reply  — send a reply with subject + body "unsubscribe" to the sender.
 *   3. removed— delete the thread from the inbox.
 * A failure in one step never blocks the others; each result is returned so the
 * UI can revert its optimistic removal only when the delete step fails.
 */
export async function unsubscribeThread(params: {
  userId: string;
  threadId: string;
}): Promise<UnsubscribeResult> {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(params.userId, params.threadId);
  const mailbox = (await ensureMailboxAccess(
    params.userId,
    String(thread.mailbox_id),
  )) as MailboxTransportRow;

  const { data: messages } = await admin
    .from("email_messages")
    .select("direction,raw_headers")
    .eq("thread_id", params.threadId);

  // Prefer the List-Unsubscribe from an inbound message; fall back to any.
  let httpUrl: string | null = null;
  let oneClick = false;
  const ordered = [...(messages || [])].sort((a: any, b: any) =>
    a?.direction === "inbound" ? -1 : b?.direction === "inbound" ? 1 : 0,
  );
  for (const message of ordered) {
    const headers = (message?.raw_headers || {}) as Record<string, string>;
    const parsed = parseListUnsubscribe(headers["list-unsubscribe"]);
    if (parsed.httpUrl || parsed.mailto) {
      httpUrl = parsed.httpUrl;
      oneClick = /one-click/i.test(headers["list-unsubscribe-post"] || "");
      break;
    }
  }

  // Step 1 — visit / POST the unsubscribe link.
  const link: UnsubscribeStepResult = {
    attempted: false,
    ok: false,
    detail: null,
  };
  if (httpUrl) {
    link.attempted = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const response = oneClick
        ? await fetch(httpUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
            signal: controller.signal,
          })
        : await fetch(httpUrl, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      link.ok = response.ok;
      link.detail = response.ok ? null : `HTTP ${response.status}`;
    } catch (error) {
      link.detail = error instanceof Error ? error.message : String(error);
    }
  } else {
    link.detail = "No unsubscribe link in this email";
  }

  // Step 2 — reply "unsubscribe" (subject + body) to the sender.
  const reply: UnsubscribeStepResult = {
    attempted: true,
    ok: false,
    detail: null,
  };
  try {
    await sendThreadReplyMessage({
      threadId: params.threadId,
      mailbox,
      subject: "unsubscribe",
      contentHtml: "<p>unsubscribe</p>",
    });
    reply.ok = true;
  } catch (error) {
    reply.detail = error instanceof Error ? error.message : String(error);
  }

  // Step 3 — delete the thread.
  const removed: UnsubscribeStepResult = {
    attempted: true,
    ok: false,
    detail: null,
  };
  try {
    await applyThreadAction({
      userId: params.userId,
      threadId: params.threadId,
      action: "delete",
    });
    removed.ok = true;
  } catch (error) {
    removed.detail = error instanceof Error ? error.message : String(error);
  }

  return { link, reply, removed };
}

export async function createReplyDraft(params: {
  userId: string;
  threadId: string;
  source: "manual" | "ai";
  replyMode: "reply_all" | "internal_note";
  subject?: string | null;
  contentText?: string | null;
  contentHtml?: string | null;
  signatureText?: string | null;
  attachments?: EmailReplyAttachment[];
  to?: EmailReplyAddress[];
  cc?: EmailReplyAddress[];
  status?: EmailReplyDraft["status"];
  scheduledFor?: string | null;
  contextSnapshot?: Record<string, unknown>;
  aiMetadata?: Record<string, unknown>;
}) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(params.userId, params.threadId);
  const mailbox = (await ensureMailboxAccess(
    params.userId,
    String(thread.mailbox_id),
  )) as MailboxTransportRow;
  const envelope =
    params.replyMode === "reply_all"
      ? await resolveThreadReplyEnvelope({
          threadId: params.threadId,
          mailbox,
        })
      : null;
  const scheduledFor = params.scheduledFor
    ? new Date(params.scheduledFor).toISOString()
    : null;
  const nextStatus = params.status || (scheduledFor ? "scheduled" : "draft");

  if (params.replyMode === "internal_note" && nextStatus === "scheduled") {
    throw new Error("Internal notes cannot be scheduled.");
  }

  const payload = {
    thread_id: params.threadId,
    mailbox_id: mailbox.id,
    project_id: thread.project_id ?? null,
    created_by_user_id: params.userId,
    source: params.source,
    status: nextStatus,
    reply_mode: params.replyMode,
    subject:
      params.subject?.trim() ||
      (/^re:/i.test(thread.subject || "")
        ? thread.subject
        : `Re: ${thread.subject}`),
    content_text: params.contentText ?? null,
    content_html: params.contentHtml
      ? normalizeRichText(params.contentHtml)
      : null,
    signature_text: params.signatureText ?? null,
    to_json:
      params.replyMode === "reply_all" ? params.to || envelope?.to || [] : [],
    cc_json:
      params.replyMode === "reply_all" ? params.cc || envelope?.cc || [] : [],
    attachments_json: params.attachments || [],
    scheduled_for: scheduledFor,
    last_error: null,
    context_snapshot_json: params.contextSnapshot || {},
    ai_metadata_json: params.aiMetadata || {},
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from("email_reply_drafts")
    .select("*")
    .eq("thread_id", params.threadId)
    .eq("reply_mode", params.replyMode)
    .in("status", ACTIVE_REPLY_DRAFT_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let row = null;

  if (existing?.id) {
    const { data: updated, error } = await admin
      .from("email_reply_drafts")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    row = updated;
  } else {
    const { data: inserted, error } = await admin
      .from("email_reply_drafts")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        const { data: concurrent } = await admin
          .from("email_reply_drafts")
          .select("*")
          .eq("thread_id", params.threadId)
          .eq("reply_mode", params.replyMode)
          .in("status", ACTIVE_REPLY_DRAFT_STATUSES)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (concurrent?.id) {
          const { data: updated } = await admin
            .from("email_reply_drafts")
            .update(payload)
            .eq("id", concurrent.id)
            .select("*")
            .single();
          row = updated;
        }
      } else {
        throw error;
      }
    } else {
      row = inserted;
    }
  }

  if (!row) {
    throw new Error("Failed to save reply draft.");
  }

  return coerceReplyDraft(row, {
    mailboxName: mailbox.display_name || mailbox.email_address,
    mailboxEmailAddress: mailbox.email_address,
    threadSubject: thread.subject,
  });
}

export async function updateReplyDraft(params: {
  userId: string;
  draftId: string;
  subject?: string | null;
  contentText?: string | null;
  contentHtml?: string | null;
  signatureText?: string | null;
  attachments?: EmailReplyAttachment[];
  to?: EmailReplyAddress[];
  cc?: EmailReplyAddress[];
  scheduledFor?: string | null;
  status?: EmailReplyDraft["status"];
}) {
  const admin = getAdminClient();
  const draft = await ensureReplyDraftAccess(params.userId, params.draftId);
  const nextStatus = params.status || draft.status;
  const scheduledFor =
    params.scheduledFor === undefined
      ? draft.scheduled_for
      : params.scheduledFor
        ? new Date(params.scheduledFor).toISOString()
        : null;

  if (draft.reply_mode === "internal_note" && nextStatus === "scheduled") {
    throw new Error("Internal notes cannot be scheduled.");
  }

  const { data: updated, error } = await admin
    .from("email_reply_drafts")
    .update({
      subject:
        params.subject === undefined
          ? draft.subject
          : String(params.subject || "").trim() || draft.subject,
      content_text:
        params.contentText === undefined
          ? draft.content_text
          : params.contentText,
      content_html:
        params.contentHtml === undefined
          ? draft.content_html
          : params.contentHtml
            ? normalizeRichText(params.contentHtml)
            : null,
      signature_text:
        params.signatureText === undefined
          ? draft.signature_text
          : params.signatureText,
      attachments_json:
        params.attachments === undefined
          ? draft.attachments_json
          : params.attachments,
      to_json: params.to === undefined ? draft.to_json : params.to,
      cc_json: params.cc === undefined ? draft.cc_json : params.cc,
      scheduled_for: scheduledFor,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.draftId)
    .select("*")
    .single();

  if (error || !updated) {
    throw error || new Error("Failed to update reply draft.");
  }

  return coerceReplyDraft(updated);
}

export async function scheduleReplyDraft(params: {
  userId: string;
  draftId: string;
  scheduledFor: string;
}) {
  const timestamp = new Date(params.scheduledFor);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Choose a valid scheduled send time.");
  }

  return updateReplyDraft({
    userId: params.userId,
    draftId: params.draftId,
    scheduledFor: timestamp.toISOString(),
    status: "scheduled",
  });
}

async function executeReplyDraftSend(draft: any) {
  const admin = getAdminClient();
  const thread = await admin
    .from("email_threads")
    .select("*")
    .eq("id", draft.thread_id)
    .maybeSingle();

  if (!thread.data) {
    throw new Error("Email thread not found");
  }

  const mailbox = (
    await admin
      .from("mailboxes")
      .select("*")
      .eq("id", draft.mailbox_id)
      .maybeSingle()
  ).data as MailboxTransportRow | null;

  if (!mailbox) {
    throw new Error("Mailbox not found");
  }

  const actorUserId = draft.created_by_user_id || thread.data.owner_user_id;

  if (!actorUserId) {
    throw new Error("Reply draft is missing an owner.");
  }

  if (draft.reply_mode === "internal_note") {
    await saveInternalThreadNote({
      userId: String(actorUserId),
      threadId: String(draft.thread_id),
      content: String(draft.content_text || ""),
      contentHtml: draft.content_html || draft.content_text || "",
    });
  } else {
    await sendThreadReplyMessage({
      threadId: String(draft.thread_id),
      mailbox,
      subject: String(draft.subject || thread.data.subject || ""),
      contentHtml: String(draft.content_html || draft.content_text || ""),
      signatureText: draft.signature_text || null,
      attachments: Array.isArray(draft.attachments_json)
        ? draft.attachments_json
        : [],
      to: mapReplyAddressList(draft.to_json),
      cc: mapReplyAddressList(draft.cc_json),
    });
  }

  const { data: updated } = await admin
    .from("email_reply_drafts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      last_error: null,
      scheduled_for: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draft.id)
    .select("*")
    .single();

  return updated ? coerceReplyDraft(updated) : null;
}

export async function sendReplyDraftNow(params: {
  userId: string;
  draftId: string;
}) {
  const admin = getAdminClient();
  const draft = await ensureReplyDraftAccess(params.userId, params.draftId);

  await admin
    .from("email_reply_drafts")
    .update({
      status: "sending",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draft.id);

  try {
    return await executeReplyDraftSend(draft);
  } catch (error) {
    await admin
      .from("email_reply_drafts")
      .update({
        status: "failed",
        last_error:
          error instanceof Error
            ? error.message
            : "Failed to send reply draft.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);
    throw error;
  }
}

async function executeOutboundDraftSend(draft: any) {
  const admin = getAdminClient();
  const mailbox = (await admin
    .from("mailboxes")
    .select("*")
    .eq("id", draft.mailbox_id)
    .maybeSingle()).data as MailboxTransportRow | null;

  if (!mailbox) {
    throw new Error("Mailbox not found");
  }

  const { to } = validateOutboundDraftForSend(draft);
  const cc = mapReplyAddressList(draft.cc_json);
  const bcc = mapReplyAddressList(draft.bcc_json);
  const attachmentPayloads = await resolveReplyAttachmentPayloads(
    Array.isArray(draft.attachments_json) ? draft.attachments_json : [],
  );
  const subject = String(draft.subject || "").trim();
  const contentHtml = String(draft.content_html || draft.content_text || "");
  const signatureText = draft.signature_text || null;
  const normalizedHtml = buildReplyHtml({
    contentHtml,
    signatureText,
    attachments: attachmentPayloads,
  });
  const normalizedText = buildReplyPlainText({
    contentHtml,
    signatureText,
    attachments: attachmentPayloads,
  });

  const info = await sendMailboxReply({
    mailbox,
    to: to.map((entry) => entry.email),
    cc: cc.map((entry) => entry.email),
    bcc: bcc.map((entry) => entry.email),
    subject,
    text: normalizedText,
    html: normalizedHtml,
    attachments: attachmentPayloads.map((attachment) => ({
      filename: attachment.name,
      content: attachment.buffer,
      contentType: attachment.mimeType || null,
      contentDisposition: attachment.inline ? "inline" : "attachment",
    })),
  });

  const timestamp = new Date().toISOString();
  const threadKey = buildOutboundThreadKey({
    mailboxId: String(mailbox.id),
    subject,
    primaryRecipientEmail: to[0]?.email || null,
  });

  const { data: insertedThread, error: threadInsertError } = await admin
    .from("email_threads")
    .insert({
      mailbox_id: mailbox.id,
      project_id: draft.project_id ?? null,
      summary_profile_id: (mailbox as any).summary_profile_id ?? null,
      owner_user_id: draft.created_by_user_id || (mailbox as any).owner_user_id,
      provider_thread_id: null,
      thread_key: threadKey,
      origin: "outbound",
      status: "resolved",
      classification: "waiting",
      resolution_state: "open",
      action_title: subject || "Sent email",
      subject,
      normalized_subject: normalizeSubject(subject),
      preview_text: extractPlainTextPreview(normalizedText, 240),
      is_unread: false,
      latest_message_at: timestamp,
      latest_outbound_at: timestamp,
      latest_inbound_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select("*")
    .single();

  let threadRow = insertedThread;
  if (threadInsertError && isUniqueViolation(threadInsertError)) {
    const { data: existingThread, error: threadLookupError } = await admin
      .from("email_threads")
      .select("*")
      .eq("mailbox_id", mailbox.id)
      .eq("thread_key", threadKey)
      .maybeSingle();

    if (!existingThread?.id) {
      throw new Error(
        threadLookupError?.message || threadInsertError.message,
      );
    }

    const { data: updatedThread, error: threadUpdateError } = await admin
      .from("email_threads")
      .update({
        project_id: draft.project_id ?? existingThread.project_id ?? null,
        origin:
          existingThread.origin === "inbound" ? "mixed" : existingThread.origin,
        status: "resolved",
        classification: "waiting",
        resolution_state: "open",
        action_title: subject || "Sent email",
        subject,
        normalized_subject: normalizeSubject(subject),
        preview_text: extractPlainTextPreview(normalizedText, 240),
        is_unread: false,
        latest_message_at: timestamp,
        latest_outbound_at: timestamp,
        updated_at: timestamp,
      })
      .eq("id", existingThread.id)
      .select("*")
      .single();

    if (threadUpdateError || !updatedThread) {
      throw threadUpdateError || new Error("Failed to update outbound thread.");
    }
    threadRow = updatedThread;
  } else if (threadInsertError || !insertedThread) {
    throw threadInsertError || new Error("Failed to create outbound thread.");
  }

  const { data: insertedMessage, error: messageInsertError } = await admin
    .from("email_messages")
    .insert({
      thread_id: threadRow.id,
      mailbox_id: mailbox.id,
      direction: "outbound",
      provider_message_id: null,
      internet_message_id: info.messageId || null,
      in_reply_to_message_id: null,
      subject,
      body_text: normalizedText,
      body_html: normalizedHtml,
      sent_at: timestamp,
      raw_headers: {},
      metadata_json: {
        from: [
          {
            email: mailbox.email_address,
            name: mailbox.display_name || null,
          },
        ],
        to,
        cc,
        bcc,
      },
    })
    .select("*")
    .single();

  if (messageInsertError || !insertedMessage?.id) {
    throw messageInsertError || new Error("Failed to store outbound email.");
  }

  await persistParticipants(String(threadRow.id), insertedMessage.id, mailbox, {
    from: [
      {
        email: mailbox.email_address,
        name: mailbox.display_name || null,
      },
    ],
    to,
    cc,
    bcc,
  });

  const { data: updatedDraft } = await admin
    .from("email_outbound_drafts")
    .update({
      status: "sent",
      sent_at: timestamp,
      last_error: null,
      scheduled_for: null,
      updated_at: timestamp,
    })
    .eq("id", draft.id)
    .select("*")
    .single();

  return updatedDraft
    ? coerceOutboundDraft(updatedDraft, {
        threadId: String(threadRow.id),
      })
    : null;
}

export async function scheduleOutboundDraft(params: {
  userId: string;
  draftId: string;
  scheduledFor: string;
}) {
  const timestamp = new Date(params.scheduledFor);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Choose a valid scheduled send time.");
  }

  return updateOutboundDraft({
    userId: params.userId,
    draftId: params.draftId,
    scheduledFor: timestamp.toISOString(),
    status: "scheduled",
  });
}

/**
 * Best-effort: save every To/Cc/Bcc recipient of a sent draft as a personal
 * contact so future composes autocomplete them. createPersonalContact is
 * idempotent (returns the existing row on a repeat email), and a failure here
 * must never fail — or delay reporting — the send itself.
 */
async function saveOutboundRecipientsAsContacts(userId: string, draft: any) {
  const recipients = [
    ...mapReplyAddressList(draft.to_json),
    ...mapReplyAddressList(draft.cc_json),
    ...mapReplyAddressList(draft.bcc_json),
  ];
  for (const recipient of recipients) {
    if (!recipient?.email || !recipient.email.includes("@")) continue;
    try {
      await createPersonalContact({
        userId,
        input: {
          email: recipient.email,
          displayName: recipient.name || null,
          source: "outbound",
        },
      });
    } catch {
      // Best-effort only.
    }
  }
}

export async function sendOutboundDraftNow(params: {
  userId: string;
  draftId: string;
}) {
  const admin = getAdminClient();
  const draft = await ensureOutboundDraftAccess(params.userId, params.draftId);

  await admin
    .from("email_outbound_drafts")
    .update({
      status: "sending",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draft.id);

  try {
    const sent = await executeOutboundDraftSend(draft);
    // Fire-and-forget: recipients become Contacts without delaying the send
    // response.
    void saveOutboundRecipientsAsContacts(params.userId, draft).catch(() => {});
    return sent;
  } catch (error) {
    await admin
      .from("email_outbound_drafts")
      .update({
        status: "failed",
        last_error:
          error instanceof Error
            ? error.message
            : "Failed to send outbound draft.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);
    throw error;
  }
}

export async function listReplyDraftsForUser(
  userId: string,
  options: {
    status?: string;
    mailboxId?: string;
    projectId?: string;
    source?: string;
  } = {},
) {
  const admin = getAdminClient();
  const mailboxes = await listMailboxesForUser(userId);
  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);

  if (mailboxIds.length === 0) {
    return [];
  }

  let query = admin
    .from("email_reply_drafts")
    .select("*")
    .in("mailbox_id", mailboxIds)
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }
  if (options.mailboxId) {
    query = query.eq("mailbox_id", options.mailboxId);
  }
  if (options.projectId) {
    query = query.eq("project_id", options.projectId);
  }
  if (options.source) {
    query = query.eq("source", options.source);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) {
    return [];
  }

  const threadIds = rows.map((row: any) => String(row.thread_id));
  const projectIds = rows
    .map((row: any) => String(row.project_id || ""))
    .filter(Boolean);
  const [{ data: threads }, { data: participants }, { data: projects }] =
    await Promise.all([
      admin.from("email_threads").select("id,subject").in("id", threadIds),
      admin
        .from("email_participants")
        .select("*")
        .in("thread_id", threadIds)
        .eq("participant_role", "from"),
      projectIds.length > 0
        ? admin.from("projects").select("id,name").in("id", projectIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const mailboxMap = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const threadMap = new Map(
    (threads || []).map((row: any) => [String(row.id), row]),
  );
  const projectMap = new Map(
    (projects || []).map((row: any) => [String(row.id), row]),
  );
  const senderMap = new Map<string, InboxParticipant>();

  (participants || []).forEach((row: any) => {
    if (!senderMap.has(String(row.thread_id))) {
      senderMap.set(String(row.thread_id), mapParticipantRow(row));
    }
  });

  return rows.map((row: any) => {
    const sender = senderMap.get(String(row.thread_id));
    const mailbox = mailboxMap.get(String(row.mailbox_id)) as
      | Mailbox
      | undefined;
    const project = row.project_id
      ? (projectMap.get(String(row.project_id)) as
          | { name?: string }
          | undefined)
      : null;
    const threadRow = threadMap.get(String(row.thread_id)) as
      | { subject?: string | null }
      | undefined;

    return coerceReplyDraft(row, {
      mailboxName: mailbox?.name || null,
      mailboxEmailAddress: mailbox?.emailAddress || null,
      projectName: project?.name || null,
      senderName: sender?.displayName || null,
      senderEmail: sender?.emailAddress || null,
      threadSubject: threadRow?.subject || null,
    });
  });
}

export async function listOutboundDraftsForUser(
  userId: string,
  options: {
    status?: string;
    mailboxId?: string;
    projectId?: string;
  } = {},
) {
  const admin = getAdminClient();
  const mailboxes = await listMailboxesForUser(userId);
  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);

  if (mailboxIds.length === 0) {
    return [];
  }

  let query = admin
    .from("email_outbound_drafts")
    .select("*")
    .in("mailbox_id", mailboxIds)
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }
  if (options.mailboxId) {
    query = query.eq("mailbox_id", options.mailboxId);
  }
  if (options.projectId) {
    query = query.eq("project_id", options.projectId);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) {
    return [];
  }

  const mailboxMap = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const projectIds = rows
    .map((row: any) => String(row.project_id || ""))
    .filter(Boolean);
  const { data: projects } =
    projectIds.length > 0
      ? await admin.from("projects").select("id,name").in("id", projectIds)
      : { data: [] as any[] };
  const projectMap = new Map(
    (projects || []).map((row: any) => [String(row.id), row]),
  );

  return rows.map((row: any) => {
    const mailbox = mailboxMap.get(String(row.mailbox_id));
    const project = row.project_id
      ? projectMap.get(String(row.project_id))
      : null;

    return coerceOutboundDraft(row, {
      mailboxName: mailbox?.name || null,
      mailboxEmailAddress: mailbox?.emailAddress || null,
      projectName: (project as any)?.name || null,
    });
  });
}

export async function createOutboundDraft(params: {
  userId: string;
  mailboxId: string;
  projectId?: string | null;
  subject?: string | null;
  contentText?: string | null;
  contentHtml?: string | null;
  signatureText?: string | null;
  attachments?: EmailReplyAttachment[];
  to?: EmailReplyAddress[];
  cc?: EmailReplyAddress[];
  bcc?: EmailReplyAddress[];
  status?: EmailOutboundDraft["status"];
  scheduledFor?: string | null;
}) {
  const admin = getAdminClient();
  const mailbox = (await ensureMailboxAccess(
    params.userId,
    params.mailboxId,
  )) as MailboxTransportRow;

  if (params.projectId) {
    await ensureProjectAccess(params.userId, params.projectId);
  }

  const scheduledFor = params.scheduledFor
    ? new Date(params.scheduledFor).toISOString()
    : null;
  const nextStatus = params.status || (scheduledFor ? "scheduled" : "draft");

  const { data: inserted, error } = await admin
    .from("email_outbound_drafts")
    .insert({
      mailbox_id: mailbox.id,
      project_id: params.projectId ?? null,
      created_by_user_id: params.userId,
      status: nextStatus,
      subject: String(params.subject || "").trim(),
      content_text: params.contentText ?? null,
      content_html: params.contentHtml
        ? normalizeRichText(params.contentHtml)
        : null,
      signature_text: params.signatureText ?? null,
      to_json: normalizeAddressList(params.to),
      cc_json: normalizeAddressList(params.cc),
      bcc_json: normalizeAddressList(params.bcc),
      attachments_json: params.attachments || [],
      scheduled_for: scheduledFor,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !inserted) {
    throw error || new Error("Failed to save outbound draft.");
  }

  const project = params.projectId
    ? await ensureProjectAccess(params.userId, params.projectId)
    : null;

  return coerceOutboundDraft(inserted, {
    mailboxName: mailbox.display_name || mailbox.email_address,
    mailboxEmailAddress: mailbox.email_address,
    projectName: project?.name || null,
  });
}

export async function updateOutboundDraft(params: {
  userId: string;
  draftId: string;
  mailboxId?: string;
  projectId?: string | null;
  subject?: string | null;
  contentText?: string | null;
  contentHtml?: string | null;
  signatureText?: string | null;
  attachments?: EmailReplyAttachment[];
  to?: EmailReplyAddress[];
  cc?: EmailReplyAddress[];
  bcc?: EmailReplyAddress[];
  scheduledFor?: string | null;
  status?: EmailOutboundDraft["status"];
}) {
  const admin = getAdminClient();
  const draft = await ensureOutboundDraftAccess(params.userId, params.draftId);
  const nextMailboxId = params.mailboxId || String(draft.mailbox_id);
  const mailbox = (await ensureMailboxAccess(
    params.userId,
    nextMailboxId,
  )) as MailboxTransportRow;

  if (params.projectId) {
    await ensureProjectAccess(params.userId, params.projectId);
  }

  const nextStatus = params.status || draft.status;
  const scheduledFor =
    params.scheduledFor === undefined
      ? draft.scheduled_for
      : params.scheduledFor
        ? new Date(params.scheduledFor).toISOString()
        : null;

  const { data: updated, error } = await admin
    .from("email_outbound_drafts")
    .update({
      mailbox_id: mailbox.id,
      project_id:
        params.projectId === undefined ? draft.project_id : params.projectId,
      subject:
        params.subject === undefined
          ? draft.subject
          : String(params.subject || "").trim(),
      content_text:
        params.contentText === undefined
          ? draft.content_text
          : params.contentText,
      content_html:
        params.contentHtml === undefined
          ? draft.content_html
          : params.contentHtml
            ? normalizeRichText(params.contentHtml)
            : null,
      signature_text:
        params.signatureText === undefined
          ? draft.signature_text
          : params.signatureText,
      attachments_json:
        params.attachments === undefined
          ? draft.attachments_json
          : params.attachments,
      to_json:
        params.to === undefined ? draft.to_json : normalizeAddressList(params.to),
      cc_json:
        params.cc === undefined ? draft.cc_json : normalizeAddressList(params.cc),
      bcc_json:
        params.bcc === undefined
          ? draft.bcc_json
          : normalizeAddressList(params.bcc),
      scheduled_for: scheduledFor,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.draftId)
    .select("*")
    .single();

  if (error || !updated) {
    throw error || new Error("Failed to update outbound draft.");
  }

  const projectId = updated.project_id ? String(updated.project_id) : null;
  const project = projectId
    ? await ensureProjectAccess(params.userId, projectId)
    : null;

  return coerceOutboundDraft(updated, {
    mailboxName: mailbox.display_name || mailbox.email_address,
    mailboxEmailAddress: mailbox.email_address,
    projectName: project?.name || null,
  });
}

/**
 * Hard-deletes an unsent outbound draft. Used when the composer is closed with
 * "discard" so a draft row created by an earlier save/failed send doesn't linger
 * in Drafts. Sent drafts are left alone — they are the record of the send.
 */
export async function deleteOutboundDraft(params: {
  userId: string;
  draftId: string;
}) {
  const admin = getAdminClient();
  const draft = await ensureOutboundDraftAccess(params.userId, params.draftId);

  if (draft.status === "sent") {
    throw new Error("A sent email can't be discarded.");
  }

  // Provider-synced draft (composed in Gmail etc.): delete the provider copy
  // first, or the next sync's reconcile would re-add the row we're deleting.
  // Best-effort — a provider hiccup shouldn't block removing it from Focus; the
  // reconcile still prunes it once it's gone from the folder.
  if (draft.provider_message_id && draft.provider_folder_path) {
    try {
      const mailbox = (await ensureMailboxAccess(
        params.userId,
        String(draft.mailbox_id),
      )) as MailboxTransportRow;
      await deleteMailboxDraftMessage(
        mailbox,
        draft.provider_message_id,
        draft.provider_folder_path,
      );
    } catch (providerError) {
      console.error("[email] provider draft delete failed:", providerError);
    }
  }

  const { error } = await admin
    .from("email_outbound_drafts")
    .delete()
    .eq("id", params.draftId);

  if (error) throw error;

  return { id: params.draftId };
}

export async function deleteReplyDraft(params: {
  userId: string;
  draftId: string;
}) {
  const admin = getAdminClient();
  const draft = await ensureReplyDraftAccess(params.userId, params.draftId);
  if (draft.status === "sent") {
    throw new Error("A sent reply can't be discarded.");
  }
  const { error } = await admin
    .from("email_reply_drafts")
    .delete()
    .eq("id", params.draftId);
  if (error) throw error;
  return { id: params.draftId };
}

export async function generateAiReplyForThread(params: {
  userId: string;
  threadId: string;
  override?: EmailReplySettingsOverride | null;
}) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(params.userId, params.threadId);
  const mailbox = (await ensureMailboxAccess(
    params.userId,
    String(thread.mailbox_id),
  )) as MailboxTransportRow;
  const profile = await chooseSummaryProfile(mailbox, params.userId);
  const [{ data: messageRows }, { data: taskLinks }] = await Promise.all([
    admin
      .from("email_messages")
      .select("*")
      .eq("thread_id", params.threadId)
      .order("received_at", { ascending: true })
      .order("sent_at", { ascending: true }),
    admin
      .from("email_thread_tasks")
      .select("task_id")
      .eq("thread_id", params.threadId),
  ]);

  const linkedTaskIds = (taskLinks || [])
    .map((row: any) => String(row.task_id || ""))
    .filter(Boolean);
  const projectExport = thread.project_id
    ? await getProjectAiExportForUser(String(thread.project_id), params.userId)
    : null;
  const projectContext = projectExport
    ? buildProjectReplyContextSnapshot({
        projectExport,
        linkedTaskIds,
      })
    : null;
  const replySettings = await getUserEmailReplySettings(
    params.userId,
    params.override,
  );
  const conversation = ((messageRows || []) as any[]).map((row: any) =>
    coerceConversationEntry({
      ...row,
      author_name: row.metadata_json?.from?.[0]?.name ?? null,
      author_email: row.metadata_json?.from?.[0]?.email ?? null,
      type: "email",
    }),
  );
  const aiDraft = await generateReplyDraftWithAI({
    mailboxEmail: mailbox.email_address,
    subject: String(thread.subject || ""),
    conversation,
    profile,
    replySettings,
    threadAnalysis: {
      actionTitle: thread.action_title ?? null,
      summaryText: thread.summary_text ?? null,
      actionReason: thread.action_reason ?? null,
      taskSuggestions: Array.isArray(thread.task_suggestions_json)
        ? thread.task_suggestions_json
        : [],
    },
    projectContext,
  });

  return createReplyDraft({
    userId: params.userId,
    threadId: params.threadId,
    source: "ai",
    replyMode: "reply_all",
    subject: aiDraft.subject,
    contentText: aiDraft.contentText,
    contentHtml: aiDraft.contentHtml,
    contextSnapshot: {
      projectContext,
      linkedTaskIds,
      threadAnalysis: {
        actionTitle: thread.action_title ?? null,
        summaryText: thread.summary_text ?? null,
        actionReason: thread.action_reason ?? null,
      },
      generatedAt: new Date().toISOString(),
    },
    aiMetadata: {
      rationale: aiDraft.rationale,
      confidence: aiDraft.confidence,
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? null,
      replySettings,
    },
  });
}

export async function processScheduledReplyDrafts() {
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const { data: rows } = await admin
    .from("email_reply_drafts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(100);

  let sentCount = 0;
  let failedCount = 0;

  for (const row of rows || []) {
    await admin
      .from("email_reply_drafts")
      .update({
        status: "sending",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    try {
      await executeReplyDraftSend(row);
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await admin
        .from("email_reply_drafts")
        .update({
          status: "failed",
          last_error:
            error instanceof Error
              ? error.message
              : "Failed to send reply draft.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }

  return {
    processedCount: (rows || []).length,
    sentCount,
    failedCount,
  };
}

export async function processScheduledOutboundDrafts() {
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const { data: rows } = await admin
    .from("email_outbound_drafts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(100);

  let sentCount = 0;
  let failedCount = 0;

  for (const row of rows || []) {
    await admin
      .from("email_outbound_drafts")
      .update({
        status: "sending",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    try {
      await executeOutboundDraftSend(row);
      // Scheduled sends save recipients as contacts too (see the immediate
      // path in sendOutboundDraftNow).
      if (row.created_by_user_id) {
        void saveOutboundRecipientsAsContacts(
          String(row.created_by_user_id),
          row,
        ).catch(() => {});
      }
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await admin
        .from("email_outbound_drafts")
        .update({
          status: "failed",
          last_error:
            error instanceof Error
              ? error.message
              : "Failed to send outbound draft.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }

  return {
    processedCount: (rows || []).length,
    sentCount,
    failedCount,
  };
}

/**
 * Record a thread as a labeled spam/not-spam example for the k-NN classifier.
 *
 * Every place the user states a spam verdict has to call this, or the corpus
 * never grows and `classifySpam` stays gated at zero confidence — a silent
 * failure, because the click still looks like it worked.
 *
 * Best-effort: training must never break the action the user actually asked for.
 */
async function recordThreadSpamTrainingLabel(params: {
  threadId: string;
  thread: any;
  mailbox: any;
  label: "spam" | "not_spam";
}) {
  try {
    const latestMessage = await getLatestThreadMessage(params.threadId);
    if (!latestMessage) return;
    const spamText = buildSpamInputText(
      { subject: params.thread.subject },
      {
        subject: latestMessage.subject,
        body_text: latestMessage.body_text,
        senderEmail: buildRuleContext(params.mailbox, latestMessage).senderEmail,
      },
    );
    await recordSpamLabel({
      userId: params.mailbox.owner_user_id,
      organizationId: params.mailbox.organization_id ?? undefined,
      mailboxId: params.mailbox.id,
      threadId: params.threadId,
      text: spamText,
      label: params.label,
    });
  } catch (e) {
    console.error(`recordSpamLabel (${params.label}) failed:`, e);
  }
}

/**
 * Point a provider call at the folder a message actually lives in.
 *
 * Every provider helper opens `mailbox.sync_folder`, and an IMAP uid is only
 * meaningful inside one folder — so once a message has been filed under a
 * category label, addressing it still requires opening that label's folder.
 * A null path means the message never moved and INBOX is correct.
 */
function mailboxForFolder(
  mailbox: MailboxTransportRow,
  folderPath: string | null | undefined,
): MailboxTransportRow {
  if (!folderPath || folderPath === (mailbox.sync_folder || "INBOX")) {
    return mailbox;
  }
  return { ...mailbox, sync_folder: folderPath };
}

/**
 * A thread's provider messages bucketed by the folder they live in, so a
 * thread whose mail is partly in INBOX and partly under a label is still acted
 * on in full — one provider call per folder.
 */
async function groupThreadProviderMessagesByFolder(params: {
  threadId: string;
  mailbox: MailboxTransportRow;
}): Promise<Array<{ mailbox: MailboxTransportRow; providerMessageIds: string[] }>> {
  const admin = getAdminClient();
  const { data: messages } = await admin
    .from("email_messages")
    .select("provider_message_id,provider_folder_path")
    .eq("thread_id", params.threadId);

  const byFolder = new Map<string, string[]>();
  for (const message of messages || []) {
    if (!message.provider_message_id) continue;
    const key = message.provider_folder_path || "";
    const bucket = byFolder.get(key) || [];
    bucket.push(String(message.provider_message_id));
    byFolder.set(key, bucket);
  }

  return Array.from(byFolder.entries()).map(([folderPath, providerMessageIds]) => ({
    mailbox: mailboxForFolder(params.mailbox, folderPath || null),
    providerMessageIds,
  }));
}

/**
 * Resolve the category label a thread belongs under, using the same rules the
 * inbox UI uses: an explicit assignment wins, otherwise the first tab (in the
 * user's own tab order) whose rules match.
 *
 * Returns null when the thread is unfiled — unfiled mail stays in the Inbox.
 */
async function resolveThreadCategoryLabel(params: {
  userId: string;
  threadRow: any;
}): Promise<string | null> {
  const admin = getAdminClient();
  const { data: tabRows } = await admin
    .from("email_inbox_tabs")
    .select("id,name,rules_json,order_index")
    .eq("user_id", params.userId)
    .order("order_index", { ascending: true });

  const tabs = tabRows || [];
  if (tabs.length === 0) return null;

  const explicitTabId = params.threadRow.inbox_tab_id
    ? String(params.threadRow.inbox_tab_id)
    : null;
  if (explicitTabId) {
    const assigned = tabs.find((tab: any) => String(tab.id) === explicitTabId);
    return assigned ? String(assigned.name || "").trim() || null : null;
  }

  const { data: participantRows } = await admin
    .from("email_participants")
    .select("email_address,participant_role,contact_id,profile_id")
    .eq("thread_id", params.threadRow.id);

  // Only the fields `matchInboxTab` actually reads — this is a rules check, not
  // a render, so there is no need to hydrate a full inbox item.
  const item = {
    id: String(params.threadRow.id),
    classification: params.threadRow.classification ?? null,
    subject: params.threadRow.subject ?? null,
    previewText: params.threadRow.preview_text ?? null,
    summaryText: params.threadRow.summary_text ?? null,
    inboxTabId: null,
    aiTabVerdicts:
      params.threadRow.ai_tab_verdicts_json &&
      typeof params.threadRow.ai_tab_verdicts_json === "object"
        ? params.threadRow.ai_tab_verdicts_json
        : {},
    participants: (participantRows || []).map((row: any) => ({
      emailAddress: row.email_address,
      participantRole: row.participant_role,
      contactId: row.contact_id ?? null,
      profileId: row.profile_id ?? null,
    })),
  } as unknown as InboxItem;

  for (const tab of tabs) {
    const rules = tab.rules_json || { matchMode: "any", conditions: [] };
    if (matchInboxTab(item, rules)) {
      return String(tab.name || "").trim() || null;
    }
  }

  return null;
}

/**
 * Mirror a thread's Focus category into the mail provider: give it a label of
 * the same name and take it out of the Inbox.
 *
 * On Gmail both halves are one IMAP move (a folder IS a label, and moving drops
 * `\Inbox`), so a thread Focus filed under "Receipts" shows up labeled Receipts
 * and out of the Inbox in Gmail, the iPhone Mail app, and anything else reading
 * the account.
 *
 * Best-effort and idempotent: the last pushed label is recorded on the thread so
 * repeat syncs don't re-open IMAP for mail that is already filed, and any
 * provider failure is logged without disturbing the in-app categorization.
 */
async function mirrorThreadCategoryToProvider(params: {
  userId: string;
  threadId: string;
}) {
  const admin = getAdminClient();

  const { data: threadRow } = await admin
    .from("email_threads")
    .select(
      "id,mailbox_id,subject,preview_text,summary_text,classification," +
        "inbox_tab_id,ai_tab_verdicts_json,provider_label_name,status",
    )
    .eq("id", params.threadId)
    .maybeSingle();

  if (!threadRow) return { labeled: false as const };

  // Spam and deleted mail already have their own provider destinations (Junk /
  // Trash); re-filing them under a category label would pull them back out.
  if (threadRow.status === "spam" || threadRow.status === "deleted") {
    return { labeled: false as const };
  }

  const labelName = await resolveThreadCategoryLabel({
    userId: params.userId,
    threadRow,
  });
  if (!labelName) return { labeled: false as const };

  if (threadRow.provider_label_name === labelName) {
    return { labeled: false as const, alreadyLabeled: true };
  }

  const { data: mailbox } = await admin
    .from("email_mailboxes")
    .select("*")
    .eq("id", threadRow.mailbox_id)
    .maybeSingle();
  if (!mailbox) return { labeled: false as const };

  // Only messages still sitting in the synced folder can be moved out of it;
  // anything already filed elsewhere has a uid scoped to that other folder.
  const { data: messages } = await admin
    .from("email_messages")
    .select("id,provider_message_id,provider_folder_path")
    .eq("thread_id", params.threadId)
    .is("provider_folder_path", null);

  const providerMessageIds = (messages || [])
    .map((message: any) => message.provider_message_id)
    .filter(Boolean);

  try {
    const result = await applyMailboxThreadLabel({
      mailbox: mailbox as MailboxTransportRow,
      providerMessageIds,
      labelName,
    });
    if (!result?.moved) return { labeled: false as const };

    // Repoint each moved message at its new home. The uid it had in INBOX is
    // dead now, so leaving the rows untouched would break every later
    // UID-addressed operation on this thread.
    const labelPath = result.labelPath || labelName;
    for (const message of messages || []) {
      const newUid = result.uidMap?.get(String(message.provider_message_id));
      await admin
        .from("email_messages")
        .update({
          provider_folder_path: labelPath,
          ...(newUid ? { provider_message_id: newUid } : {}),
        })
        .eq("id", message.id);
    }
  } catch (error) {
    console.error(
      `[email] mirrorThreadCategoryToProvider(${labelName}) failed:`,
      error,
    );
    return { labeled: false as const };
  }

  await admin
    .from("email_threads")
    .update({
      provider_label_name: labelName,
      provider_label_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.threadId);

  return { labeled: true as const, labelName };
}

/**
 * Push a thread the classifier flagged as spam into the provider's Junk folder.
 *
 * Marking spam by hand already did this. Auto-detected spam did not — it was
 * only ever flagged inside Focus, so Gmail kept showing it in the Inbox. This
 * closes that gap on the sync path.
 *
 * Idempotent via `provider_label_synced_at`, which doubles as the "this thread
 * has been filed provider-side" marker for both spam and category labels — so a
 * thread is never moved twice, and mirrorProviderFolderState knows not to read
 * its absence from the Inbox as a user archive.
 *
 * Best-effort: a provider failure leaves the in-app spam verdict untouched.
 */
async function mirrorThreadSpamToProvider(params: {
  mailbox: MailboxTransportRow;
  threadId: string;
}) {
  const admin = getAdminClient();

  const { data: threadRow } = await admin
    .from("email_threads")
    .select("id,status,classification,provider_label_name")
    .eq("id", params.threadId)
    .maybeSingle();

  if (!threadRow) return { movedToJunk: false };

  // Quarantine is the auto-detected state; "spam" is the settled one. Both mean
  // "this is junk" as far as the mail account is concerned.
  const isSpam =
    threadRow.classification === "spam" &&
    (threadRow.status === "spam" || threadRow.status === "quarantine");
  if (!isSpam) return { movedToJunk: false };
  if (threadRow.provider_label_name === SPAM_PROVIDER_LABEL_MARKER) {
    return { movedToJunk: false, alreadyMoved: true };
  }

  const { data: messages } = await admin
    .from("email_messages")
    .select("provider_message_id")
    .eq("thread_id", params.threadId)
    .is("provider_folder_path", null);

  const providerMessageIds = (messages || [])
    .map((message: any) => message.provider_message_id)
    .filter(Boolean);
  if (providerMessageIds.length === 0) return { movedToJunk: false };

  try {
    await applyMailboxThreadAction({
      mailbox: params.mailbox,
      providerMessageIds,
      action: "spam",
    });
  } catch (error) {
    console.error("[email] auto-spam provider move failed:", error);
    return { movedToJunk: false };
  }

  await admin
    .from("email_threads")
    .update({
      provider_label_name: SPAM_PROVIDER_LABEL_MARKER,
      provider_label_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.threadId);

  return { movedToJunk: true };
}

/**
 * Explicitly "move" a thread into an inbox tab (or clear the assignment with
 * null). An assigned thread renders ONLY under that tab — the client filter
 * hides it from other category tabs and from "All".
 */
export async function setThreadInboxTab(params: {
  userId: string;
  threadId: string;
  tabId: string | null;
}) {
  const admin = getAdminClient();
  // Access (not manage) is the right bar: assigning a thread to one of the
  // user's inbox tabs is a personal view preference, and manage would wrongly
  // 403 on shared/org mailboxes the user can read but not administer.
  await ensureThreadAccess(params.userId, params.threadId);
  const { error } = await admin
    .from("email_threads")
    .update({ inbox_tab_id: params.tabId, updated_at: new Date().toISOString() })
    .eq("id", params.threadId);
  if (error) throw new Error(error.message);

  // Push the same filing to the mail provider so Gmail (and every other client
  // on the account) shows the label and drops the thread from the Inbox. Purely
  // best-effort: the in-app move already succeeded above.
  if (params.tabId) {
    await mirrorThreadCategoryToProvider({
      userId: params.userId,
      threadId: params.threadId,
    }).catch(() => {});
  }

  return { ok: true };
}

/**
 * Set (or clear, with null) an email's priority — same 1..4 scale as tasks.
 * Access, not manage: priority is a triage marker on a thread the user can
 * read, so it must work on shared mailboxes they don't administer.
 */
export async function setThreadPriority(params: {
  userId: string;
  threadId: string;
  priority: number | null;
}) {
  const admin = getAdminClient();
  await ensureThreadAccess(params.userId, params.threadId);

  const priority =
    params.priority === null
      ? null
      : Math.min(4, Math.max(1, Math.round(params.priority)));

  const { error } = await admin
    .from("email_threads")
    .update({ priority, updated_at: new Date().toISOString() })
    .eq("id", params.threadId);
  if (error) throw new Error(error.message);
  return { ok: true, priority };
}

export async function applyThreadAction(params: {
  userId: string;
  threadId: string;
  action:
    | "reprocess"
    | "approve"
    | "quarantine"
    | "mark_read"
    | "archive"
    | "spam"
    | "delete"
    | "always_delete_sender"
    | "snooze"
    | "boomerang"
    | "set_classification"
    | "to_task";
  snoozedUntil?: string | null;
  boomerangUntil?: string | null;
  boomerangTaskId?: string | null;
  projectId?: string | null;
  classification?: string | null;
}) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(params.userId, params.threadId);
  const mailbox = (await ensureMailboxManage(
    params.userId,
    String(thread.mailbox_id),
  )) as MailboxTransportRow;
  const { data: messages } = await admin
    .from("email_messages")
    .select("provider_message_id,metadata_json")
    .eq("thread_id", params.threadId);

  const providerMessageIds = (messages || [])
    .map((message: any) => message.provider_message_id)
    .filter(Boolean);

  // Act on the thread wherever its mail actually sits. Messages Forge filed
  // under a category label live in that label's folder now, and their uids only
  // resolve there — so a thread split across INBOX and a label takes one
  // provider call per folder rather than one call that silently misses half.
  const runProviderAction = async (
    action: "mark_read" | "archive" | "spam" | "delete",
  ) => {
    const groups = await groupThreadProviderMessagesByFolder({
      threadId: params.threadId,
      mailbox,
    });
    for (const group of groups) {
      await applyMailboxThreadAction({
        mailbox: group.mailbox,
        providerMessageIds: group.providerMessageIds,
        action,
      });
    }
  };

  const effectiveAction =
    params.action === "always_delete_sender" ? "delete" : params.action;

  if (effectiveAction === "reprocess") {
    // Explicit user re-analysis — always run the full model, even for
    // spam-ruled mail that auto-ingestion would skip to save credits.
    return reprocessThread(params.threadId, params.userId, { manual: true });
  }

  if (effectiveAction === "set_classification") {
    const allowedClassifications = [
      "unknown",
      "actionable",
      "newsletter",
      "spam",
      "waiting",
      "reference",
      "transactional",
    ];
    const nextClassification = params.classification;
    if (
      !nextClassification ||
      !allowedClassifications.includes(nextClassification)
    ) {
      throw new Error("Invalid classification");
    }

    const update: Record<string, unknown> = {
      classification: nextClassification,
      updated_at: new Date().toISOString(),
    };

    // Keep status consistent with the chosen category. Categorizing as spam
    // re-marks the thread as spam; categorizing as anything else pulls it back
    // out of spam/quarantine into the normal triage queue.
    if (nextClassification === "spam") {
      update.status = "spam";
      // Mirror the classification into the provider so the message actually
      // lands in Gmail/IMAP's Junk folder — otherwise "mark as spam" here only
      // moves it in Focus. Best-effort: a provider hiccup must not fail the
      // in-app categorization.
      try {
        await runProviderAction("spam");
      } catch (providerError) {
        console.error(
          "[email] categorize→spam provider move failed:",
          providerError,
        );
      }
    } else if (
      thread.status === "spam" ||
      thread.status === "quarantine" ||
      thread.classification === "spam"
    ) {
      update.status = thread.project_id ? "active" : "needs_project";
      update.needs_project = !thread.project_id;
    }

    await admin
      .from("email_threads")
      .update(update)
      .eq("id", params.threadId);

    // Categorizing IS a spam verdict, and it is the control the Spam Review
    // modal uses — so it has to train the classifier. Without this, every
    // "classify as spam" click looked like it worked while teaching the model
    // nothing, leaving the corpus one-sided and permanently gated at zero
    // confidence. Moving a thread OFF spam is just as valuable a signal: it is
    // the not_spam class the gate also requires.
    const wasSpam =
      thread.classification === "spam" ||
      thread.status === "spam" ||
      thread.status === "quarantine";
    if (nextClassification === "spam") {
      await recordThreadSpamTrainingLabel({
        threadId: params.threadId,
        thread,
        mailbox,
        label: "spam",
      });
    } else if (wasSpam) {
      await recordThreadSpamTrainingLabel({
        threadId: params.threadId,
        thread,
        mailbox,
        label: "not_spam",
      });
    }

    return { success: true, classification: nextClassification };
  }

  if (effectiveAction === "snooze") {
    const snoozedIso = params.snoozedUntil
      ? new Date(params.snoozedUntil).toISOString()
      : null;
    if (!snoozedIso || Number.isNaN(new Date(snoozedIso).getTime())) {
      throw new Error("Invalid snooze timestamp");
    }
    await admin
      .from("email_threads")
      .update({
        work_due_date: snoozedIso,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.threadId);
    return { success: true, snoozedUntil: snoozedIso };
  }

  if (effectiveAction === "boomerang") {
    // Hide the thread from the inbox until a date/time OR until a linked task
    // is completed. Exactly one of the two must be provided.
    const boomerangIso = params.boomerangUntil
      ? new Date(params.boomerangUntil).toISOString()
      : null;
    const boomerangTaskId = params.boomerangTaskId || null;
    if (!boomerangIso && !boomerangTaskId) {
      throw new Error("Boomerang needs a date/time or a task");
    }
    if (boomerangIso && Number.isNaN(new Date(boomerangIso).getTime())) {
      throw new Error("Invalid boomerang timestamp");
    }
    await admin
      .from("email_threads")
      .update({
        boomerang_until: boomerangIso,
        boomerang_task_id: boomerangTaskId,
        is_unread: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.threadId);
    return { success: true, boomerangUntil: boomerangIso, boomerangTaskId };
  }

  if (effectiveAction === "to_task") {
    const tasks = await createTasksForThread(
      params.userId,
      params.threadId,
      params.projectId ?? null,
    );
    // Mark resolved so the inbox row drops out of Today after conversion.
    await admin
      .from("email_threads")
      .update({
        status: "resolved",
        resolution_state: "taskified",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.threadId);
    return { success: true, tasks };
  }

  if (effectiveAction === "approve") {
    await admin
      .from("email_threads")
      .update({
        status: thread.project_id ? "active" : "needs_project",
        classification:
          thread.classification === "spam"
            ? "actionable"
            : thread.classification,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.threadId);

    // AI-memory hook: user approved this thread's classification (best-effort).
    try {
      await maybeCreateAIMemoryFromEvent(admin, {
        user_id: params.userId,
        source_type: "email",
        source_id: String(thread.id),
        event_type: "email_classified",
        after_json: {
          subject: thread.subject,
          summary: thread.summary_text,
          classification: thread.classification,
          project_id: thread.project_id ?? null,
        },
        reason: "user_approved",
      });
    } catch (e) {
      console.error("AI-memory email approve hook failed:", e);
    }

    // Un-spam / approve is an explicit user rescue — run the full model even if
    // a Rule would otherwise mark it spam and skip AI.
    return reprocessThread(params.threadId, params.userId, { manual: true });
  }

  const statusUpdates: Record<string, string> = {
    quarantine: "quarantine",
    archive: "archived",
    spam: "spam",
    delete: "deleted",
  };

  if (effectiveAction === "mark_read") {
    const startedAt = Date.now();
    void logEmailAction({
      userId: params.userId,
      threadId: params.threadId,
      mailboxId: String(thread.mailbox_id),
      action: params.action,
      phase: "server_start",
    });
    await runProviderAction("mark_read");
    const { error: markReadError } = await admin
      .from("email_threads")
      .update({
        is_unread: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.threadId);
    void logEmailAction({
      userId: params.userId,
      threadId: params.threadId,
      mailboxId: String(thread.mailbox_id),
      action: params.action,
      phase: markReadError ? "error" : "server_done",
      detail: {
        durationMs: Date.now() - startedAt,
        resultingStatus: thread.status,
        error: markReadError?.message ?? null,
      },
    });
    return { success: true };
  }

  const terminalStatus = statusUpdates[effectiveAction];
  const startedAt = Date.now();
  void logEmailAction({
    userId: params.userId,
    threadId: params.threadId,
    mailboxId: String(thread.mailbox_id),
    action: params.action,
    phase: "server_start",
    detail: { targetStatus: terminalStatus, fromStatus: thread.status },
  });

  // Commit the terminal status to the DB FIRST — the inbox list is segmented
  // from `email_threads.status`, so writing it up front means any refetch that
  // lands during the (slow) provider move already sees the committed status and
  // can't resurrect the row into the inbox. The old order (provider move → DB
  // write) left a commit-gap that flashed spam/archive/delete rows back in, and
  // if the provider move stalled past the client's 60s suppression ceiling the
  // row reappeared for good. Writing the DB first closes both windows.
  const { error: statusUpdateError } = await admin
    .from("email_threads")
    .update({
      status: terminalStatus,
      always_delete: false,
      is_unread: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.threadId);

  // Provider-side move (IMAP/Graph) is best-effort AFTER the DB commit: a
  // provider hiccup must not 500 the action (which would make the client revert
  // the optimistic removal and flash the row back). The mailbox sync reconciles
  // any drift on its next pass.
  let providerMoveError: string | null = null;
  try {
    await runProviderAction(effectiveAction as "archive" | "spam" | "delete");
  } catch (moveError) {
    providerMoveError =
      moveError instanceof Error ? moveError.message : String(moveError);
    console.error(
      `Provider ${effectiveAction} move failed for thread ${params.threadId} (DB status already committed):`,
      moveError,
    );
  }

  void logEmailAction({
    userId: params.userId,
    threadId: params.threadId,
    mailboxId: String(thread.mailbox_id),
    action: params.action,
    phase: statusUpdateError ? "error" : "server_done",
    detail: {
      durationMs: Date.now() - startedAt,
      resultingStatus: terminalStatus,
      providerMessageCount: providerMessageIds.length,
      error: statusUpdateError?.message ?? null,
      providerMoveError,
    },
  });

  // Deleting an email should not leave its auto-generated tasks lingering in
  // Today/projects as orphaned noise. When a thread is deleted, soft-delete the
  // tasks that were generated from it by AI or rules (recoverable via /trash).
  // User-converted tasks (generated_by = "user") are intentional and preserved.
  // Best-effort: never fail the delete action if task cleanup errors.
  if (effectiveAction === "delete") {
    try {
      const { data: links, error: linksError } = await admin
        .from("email_thread_tasks")
        .select("task_id,generated_by")
        .eq("thread_id", params.threadId);
      if (linksError) throw linksError;

      const orphanTaskIds = (links || [])
        .filter(
          (link: any) =>
            link.generated_by === "ai" || link.generated_by === "rule",
        )
        .map((link: any) => link.task_id)
        .filter(Boolean);

      if (orphanTaskIds.length > 0) {
        const adapter = new SupabaseAdapter(admin, params.userId);
        for (const taskId of orphanTaskIds) {
          try {
            await adapter.deleteTask(String(taskId));
          } catch (taskError) {
            console.error(
              `Failed to soft-delete orphaned email task ${taskId} for thread ${params.threadId}:`,
              taskError,
            );
          }
        }
      }
    } catch (cleanupError) {
      console.error(
        `Orphaned email-task cleanup failed for thread ${params.threadId}:`,
        cleanupError,
      );
    }
  }

  // Training-through-the-UI: a user marking a thread as spam is a labeled
  // example. Feed the k-NN model (best-effort — must never break the action).
  if (effectiveAction === "spam") {
    await recordThreadSpamTrainingLabel({
      threadId: params.threadId,
      thread,
      mailbox,
      label: "spam",
    });
  }

  return { success: true };
}

export async function emptyTrashForUser(params: {
  userId: string;
  mailboxId?: string | null;
}) {
  const admin = getAdminClient();
  const mailboxes = params.mailboxId
    ? [
        (await ensureMailboxManage(
          params.userId,
          params.mailboxId,
        )) as MailboxTransportRow,
      ]
    : await Promise.all(
        (await listMailboxesForUser(params.userId)).map((mailbox) =>
          ensureMailboxManage(params.userId, mailbox.id).then(
            (row) => row as MailboxTransportRow,
          ),
        ),
      );

  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
  if (mailboxIds.length === 0) {
    return {
      success: true,
      deletedThreadCount: 0,
      mailboxCount: 0,
    };
  }

  const { data: deletedThreads, error } = await admin
    .from("email_threads")
    .select("id,mailbox_id")
    .in("mailbox_id", mailboxIds)
    .eq("status", "deleted");

  if (error) {
    throw new Error(error.message || "Failed to load trash threads");
  }

  const threadsByMailbox = ((deletedThreads || []) as any[]).reduce(
    (map: Map<string, string[]>, row: any) => {
      const mailboxId = String(row.mailbox_id);
      const current = map.get(mailboxId) || [];
      current.push(String(row.id));
      map.set(mailboxId, current);
      return map;
    },
    new Map<string, string[]>(),
  );

  let deletedThreadCount = 0;

  for (const mailbox of mailboxes) {
    const threadIds = threadsByMailbox.get(mailbox.id) || [];
    if (threadIds.length === 0) {
      continue;
    }

    await emptyMailboxTrash(mailbox);

    const { error: deleteError, count } = await admin
      .from("email_threads")
      .delete({ count: "exact" })
      .in("id", threadIds);

    if (deleteError) {
      throw new Error(deleteError.message || "Failed to clear trash");
    }

    deletedThreadCount += Number(count || threadIds.length);
  }

  return {
    success: true,
    deletedThreadCount,
    mailboxCount: threadsByMailbox.size,
  };
}

export async function createSpamExceptionRuleForThread(
  userId: string,
  threadId: string,
): Promise<EmailSpamExceptionResult> {
  const thread = await ensureThreadAccess(userId, threadId);
  const mailbox = (await ensureMailboxManage(
    userId,
    String(thread.mailbox_id),
  )) as MailboxTransportRow;
  const latestMessage = await getLatestThreadMessage(threadId);

  if (!latestMessage) {
    throw new Error("Email thread has no messages");
  }

  const metadata = latestMessage.metadata_json || {};
  const ruleContext = buildRuleContext(mailbox, latestMessage);
  const draft = await generateSpamExceptionRuleDraft({
    senderEmail: ruleContext.senderEmail,
    senderName:
      String(
        metadata.from?.[0]?.name ||
          latestMessage.author_name ||
          latestMessage.display_name ||
          "",
      ) || null,
    subject: String(latestMessage.subject || thread.subject || ""),
    bodyText: String(latestMessage.body_text || ""),
    mailboxId: mailbox.id,
    mailboxEmail: mailbox.email_address,
    mailboxName: mailbox.display_name || mailbox.email_address,
    participantEmails: ruleContext.participants,
    summaryText: thread.summary_text ?? null,
    reason: thread.action_reason ?? null,
  });
  const payload = buildSpamExceptionRulePayload({
    userId,
    draft,
    mailboxId: mailbox.id,
  });
  const existingRule = await findMatchingNeverSpamRule({
    userId,
    mailboxId: payload.mailboxId,
    conditions: payload.conditions,
  });

  let rule: EmailRule;

  if (existingRule) {
    if (
      !existingRule.isActive ||
      existingRule.name !== payload.name ||
      existingRule.description !== payload.description
    ) {
      rule = await updateRule(userId, existingRule.id, {
        name: payload.name,
        description: payload.description,
        isActive: true,
        priority: payload.priority,
        matchMode: payload.matchMode,
        conditions: payload.conditions,
        actions: payload.actions,
        stopProcessing: payload.stopProcessing,
      });
    } else {
      rule = existingRule;
    }
  } else {
    rule = await createRule(userId, payload);
  }

  // Training-through-the-UI: "Not spam" / allow-future-mail is a not_spam label.
  // Record BEFORE reprocess so the k-NN corpus reflects the correction on rerun.
  // Best-effort — must never break the exception-rule flow.
  try {
    const spamText = buildSpamInputText(
      { subject: thread.subject },
      {
        subject: latestMessage.subject,
        body_text: latestMessage.body_text,
        senderEmail: ruleContext.senderEmail,
      },
    );
    await recordSpamLabel({
      userId,
      organizationId:
        (mailbox as unknown as { organization_id: string | null })
          .organization_id ?? undefined,
      mailboxId: mailbox.id,
      threadId,
      text: spamText,
      label: "not_spam",
    });
  } catch (e) {
    console.error("recordSpamLabel (not_spam action) failed:", e);
  }

  await reprocessThread(threadId, userId);

  return {
    threadId,
    rule,
    rationale: draft.rationale,
  };
}

export async function revertSpamExceptionRule(params: {
  userId: string;
  ruleId: string;
  threadId: string;
}): Promise<EmailSpamExceptionResult> {
  const admin = getAdminClient();
  await ensureThreadAccess(params.userId, params.threadId);

  const { data: existingRuleRow } = await admin
    .from("email_rules")
    .select("*")
    .eq("id", params.ruleId)
    .maybeSingle();

  if (!existingRuleRow) {
    throw new Error("Rule not found");
  }

  const existingRule = coerceRule(existingRuleRow);

  if (!existingRule.actions.some((action) => action.type === "never_spam")) {
    throw new Error("Rule is not a spam exception");
  }

  if (existingRule.mailboxId) {
    await ensureMailboxManage(params.userId, existingRule.mailboxId);
  } else if (existingRule.userId && existingRule.userId !== params.userId) {
    throw new Error("Rule not found");
  }

  const revertPayload = buildSpamExceptionRevertPayload();
  const { data: updatedRuleRow } = await admin
    .from("email_rules")
    .update({
      is_active: revertPayload.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.ruleId)
    .select()
    .single();

  await reprocessThread(params.threadId, params.userId);

  return {
    threadId: params.threadId,
    rule: coerceRule(updatedRuleRow),
    rationale: "",
  };
}

export async function createRule(userId: string, payload: any) {
  const admin = getAdminClient();
  if (payload.mailboxId) {
    await ensureMailboxManage(userId, payload.mailboxId);
  }
  const { data } = await admin
    .from("email_rules")
    .insert({
      organization_id: payload.organizationId ?? null,
      mailbox_id: payload.mailboxId ?? null,
      user_id: payload.userId ?? userId,
      name: payload.name,
      description: payload.description ?? null,
      source: payload.source ?? "user",
      is_active: payload.isActive ?? true,
      priority: payload.priority ?? 100,
      match_mode: payload.matchMode ?? "all",
      conditions_json: payload.conditions ?? [],
      actions_json: payload.actions ?? [],
      stop_processing: payload.stopProcessing ?? false,
    })
    .select()
    .single();

  // AI-memory hook: a user-approved AI-suggested rule is a strong precedent.
  try {
    const isAiApproved =
      payload.aiApproved === true ||
      payload.source === "ai" ||
      payload.source === "ai_suggested" ||
      payload.source === "spam_exception";
    if (isAiApproved && data) {
      await maybeCreateAIMemoryFromEvent(admin, {
        user_id: payload.userId ?? userId,
        source_type: "rule",
        source_id: String(data.id),
        event_type: "email_rule_approved",
        after_json: {
          name: data.name,
          conditions: data.conditions_json,
          actions: data.actions_json,
        },
        reason: "user_approved",
      });
    }
  } catch (e) {
    console.error("AI-memory rule_approved (create) hook failed:", e);
  }

  return coerceRule(data);
}

export async function updateRule(userId: string, ruleId: string, payload: any) {
  const admin = getAdminClient();
  const { data: rule } = await admin
    .from("email_rules")
    .select("*")
    .eq("id", ruleId)
    .maybeSingle();
  if (!rule) {
    throw new Error("Rule not found");
  }
  if (rule.mailbox_id) {
    await ensureMailboxManage(userId, String(rule.mailbox_id));
  }

  const { data } = await admin
    .from("email_rules")
    .update({
      name: payload.name ?? rule.name,
      description: payload.description ?? rule.description,
      is_active: payload.isActive ?? rule.is_active,
      priority: payload.priority ?? rule.priority,
      match_mode: payload.matchMode ?? rule.match_mode,
      conditions_json: payload.conditions ?? rule.conditions_json,
      actions_json: payload.actions ?? rule.actions_json,
      stop_processing: payload.stopProcessing ?? rule.stop_processing,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ruleId)
    .select()
    .single();

  // AI-memory hook: user activating/approving an AI-suggested rule.
  try {
    const isAiApproved =
      payload.aiApproved === true ||
      (payload.isActive === true && rule.source === "ai") ||
      rule.source === "ai_suggested";
    if (isAiApproved && data) {
      await maybeCreateAIMemoryFromEvent(admin, {
        user_id: userId,
        source_type: "rule",
        source_id: String(data.id),
        event_type: "email_rule_approved",
        after_json: {
          name: data.name,
          conditions: data.conditions_json,
          actions: data.actions_json,
        },
        reason: "user_approved",
      });
    }
  } catch (e) {
    console.error("AI-memory rule_approved (update) hook failed:", e);
  }

  return coerceRule(data);
}

export async function createSummaryProfile(userId: string, payload: any) {
  const admin = getAdminClient();
  if (payload.mailboxId) {
    await ensureMailboxManage(userId, payload.mailboxId);
  }
  const { data } = await admin
    .from("email_ai_profiles")
    .insert({
      organization_id: payload.organizationId ?? null,
      mailbox_id: payload.mailboxId ?? null,
      user_id: payload.userId ?? userId,
      name: payload.name,
      summary_style: payload.summaryStyle ?? "action_first",
      instruction_text: payload.instructionText ?? "",
      settings_json: payload.settings ?? {},
      is_default: payload.isDefault ?? false,
    })
    .select()
    .single();

  return coerceSummaryProfile(data);
}

export async function updateSummaryProfile(
  userId: string,
  profileId: string,
  payload: any,
) {
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("email_ai_profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) {
    throw new Error("Summary profile not found");
  }
  if (profile.mailbox_id) {
    await ensureMailboxManage(userId, String(profile.mailbox_id));
  }

  const { data } = await admin
    .from("email_ai_profiles")
    .update({
      name: payload.name ?? profile.name,
      summary_style: payload.summaryStyle ?? profile.summary_style,
      instruction_text: payload.instructionText ?? profile.instruction_text,
      settings_json: payload.settings ?? profile.settings_json,
      is_default: payload.isDefault ?? profile.is_default,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId)
    .select()
    .single();

  return coerceSummaryProfile(data);
}

export async function getTaskConversationForUser(
  userId: string,
  taskId: string,
) {
  const admin = getAdminClient();
  const visibleProjects = await getVisibleProjectsForUser(userId);
  const { data: task } = await admin
    .from("tasks")
    .select("id,project_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) {
    throw new Error("Task not found");
  }

  if (
    task.project_id &&
    !visibleProjects.some((project) => project.id === String(task.project_id))
  ) {
    throw new Error("Task not found");
  }

  const [{ data: comments }, { data: threadLinks }] = await Promise.all([
    admin
      .from("comments")
      .select("*, profiles!comments_user_id_fkey(first_name,last_name,email)")
      .eq("task_id", taskId)
      .eq("is_deleted", false),
    admin.from("email_thread_tasks").select("thread_id").eq("task_id", taskId),
  ]);

  const threadIds = (threadLinks || []).map((row: any) => row.thread_id);
  const { data: emailMessages } =
    threadIds.length > 0
      ? await admin
          .from("email_messages")
          .select("*")
          .in("thread_id", threadIds)
          .order("received_at", { ascending: true })
          .order("sent_at", { ascending: true })
      : { data: [] as any[] };

  const commentEntries = (comments || []).map((comment: any) =>
    coerceConversationEntry({
      ...comment,
      type: "internal_note",
      author_name:
        `${comment.profiles?.first_name || ""} ${comment.profiles?.last_name || ""}`.trim() ||
        comment.profiles?.email ||
        null,
      author_email: comment.profiles?.email ?? null,
    }),
  );

  const emailEntries = (emailMessages || []).map((message: any) =>
    coerceConversationEntry({
      ...message,
      type: "email",
      author_name: message.metadata_json?.from?.[0]?.name ?? null,
      author_email: message.metadata_json?.from?.[0]?.email ?? null,
    }),
  );

  return [...commentEntries, ...emailEntries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
