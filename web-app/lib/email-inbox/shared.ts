import type {
  ConversationEntry,
  EmailRule,
  InboxItem,
  InboxParticipant,
  Mailbox,
  SummaryProfile,
} from "@/lib/types";

export const EMAIL_INBOX_VIEWS = new Set([
  "email-inbox",
  "email-quarantine",
  "email-rules",
  "email-ai-lab",
]);

export function isEmailInboxView(view: string) {
  return EMAIL_INBOX_VIEWS.has(view);
}

export function normalizeSubject(subject?: string | null) {
  let normalized = (subject || "").trim();
  while (/^\s*(re|fw|fwd)\s*:\s*/i.test(normalized)) {
    normalized = normalized.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim();
  }
  return normalized.replace(/\s+/g, " ").trim().toLowerCase();
}

export function buildThreadKey(input: {
  mailboxId: string;
  subject?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
  fromEmail?: string | null;
}) {
  const referenceKey =
    input.inReplyTo ||
    input.references?.find((value) => Boolean(value && value.trim())) ||
    "";

  if (referenceKey) {
    return `${input.mailboxId}:ref:${referenceKey.trim().toLowerCase()}`;
  }

  return `${input.mailboxId}:subject:${normalizeSubject(input.subject)}:${(input.fromEmail || "").trim().toLowerCase()}`;
}

export function extractPlainTextPreview(
  input?: string | null,
  maxLength = 220,
) {
  if (!input) return "";
  const plain = input
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trim()}…`;
}

export function participantLabel(participant: InboxParticipant) {
  return participant.displayName?.trim() || participant.emailAddress;
}

export function buildParticipantSummary(participants: InboxParticipant[]) {
  const from = participants.find(
    (participant) => participant.participantRole === "from",
  );
  const tos = participants.filter(
    (participant) => participant.participantRole === "to",
  );
  const ccs = participants.filter(
    (participant) => participant.participantRole === "cc",
  );
  const parts = [];

  if (from) parts.push(`From ${participantLabel(from)}`);
  if (tos.length > 0) parts.push(`To ${tos.map(participantLabel).join(", ")}`);
  if (ccs.length > 0) parts.push(`Cc ${ccs.map(participantLabel).join(", ")}`);

  return parts.join(" · ");
}

export function sortInboxItems(items: InboxItem[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.latestMessageAt || a.createdAt).getTime();
    const bTime = new Date(b.latestMessageAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

export function shouldShowInboxItemInToday(item: InboxItem) {
  return (
    item.status !== "resolved" &&
    item.status !== "archived" &&
    item.status !== "deleted" &&
    item.status !== "spam" &&
    !item.workDueDate
  );
}

export function createDefaultSummaryProfile(userId: string): SummaryProfile {
  const timestamp = new Date().toISOString();
  return {
    id: "default",
    userId,
    organizationId: null,
    mailboxId: null,
    name: "Action First",
    summaryStyle: "action_first",
    instructionText:
      "Summaries should lead with the next concrete action, note blockers, and preserve client tone.",
    settings: {
      toneDetection: true,
      routeToProjects: true,
      generateTasks: true,
    },
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function coerceRule(row: any): EmailRule {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    mailboxId: row.mailbox_id ?? null,
    userId: row.user_id ?? null,
    name: row.name,
    description: row.description ?? null,
    source: row.source,
    isActive: Boolean(row.is_active),
    priority: Number(row.priority ?? 100),
    matchMode: row.match_mode === "any" ? "any" : "all",
    conditions: Array.isArray(row.conditions_json) ? row.conditions_json : [],
    actions: Array.isArray(row.actions_json) ? row.actions_json : [],
    stopProcessing: Boolean(row.stop_processing),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function coerceSummaryProfile(row: any): SummaryProfile {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    mailboxId: row.mailbox_id ?? null,
    userId: row.user_id ?? null,
    name: row.name,
    summaryStyle: row.summary_style ?? "action_first",
    instructionText: row.instruction_text ?? "",
    settings: row.settings_json ?? {},
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function coerceMailbox(
  row: any,
  members: Mailbox["members"] = [],
): Mailbox {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    ownerUserId: row.owner_user_id,
    name: row.name,
    displayName: row.display_name ?? null,
    emailAddress: row.email_address,
    provider: row.provider,
    isShared: Boolean(row.is_shared),
    autoSyncEnabled: Boolean(row.auto_sync_enabled),
    syncFrequencyMinutes: Number(row.sync_frequency_minutes ?? 5),
    syncFolder: row.sync_folder ?? "INBOX",
    quarantineFolder: row.quarantine_folder ?? null,
    summaryProfileId: row.summary_profile_id ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    lastSyncError: row.last_sync_error ?? null,
    members,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function coerceConversationEntry(row: any): ConversationEntry {
  if (row.type === "internal_note") {
    return {
      id: row.id,
      type: "internal_note",
      direction: "internal",
      authorName: row.author_name ?? null,
      authorEmail: row.author_email ?? null,
      content: row.content ?? "",
      contentHtml: row.content ?? "",
      createdAt: row.created_at,
    };
  }

  return {
    id: row.id,
    type: "email",
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    authorName: row.author_name ?? row.display_name ?? null,
    authorEmail: row.author_email ?? null,
    subject: row.subject ?? null,
    content: row.body_text ?? "",
    contentHtml: row.body_html ?? null,
    createdAt: row.received_at ?? row.sent_at ?? row.created_at,
  };
}
