import {
  SupabaseAdapter,
  resolveVisibleProjectIds,
} from "@/lib/db/supabase-adapter";
import { analyzeThreadWithAI } from "@/lib/email-inbox/ai";
import {
  applyEmailRules,
  type EmailRuleContext,
} from "@/lib/email-inbox/rules";
import { resolveRuleDrivenThreadState } from "@/lib/email-inbox/reprocess";
import {
  buildSpamExceptionRevertPayload,
  buildSpamExceptionRulePayload,
  generateSpamExceptionRuleDraft,
} from "@/lib/email-inbox/spam-exception";
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
  normalizeMailboxPassword,
  normalizeSubject,
  sortInboxItems,
} from "@/lib/email-inbox/shared";
import { encryptMailboxCredentials } from "@/lib/email-inbox/crypto";
import {
  fetchMailboxAttachmentByProviderMessageId,
  applyMailboxThreadAction,
  fetchMailboxMessageByProviderMessageId,
  fetchMailboxMessageReadStates,
  fetchMailboxMessages,
  sendMailboxReply,
  type MailboxTransportRow,
} from "@/lib/email-inbox/provider";
import { MAILBOX_PROVIDER_PRESETS } from "@/lib/email-inbox/provider-presets";
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
import { normalizeRichText } from "@/lib/rich-text-sanitize";
import {
  buildReplyHtml,
  buildReplyPlainText,
  type EmailReplyAttachment,
} from "@/lib/email-reply";

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

async function hydrateMessageAttachmentMetadata(
  mailbox: MailboxTransportRow,
  messageRows: any[],
) {
  const admin = getAdminClient();
  const hydratedRows = [...messageRows];

  for (let index = 0; index < hydratedRows.length; index += 1) {
    const row = hydratedRows[index];
    if (
      !row?.provider_message_id ||
      hasStoredMessageAttachments(row) ||
      !messageLikelyHasAttachments(row)
    ) {
      continue;
    }

    const refreshedMessage = await fetchMailboxMessageByProviderMessageId(
      mailbox,
      String(row.provider_message_id),
    );

    if (!refreshedMessage) {
      continue;
    }

    const nextMetadata = {
      ...(row.metadata_json || {}),
      attachments: refreshedMessage.attachments,
    };

    const { data: updatedRow } = await admin
      .from("email_messages")
      .update({ metadata_json: nextMetadata })
      .eq("id", row.id)
      .select("*")
      .single();

    hydratedRows[index] = updatedRow
      ? { ...updatedRow }
      : { ...row, metadata_json: nextMetadata };
  }

  return hydratedRows;
}

async function getVisibleScope(userId: string): Promise<VisibleScope> {
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
}

async function getAccessibleMailboxRows(userId: string) {
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
}

async function getVisibleProjectsForUser(
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
}

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

async function findThreadForMessage(mailbox: any, message: any) {
  const admin = getAdminClient();
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
      return referenced[0].thread_id;
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
    .select("id")
    .eq("mailbox_id", mailbox.id)
    .eq("thread_key", threadKey)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  const threadPayload = {
    mailbox_id: mailbox.id,
    project_id: null,
    summary_profile_id: mailbox.summary_profile_id ?? null,
    owner_user_id: mailbox.owner_user_id,
    provider_thread_id: null,
    thread_key: threadKey,
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
      .select("id")
      .eq("mailbox_id", mailbox.id)
      .eq("thread_key", threadKey)
      .maybeSingle();

    if (retriedExisting?.id) {
      return retriedExisting.id;
    }
    throw new Error(retryError?.message || createError.message);
  }
  if (createError || !created?.id) {
    throw new Error(createError?.message || "Failed to create email thread");
  }

  return created?.id;
}

async function persistParticipants(
  threadId: string,
  messageId: string,
  mailbox: any,
  grouped: Record<string, Array<{ email: string; name?: string | null }>>,
) {
  const admin = getAdminClient();
  for (const [participantRole, addresses] of Object.entries(grouped)) {
    for (const address of addresses) {
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

  const threadId = await findThreadForMessage(mailbox, message);
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

  await admin
    .from("email_threads")
    .update({
      subject: message.subject || "Untitled email",
      normalized_subject: normalizeSubject(message.subject),
      preview_text: extractPlainTextPreview(message.bodyText, 240),
      is_unread: message.isUnread,
      latest_message_at:
        message.receivedAt || message.sentAt || new Date().toISOString(),
      latest_inbound_at:
        message.receivedAt || message.sentAt || new Date().toISOString(),
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
}): InboxItem {
  return {
    id: params.row.id,
    mailboxId: params.row.mailbox_id,
    mailboxName: params.mailbox?.name,
    mailboxEmailAddress: params.mailbox?.emailAddress,
    projectId: params.row.project_id ?? null,
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
    isUnread: Boolean(params.row.is_unread),
    workDueDate: params.row.work_due_date ?? null,
    workDueTime: params.row.work_due_time ?? null,
    needsProject: Boolean(params.row.needs_project),
    alwaysDelete: Boolean(params.row.always_delete),
    derivedTaskCount: params.taskCount,
    matchedRuleIds: Array.isArray(params.row.analysis_json?.matchedRuleIds)
      ? params.row.analysis_json.matchedRuleIds
          .map((value: unknown) => String(value || "").trim())
          .filter(Boolean)
      : [],
    participants: params.participants,
    taskSuggestions: Array.isArray(params.row.task_suggestions_json)
      ? params.row.task_suggestions_json
      : [],
    createdAt: params.row.created_at,
    updatedAt: params.row.updated_at,
  };
}

function mapParticipantRow(row: any): InboxParticipant {
  return {
    id: row.id,
    emailAddress: row.email_address,
    displayName: row.display_name ?? null,
    participantRole: row.participant_role,
    profileId: row.profile_id ?? null,
    contactId: row.contact_id ?? null,
  };
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

async function syncMailboxThreadReadStates(params: {
  mailboxId: string;
  mailbox: MailboxTransportRow;
}) {
  const admin = getAdminClient();
  const { data: messageRows } = await admin
    .from("email_messages")
    .select("thread_id,provider_message_id")
    .eq("mailbox_id", params.mailboxId)
    .not("provider_message_id", "is", null);

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
    .eq("platform", "ios")
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

export async function listInboxItemsForUser(
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
    .from("email_threads")
    .select("*")
    .in("mailbox_id", mailboxIds)
    .order("latest_message_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }
  if (options.mailboxId) {
    query = query.eq("mailbox_id", options.mailboxId);
  }
  if (options.projectId) {
    query = query.eq("project_id", options.projectId);
  }

  const { data: threads } = await query;
  if (!threads || threads.length === 0) {
    return [];
  }

  const threadIds = threads.map((thread: any) => thread.id);
  const [{ data: participantRows }, { data: taskLinks }] = await Promise.all([
    admin.from("email_participants").select("*").in("thread_id", threadIds),
    admin
      .from("email_thread_tasks")
      .select("thread_id,task_id")
      .in("thread_id", threadIds),
  ]);

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
      }),
    ),
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

  const [{ data: threads }, { data: participantRows }, { data: messageRows }] =
    await Promise.all([
      admin
        .from("email_threads")
        .select("*")
        .in("id", threadIds)
        .order("latest_message_at", { ascending: false }),
      admin.from("email_participants").select("*").in("thread_id", threadIds),
      admin
        .from("email_messages")
        .select("*")
        .in("thread_id", threadIds)
        .order("received_at", { ascending: true })
        .order("sent_at", { ascending: true }),
    ]);

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
      });

      const conversation = (messagesByThread.get(String(row.id)) || []).map(
        (messageRow: any) => ({
          ...coerceConversationEntry({
            ...messageRow,
            author_name: messageRow.metadata_json?.from?.[0]?.name ?? null,
            author_email: messageRow.metadata_json?.from?.[0]?.email ?? null,
            type: "email",
          }),
          participants: participantsByMessage.get(String(messageRow.id)) || [],
        }),
      );

      return {
        ...item,
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

async function createTasksForThreadInternal(params: {
  actorUserId: string;
  thread: any;
  projectId: string;
  suggestions: InboxTaskSuggestion[];
  generatedBy: "ai" | "user" | "rule";
}) {
  const admin = getAdminClient();
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

  for (const suggestion of params.suggestions) {
    const task = await adapter.createTask({
      name: suggestion.name,
      description:
        suggestion.description ||
        latestInbound?.body_html ||
        latestInbound?.body_text ||
        params.thread.summary_text ||
        params.thread.preview_text ||
        "",
      projectId: params.projectId,
      priority: suggestion.priority ?? 3,
      dueDate: suggestion.dueDate || null,
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
    if (
      suggestion.dueDate &&
      (!earliestDueDate || suggestion.dueDate < earliestDueDate)
    ) {
      earliestDueDate = suggestion.dueDate;
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

export async function reprocessThread(threadId: string, actorUserId?: string) {
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

  const profile = await chooseSummaryProfile(mailbox, mailbox.owner_user_id);
  const projectOptions = await getVisibleProjectsForUser(
    mailbox.owner_user_id,
    mailbox.organization_id,
  );
  const aiResult = await analyzeThreadWithAI({
    subject: latestMessage.subject || thread.subject || "",
    bodyText: latestMessage.body_text || "",
    senderEmail: buildRuleContext(mailbox, latestMessage).senderEmail,
    mailboxEmail: mailbox.email_address,
    preventSpamClassification,
    profile,
    projectOptions: projectOptions.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
    })),
  });

  const ruleActions = new Set(appliedRules.actions);
  let { status, classification, needsProject, alwaysDelete } =
    resolveRuleDrivenThreadState({
      aiResult,
      ruleActions,
    });

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

export async function syncMailboxById(userId: string, mailboxId: string) {
  const admin = getAdminClient();
  const mailbox = await ensureMailboxManage(userId, mailboxId);
  const transportMailbox = mailbox as MailboxTransportRow;
  const { data: syncState } = await admin
    .from("email_sync_state")
    .select("*")
    .eq("mailbox_id", mailboxId)
    .maybeSingle();

  await admin.from("email_sync_state").upsert({
    mailbox_id: mailboxId,
    sync_status: "syncing",
    updated_at: new Date().toISOString(),
  });

  try {
    const messages = await fetchMailboxMessages(
      transportMailbox,
      syncState?.last_seen_message_at ?? mailbox.last_synced_at ?? null,
    );
    const changedThreadIds = new Set<string>();
    const notificationCandidates: Array<{
      message: any;
      messageId: string;
      threadId: string;
    }> = [];
    let newestTimestamp = syncState?.last_seen_message_at ?? null;
    const hadPreviousSync = Boolean(
      syncState?.last_seen_message_at || mailbox.last_synced_at,
    );

    for (const message of messages) {
      const result = await ingestMailboxMessage(mailbox, message);
      changedThreadIds.add(result.threadId);
      if (result.inserted) {
        notificationCandidates.push({
          message,
          messageId: result.messageId,
          threadId: result.threadId,
        });
      }
      const candidate = message.receivedAt || message.sentAt || null;
      if (candidate && (!newestTimestamp || candidate > newestTimestamp)) {
        newestTimestamp = candidate;
      }
    }

    const processedThreads = new Map<string, any>();
    for (const threadId of changedThreadIds) {
      const thread = await reprocessThread(threadId, mailbox.owner_user_id);
      if (thread?.id) {
        processedThreads.set(String(thread.id), thread);
      }
    }

    await syncMailboxThreadReadStates({
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
      last_seen_message_at: newestTimestamp,
      updated_at: new Date().toISOString(),
    });

    return {
      syncedMessageCount: messages.length,
      changedThreadCount: changedThreadIds.size,
      pushNotificationCount,
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

export async function getThreadDetailForUser(userId: string, threadId: string) {
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(userId, threadId);
  const mailbox = await ensureMailboxAccess(userId, String(thread.mailbox_id));
  const [
    mailboxes,
    { data: rawMessageRows },
    { data: taskLinks },
    { data: tasks },
  ] = await Promise.all([
    listMailboxesForUser(userId),
    admin
      .from("email_messages")
      .select("*")
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
  ]);

  const messageRows = await hydrateMessageAttachmentMetadata(
    mailbox,
    ((rawMessageRows || []) as any[]).map((row: any) => ({ ...row })),
  );

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

  const mappedMailbox = mailboxes.find((entry) => entry.id === mailbox.id);
  const item = mapThreadToInboxItem({
    row: thread,
    mailbox: mappedMailbox,
    participants: participantMap.get("__thread__") || [],
    taskCount: (taskLinks || []).length,
  });

  const conversation: ConversationEntry[] = (messageRows || []).map(
    (row: any) =>
      coerceConversationEntry({
        ...row,
        author_name: row.metadata_json?.from?.[0]?.name ?? null,
        author_email: row.metadata_json?.from?.[0]?.email ?? null,
        type: "email",
      }),
  );

  return {
    ...item,
    conversation: conversation.map((entry: ConversationEntry) => ({
      ...entry,
      participants: participantMap.get(entry.id) || [],
    })),
    linkedTasks: tasks || [],
  };
}

export async function getThreadAttachmentForUser(
  userId: string,
  messageId: string,
  attachmentIndex: number,
) {
  const admin = getAdminClient();
  const { data: row } = await admin
    .from("email_messages")
    .select("id,thread_id,mailbox_id,provider_message_id,metadata_json")
    .eq("id", messageId)
    .maybeSingle();

  if (!row?.id || !row.thread_id || !row.mailbox_id || !row.provider_message_id) {
    throw new Error("Attachment not found");
  }

  await ensureThreadAccess(userId, String(row.thread_id));
  const mailbox = await ensureMailboxAccess(userId, String(row.mailbox_id));

  const attachment = await fetchMailboxAttachmentByProviderMessageId(
    mailbox as MailboxTransportRow,
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
      status: "active",
      needs_project: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  return await reprocessThread(thread.id, userId);
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

  return createTasksForThreadInternal({
    actorUserId: userId,
    thread,
    projectId: targetProjectId,
    suggestions: taskSuggestions,
    generatedBy: "user",
  });
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function uniqueEmails(values: string[]) {
  return uniqueStrings(values.map((value) => value.toLowerCase()));
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
  const admin = getAdminClient();
  const thread = await ensureThreadAccess(params.userId, params.threadId);
  const mailbox = (await ensureMailboxAccess(
    params.userId,
    String(thread.mailbox_id),
  )) as MailboxTransportRow;

  if (params.mode === "internal_note") {
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
  const mailboxEmail = mailbox.email_address.toLowerCase();
  const toEmails = uniqueEmails(
    [
      ...((metadata.from || []) as any[]).map((entry) => entry.email),
      ...((metadata.to || []) as any[]).map((entry) => entry.email),
    ].filter((email) => email && String(email).toLowerCase() !== mailboxEmail),
  );
  const ccEmails = uniqueEmails(
    (
      ((metadata.cc || []) as any[]).map((entry) => entry.email) as string[]
    ).filter((email) => email && String(email).toLowerCase() !== mailboxEmail),
  );

  if (toEmails.length === 0) {
    throw new Error("No external recipients available for reply.");
  }

  const references = uniqueStrings(
    (messages || [])
      .map((message: any) => String(message.internet_message_id || "").trim())
      .filter(Boolean),
  );

  const subject = /^re:/i.test(thread.subject || "")
    ? thread.subject
    : `Re: ${thread.subject}`;

  const attachmentPayloads = await Promise.all(
    (params.attachments || []).map(async (attachment) => {
      if (
        attachment.storageProvider !== "supabase" ||
        !attachment.url ||
        !attachment.name
      ) {
        throw new Error(`Unsupported attachment source for ${attachment.name || "file"}.`);
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

  const normalizedHtml = buildReplyHtml({
    contentHtml: params.contentHtml || params.content,
    signatureText: params.signatureText,
    attachments: attachmentPayloads,
  });
  const normalizedText = buildReplyPlainText({
    contentHtml: params.contentHtml || params.content,
    signatureText: params.signatureText,
    attachments: attachmentPayloads,
  });

  const info = await sendMailboxReply({
    mailbox,
    to: toEmails,
    cc: ccEmails,
    subject,
    text: normalizedText,
    html: normalizedHtml,
    attachments: attachmentPayloads.map((attachment) => ({
      filename: attachment.name,
      content: attachment.buffer,
      contentType: attachment.mimeType || null,
      contentDisposition: attachment.inline ? "inline" : "attachment",
    })),
    inReplyTo: latestMessage.internet_message_id ?? null,
    references,
  });

  const { data: inserted } = await admin
    .from("email_messages")
    .insert({
      thread_id: params.threadId,
      mailbox_id: mailbox.id,
      direction: "outbound",
      provider_message_id: null,
      internet_message_id: info.messageId || null,
      in_reply_to_message_id: latestMessage.internet_message_id ?? null,
      subject,
      body_text: normalizedText,
      body_html: normalizedHtml,
      sent_at: new Date().toISOString(),
      raw_headers: {},
      metadata_json: {
        from: [
          {
            email: mailbox.email_address,
            name: mailbox.display_name || null,
          },
        ],
        to: toEmails.map((email) => ({ email })),
        cc: ccEmails.map((email) => ({ email })),
      },
    })
    .select()
    .single();

  if (inserted?.id) {
    await persistParticipants(params.threadId, inserted.id, mailbox, {
      from: [
        {
          email: mailbox.email_address,
          name: mailbox.display_name || null,
        },
      ],
      to: toEmails.map((email) => ({ email })),
      cc: ccEmails.map((email) => ({ email })),
    });
  }

  await admin
    .from("email_threads")
    .update({
      latest_outbound_at: new Date().toISOString(),
      latest_message_at: new Date().toISOString(),
      is_unread: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.threadId);

  return inserted;
}

export async function applyThreadAction(params: {
  userId: string;
  threadId: string;
  action:
    | "approve"
    | "quarantine"
    | "mark_read"
    | "archive"
    | "spam"
    | "delete"
    | "always_delete_sender";
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

  if (params.action === "approve") {
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
    return reprocessThread(params.threadId, params.userId);
  }

  if (params.action === "always_delete_sender") {
    const latestMetadata = messages?.[0]?.metadata_json || {};
    const senderEmail = latestMetadata.from?.[0]?.email;
    if (senderEmail) {
      await admin.from("email_rules").insert({
        mailbox_id: mailbox.id,
        user_id: params.userId,
        name: `Always delete ${senderEmail}`,
        description: "Generated from quarantine action",
        source: "user",
        is_active: true,
        priority: 10,
        match_mode: "all",
        conditions_json: [
          { field: "sender_email", operator: "equals", value: senderEmail },
        ],
        actions_json: [{ type: "always_delete" }],
        stop_processing: true,
      });
    }
    await applyMailboxThreadAction({
      mailbox,
      providerMessageIds,
      action: "delete",
    });
    await admin
      .from("email_threads")
      .update({
        status: "deleted",
        classification: "spam",
        always_delete: true,
        is_unread: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.threadId);
    return { success: true };
  }

  const statusUpdates: Record<string, string> = {
    quarantine: "quarantine",
    archive: "archived",
    spam: "spam",
    delete: "deleted",
  };

  if (params.action === "mark_read") {
    await applyMailboxThreadAction({
      mailbox,
      providerMessageIds,
      action: "mark_read",
    });
    await admin
      .from("email_threads")
      .update({
        is_unread: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.threadId);
    return { success: true };
  }

  await applyMailboxThreadAction({
    mailbox,
    providerMessageIds,
    action: params.action as "archive" | "spam" | "delete",
  });

  await admin
    .from("email_threads")
    .update({
      status: statusUpdates[params.action],
      is_unread: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.threadId);

  return { success: true };
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
