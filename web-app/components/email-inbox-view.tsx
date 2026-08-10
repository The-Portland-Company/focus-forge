"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  formatComposerRecipients,
  toDateTimeLocalValue,
} from "@/lib/email-draft-link";
import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  ArrowUpDown,
  Ban,
  Bot,
  Check,
  CheckCircle2,
  CheckSquare,
  Contact,
  CircleHelp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Expand,
  ExternalLink,
  FileText,
  FolderSearch,
  ImageIcon,
  Loader2,
  Mail,
  MailPlus,
  MailCheck,
  MailOpen,
  Paperclip,
  Plus,
  Pencil,
  Radar,
  RefreshCw,
  Search,
  SendHorizontal,
  SlidersHorizontal,
  Sparkles,
  Square,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { SkeletonEmailRow } from "@/components/skeleton-loader";
import {
  EmailWorkList,
  getEmailReadStateBadgeClassName,
  getEmailReadStateLabel,
  formatEmailSubject,
  formatParticipantName,
  getInboxReviewBadgeLabel,
  getPrimarySenderParticipant,
  getInboxReviewState,
  shouldShowStatusBadge,
  shouldShowSecondaryActionTitle,
} from "@/components/email-work-list";
import {
  describeDeletionError,
  describeDeletionHeadline,
  type PendingDeletion,
} from "@/lib/email-inbox/deletion-alerts";
import { AlertBellButton } from "@/components/alert-center";
import { EmailRulesPanel } from "@/components/email-rules-panel";
import { InboxTabModal } from "@/components/inbox-tab-modal";
import { DragToTabModal } from "@/components/drag-to-tab-modal";
import { EmailAssignProjectModal } from "@/components/email-assign-project-modal";
import { QuarantineRulesModal } from "@/components/quarantine-rules-modal";
import {
  describeDepartures,
  listExplainedDepartures,
} from "@/lib/email-inbox/thread-departures";
import {
  isUnfiledInboxItem,
  listUnresolvedAiIntents,
  matchInboxTab,
  selectTabFilteredInboxItems,
  type EmailInboxTab,
} from "@/lib/email-inbox/inbox-tabs";
import { EmailContactsView } from "@/components/email-contacts-view";
import AiRulesTabs from "@/components/ai-rules-tabs";
import { type EmailComposerInitialDraft } from "@/components/email-outbound-composer-modal";
import { EmailSignatureContent } from "@/components/email-signature-content";
import { EmailThreadAttachments } from "@/components/email-thread-attachments";
import { Tooltip } from "@/components/tooltip";
import { useToast } from "@/contexts/ToastContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FloatingFieldLabel } from "@/components/ui/floating-field-label";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Database,
  EmailOutboundDraft,
  EmailReplyDraft,
  EmailSignature,
  EmailRule,
  EmailSpamExceptionResult,
  InboxItem,
  Mailbox,
  SummaryProfile,
} from "@/lib/types";
import {
  getMailboxPasswordValidationError,
  getVisibleMailboxSyncError,
  isEmailInboxView,
  normalizeMailboxPassword,
} from "@/lib/email-inbox/shared";
import {
  claimDockBadgeLiveSource,
  computeUnreadBadgeCount,
  getDockBadgeDocumentTitle,
  normalizeDockBadgeCount,
  publishDockBadgeCount,
} from "@/lib/dock-badge";
import {
  applyMailboxProviderPreset,
  createEmptyMailboxForm,
  createMailboxFormFromMailbox,
  MAILBOX_PROVIDER_PRESETS,
} from "@/lib/email-inbox/provider-presets";
import {
  filterInboxProjects,
  getThreadProjectId,
  sortInboxProjects,
} from "@/lib/email-thread-projects";
import {
  getApplicableEmailSignatures,
  getDefaultEmailSignature,
  loadEmailSignatures,
} from "@/lib/email-signatures";
import { loadHideEmailSignaturesPreference } from "@/lib/email-signature-display";
import {
  getConversationEntriesExcludingPrimary,
  getDisplayableThreadAttachments,
  getEmailActorGradient,
  getEmailActorInitials,
  getEmailActorName,
  getPrimaryThreadRenderEntry,
} from "@/lib/email-thread-ui";
import {
  buildInboxBrowserNotificationContent,
  listNewInboxItemsForNotification,
} from "@/lib/push/email";
import {
  clampEmailDeleteUndoSeconds,
  DEFAULT_THREAD_ACTION_QUEUE_SECONDS,
  formatEmailDeleteUndoDuration,
  getQueuedThreadActionMessage,
  getThreadActionLabel,
  requiresThreadActionConfirmation,
  type ThreadAction,
} from "@/lib/email-inbox/thread-actions";
import {
  applyPendingRemovals,
  clearPendingRemoval,
  isPendingRemoval,
  markPendingRemoval,
  type PendingRemovals,
} from "@/lib/email-inbox/pending-removals";
import { createSnapshotSequence } from "@/lib/email-inbox/snapshot-sequence";
import { invalidateCachedThreadDetail } from "@/lib/email-inbox/thread-detail-cache";
import {
  INBOX_GROUP_BY_OPTIONS,
  INBOX_GROUP_BY_STORAGE_KEY,
  groupInboxItems,
  normalizeInboxGroupBy,
  type InboxGroupBy,
} from "@/lib/email-inbox/group-inbox-items";
import {
  formatReplyAttachmentSize,
  isInlineAttachmentEligible,
  type EmailReplyAttachment,
} from "@/lib/email-reply";
import { hasRichTextContent, richTextToPlainText } from "@/lib/rich-text";
import { useUserPreferences, useUserProfile } from "@/lib/supabase/hooks";
import { useEmailRealtime } from "@/hooks/use-email-realtime";
import {
  applyEmailThreadRealtimeChange,
  type EmailThreadRealtimeChange,
} from "@/lib/email-inbox/apply-realtime-patch";
import {
  DEFAULT_EMAIL_REPLY_SETTINGS,
  EMAIL_REPLY_CONCISENESS_OPTIONS,
  EMAIL_REPLY_PERSONALITY_OPTIONS,
  EMAIL_REPLY_TONE_OPTIONS,
  normalizeEmailReplySettings,
  type EmailReplySettings,
} from "@/lib/email-inbox/reply-settings";
import {
  getEmailHtmlRenderModeToggleLabel,
  normalizeEmailHtmlRenderMode,
  type EmailHtmlRenderMode,
} from "@/lib/email-html-render-mode";
import {
  clampEmailPanelWidthPercent,
  emailPanelWidthPercentToPixels,
  normalizeEmailPanelWidthOverride,
} from "@/lib/email-inbox/panel-width";
import { cn } from "@/lib/utils";

// Heavy, interaction-only modals are lazy-loaded so they stay out of the
// initial inbox client bundle. They only render once the user opens an email,
// the composer, the spam review, or a sender's history.
const EmailThreadModal = dynamic(
  () =>
    import("@/components/email-thread-modal").then(
      (mod) => mod.EmailThreadModal,
    ),
  { ssr: false },
);
const EmailOutboundComposerModal = dynamic(
  () =>
    import("@/components/email-outbound-composer-modal").then(
      (mod) => mod.EmailOutboundComposerModal,
    ),
  { ssr: false },
);
const EmailSpamReviewModal = dynamic(
  () =>
    import("@/components/email-spam-review-modal").then(
      (mod) => mod.EmailSpamReviewModal,
    ),
  { ssr: false },
);
const SenderHistoryModal = dynamic(
  () =>
    import("@/components/sender-history-modal").then(
      (mod) => mod.SenderHistoryModal,
    ),
  { ssr: false },
);

type EmailInboxViewProps = {
  view: string;
  data: Database;
  onRefresh: () => Promise<void> | void;
  currentUserId?: string;
  isDataLoading?: boolean;
  /** Whether an inbox-items read has completed (fetch resolved or cache
   *  hydrated). While false, an empty list means "still loading" and renders
   *  the skeleton, never the "No inbox work yet." empty label. */
  hasLoadedInboxItems?: boolean;
  isRefreshing?: boolean;
  freshlyUpdatedInboxIds?: Set<string>;
  onEditTask?: (taskId: string) => void;
};

type ComposerAttachment = EmailReplyAttachment & {
  previewUrl?: string | null;
  isImage?: boolean;
};

const DEFAULT_PROFILE_SETTINGS = JSON.stringify(
  {
    toneDetection: true,
    routeToProjects: true,
    generateTasks: true,
  },
  null,
  2,
);
const BROWSER_NOTIFICATION_POLL_INTERVAL_MS = 30 * 1000;
// When Supabase Realtime is connected it carries new-mail signals, so the
// poll only needs to act as a slow safety net.
const REALTIME_CONNECTED_POLL_INTERVAL_MS = 60 * 1000;

/**
 * How long after a click background snapshots wait before replacing the list.
 *
 * Long enough to cover the server round-trip and the reprocess write that
 * follow an action, short enough that new mail still lands promptly. Only
 * BACKGROUND snapshots settle — optimistic updates paint immediately.
 */
const INBOX_SETTLE_WINDOW_MS = 2500;
const EMAIL_DETAIL_PANEL_DEFAULT_WIDTH = 380;
const EMAIL_DETAIL_PANEL_MIN_WIDTH = 320;
const EMAIL_DETAIL_PANEL_MAX_WIDTH = 720;
const EMAIL_LIST_PANEL_MIN_WIDTH = 520;
// Fraction of the container width used for the reading pane when the user has
// not yet dragged the divider (no persisted width). ~60% gives a Gmail-like
// reading-pane-dominant default.
const EMAIL_DETAIL_PANEL_DEFAULT_FRACTION = 0.6;

function computeDefaultEmailDetailPanelWidth(containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return EMAIL_DETAIL_PANEL_DEFAULT_WIDTH;
  }

  return clampEmailDetailPanelWidth(
    Math.round(containerWidth * EMAIL_DETAIL_PANEL_DEFAULT_FRACTION),
    containerWidth,
  );
}
const EMAIL_INBOX_FILTER_BAR_STORAGE_KEY =
  "focus-forge.email-inbox.filter-bar-collapsed";
const EMAIL_INBOX_SHOW_SPAM_STORAGE_KEY = "emailInboxShowSpam";
const EMAIL_INBOX_PER_PAGE_STORAGE_KEY =
  "focus-forge.email-inbox.per-page";
export const EMAIL_INBOX_PER_PAGE_OPTIONS = [25, 50, 100] as const;
export const EMAIL_INBOX_DEFAULT_PER_PAGE = 50;
export const EMAIL_INBOX_MIN_PER_PAGE = 1;
export const EMAIL_INBOX_MAX_PER_PAGE = 500;

export function normalizeEmailInboxPerPage(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return (EMAIL_INBOX_PER_PAGE_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : EMAIL_INBOX_DEFAULT_PER_PAGE;
}

// Clamp an arbitrary user-entered per-page value into a sane range. Unlike
// normalizeEmailInboxPerPage (which snaps to preset options), this accepts any
// integer so the per-page input field can hold custom values. Falls back to the
// default for NaN/empty input.
export function clampEmailInboxPerPage(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return EMAIL_INBOX_DEFAULT_PER_PAGE;
  }
  return Math.min(
    Math.max(Math.trunc(parsed), EMAIL_INBOX_MIN_PER_PAGE),
    EMAIL_INBOX_MAX_PER_PAGE,
  );
}

export function getEmailInboxPageCount(
  totalItems: number,
  perPage: number,
): number {
  if (totalItems <= 0 || perPage <= 0) {
    return 1;
  }
  return Math.ceil(totalItems / perPage);
}

export function clampEmailInboxPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(page), 1), Math.max(pageCount, 1));
}

export function getEmailInboxPageItems<T>(
  items: T[],
  page: number,
  perPage: number,
): T[] {
  const pageCount = getEmailInboxPageCount(items.length, perPage);
  const safePage = clampEmailInboxPage(page, pageCount);
  const start = (safePage - 1) * perPage;
  return items.slice(start, start + perPage);
}

type EmailInboxSearchHelpToken = {
  value: string;
  description: string;
};

type EmailInboxSearchHelpDefinition = {
  label: string;
  fullPrefix: string;
  shortPrefix: string;
  description: string;
  example: string;
  aliases: string[];
  tokens?: EmailInboxSearchHelpToken[];
};

type ParsedInboxSearchQuery = {
  broadTerms: string[];
  fieldTerms: Record<string, string[]>;
  isHelpMode: boolean;
};

export const EMAIL_INBOX_SEARCH_HELP_DEFINITIONS: EmailInboxSearchHelpDefinition[] =
  [
    {
      label: "Sender",
      fullPrefix: "from:",
      shortPrefix: "f:",
      aliases: ["from", "f"],
      description:
        "Search sender first name, last name, display name, and email.",
      example: "from:spencer",
    },
    {
      label: "Recipient",
      fullPrefix: "to:",
      shortPrefix: "t:",
      aliases: ["to", "t"],
      description:
        "Search mailbox and direct recipient names or email addresses.",
      example: "to:ops",
    },
    {
      label: "Subject",
      fullPrefix: "subject:",
      shortPrefix: "s:",
      aliases: ["subject", "s"],
      description: "Search subject line only.",
      example: "subject:invoice",
    },
    {
      label: "Body",
      fullPrefix: "body:",
      shortPrefix: "b:",
      aliases: ["body", "b"],
      description: "Search preview text and AI summary text only.",
      example: "body:contract",
    },
    {
      label: "Project",
      fullPrefix: "project:",
      shortPrefix: "p:",
      aliases: ["project", "p"],
      description: "Search linked project names only.",
      example: "project:vrm",
    },
    {
      label: "Mailbox",
      fullPrefix: "mailbox:",
      shortPrefix: "m:",
      aliases: ["mailbox", "m"],
      description: "Search mailbox name, display name, and mailbox email only.",
      example: "mailbox:ceo",
    },
    {
      label: "Email",
      fullPrefix: "email:",
      shortPrefix: "e:",
      aliases: ["email", "e"],
      description: "Search any participant or mailbox email address.",
      example: "email:spencer@",
    },
    {
      label: "Name",
      fullPrefix: "name:",
      shortPrefix: "n:",
      aliases: ["name", "n"],
      description: "Search participant names only.",
      example: "name:shelby",
    },
    {
      label: "CC",
      fullPrefix: "cc:",
      shortPrefix: "c:",
      aliases: ["cc", "c"],
      description: "Search CC participant names and email addresses only.",
      example: "cc:finance",
    },
    {
      label: "Action",
      fullPrefix: "action:",
      shortPrefix: "a:",
      aliases: ["action", "a"],
      description: "Search AI action title only.",
      example: "action:reply",
    },
    {
      label: "State",
      fullPrefix: "is:",
      shortPrefix: "i:",
      aliases: ["is", "i"],
      description: "Filter by thread state instead of text matching.",
      example: "is:unread",
      tokens: [
        { value: "unread", description: "Only unread threads." },
        { value: "read", description: "Only read threads." },
        { value: "spam", description: "Only spam-classified threads." },
        {
          value: "quarantine",
          description: "Only quarantined threads.",
        },
        { value: "deleted", description: "Only deleted threads." },
      ],
    },
    {
      label: "Has",
      fullPrefix: "has:",
      shortPrefix: "h:",
      aliases: ["has", "h"],
      description: "Filter for thread relationships or content that exists.",
      example: "has:project",
      tokens: [
        { value: "project", description: "Thread already linked to a project." },
        { value: "tasks", description: "Thread already linked to one or more tasks." },
        {
          value: "attachments",
          description: "Thread has loaded attachment metadata.",
        },
      ],
    },
    {
      label: "Received",
      fullPrefix: "received:",
      shortPrefix: "r:",
      aliases: ["received", "r"],
      description: "Filter by received date keywords like today or yesterday.",
      example: "received:today",
    },
    {
      label: "Before",
      fullPrefix: "before:",
      shortPrefix: "bf:",
      aliases: ["before", "bf"],
      description: "Only threads received before a date.",
      example: "before:2026-04-01",
    },
    {
      label: "After",
      fullPrefix: "after:",
      shortPrefix: "af:",
      aliases: ["after", "af"],
      description: "Only threads received after a date.",
      example: "after:2026-04-01",
    },
    {
      label: "Thread ID",
      fullPrefix: "id:",
      shortPrefix: "#:",
      aliases: ["id", "#"],
      description: "Match a specific thread id.",
      example: "id:thread-123",
    },
  ];

function splitSearchWords(value: string) {
  return value
    .toLocaleLowerCase()
    .split(/[^a-z0-9@._+-]+/i)
    .filter(Boolean);
}

function matchesSearchTerm(term: string, values: Array<string | null | undefined>) {
  const normalizedTerm = term.trim().toLocaleLowerCase();

  if (!normalizedTerm) {
    return true;
  }

  return values.some((value) => {
    const normalizedValue = value?.trim().toLocaleLowerCase();

    if (!normalizedValue) {
      return false;
    }

    if (normalizedTerm.length <= 1) {
      return splitSearchWords(normalizedValue).some((word) =>
        word.startsWith(normalizedTerm),
      );
    }

    return normalizedValue.includes(normalizedTerm);
  });
}

function tokenizeInboxSearchQuery(query: string) {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];

    if (character === '"') {
      inQuotes = !inQuotes;
      current += character;
      continue;
    }

    if (!inQuotes && /\s/.test(character)) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function normalizeSearchTokenValue(value: string) {
  const trimmed = value.trim();

  if (
    trimmed.length >= 2 &&
    trimmed.startsWith('"') &&
    trimmed.endsWith('"')
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function getEmailInboxSearchHelpAliasMap() {
  return EMAIL_INBOX_SEARCH_HELP_DEFINITIONS.reduce<Record<string, string>>(
    (map, definition) => {
      definition.aliases.forEach((alias) => {
        map[alias] = definition.aliases[0] || alias;
      });
      return map;
    },
    {},
  );
}

const EMAIL_INBOX_SEARCH_ALIAS_MAP = getEmailInboxSearchHelpAliasMap();

export function isEmailInboxSearchHelpQuery(query: string) {
  const trimmed = query.trim();
  return trimmed === "/" || trimmed.startsWith("/help");
}

export function getEmailInboxSearchHelpFilter(query: string) {
  if (!isEmailInboxSearchHelpQuery(query)) {
    return "";
  }

  const trimmed = query.trim();
  if (trimmed === "/") {
    return "";
  }

  return trimmed.replace(/^\/help\b/i, "").trim();
}

export function filterEmailInboxSearchHelpDefinitions(
  definitions: EmailInboxSearchHelpDefinition[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return definitions;
  }

  return definitions.filter((definition) => {
    const tokenValues = (definition.tokens || []).map((token) => token.value);
    return [
      definition.label,
      definition.fullPrefix,
      definition.shortPrefix,
      definition.description,
      definition.example,
      ...definition.aliases,
      ...tokenValues,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function buildEmailInboxSearchInsertion(params: {
  currentQuery: string;
  prefix: string;
  tokenValue?: string;
}) {
  const insertion = `${params.prefix}${params.tokenValue || ""} `;
  const trimmed = params.currentQuery.trim();

  if (!trimmed || isEmailInboxSearchHelpQuery(params.currentQuery)) {
    return insertion;
  }

  return /\s$/.test(params.currentQuery)
    ? `${params.currentQuery}${insertion}`
    : `${params.currentQuery} ${insertion}`;
}

export function getEmailInboxSearchHelpCopyText(params: {
  prefix: string;
  example: string;
  tokenValue?: string;
}) {
  return params.tokenValue
    ? `${params.prefix}${params.tokenValue}`
    : params.example;
}

export function parseEmailInboxSearchQuery(query: string): ParsedInboxSearchQuery {
  if (isEmailInboxSearchHelpQuery(query)) {
    return {
      broadTerms: [],
      fieldTerms: {},
      isHelpMode: true,
    };
  }

  return tokenizeInboxSearchQuery(query).reduce<ParsedInboxSearchQuery>(
    (result, token) => {
      const prefixMatch = token.match(/^([^:\s]+):(.*)$/);

      if (
        prefixMatch?.[1] &&
        Object.prototype.hasOwnProperty.call(
          EMAIL_INBOX_SEARCH_ALIAS_MAP,
          prefixMatch[1].toLocaleLowerCase(),
        )
      ) {
        const canonicalField =
          EMAIL_INBOX_SEARCH_ALIAS_MAP[prefixMatch[1].toLocaleLowerCase()];
        const normalizedValue = normalizeSearchTokenValue(prefixMatch[2] || "");

        if (normalizedValue) {
          result.fieldTerms[canonicalField] = [
            ...(result.fieldTerms[canonicalField] || []),
            normalizedValue,
          ];
        }

        return result;
      }

      if (token.startsWith("#")) {
        const normalizedValue = normalizeSearchTokenValue(token.slice(1));
        if (normalizedValue) {
          result.fieldTerms["#"] = [
            ...(result.fieldTerms["#"] || []),
            normalizedValue,
          ];
        }
        return result;
      }

      const normalizedToken = normalizeSearchTokenValue(token);
      if (normalizedToken) {
        result.broadTerms.push(normalizedToken);
      }

      return result;
    },
    {
      broadTerms: [],
      fieldTerms: {},
      isHelpMode: false,
    },
  );
}

// Dock badge helpers live in @/lib/dock-badge so the top-level app shell can
// publish a global unread count regardless of which view is mounted. Re-export
// the pure helpers here for existing tests that import them from this module.
export { getDockBadgeDocumentTitle, normalizeDockBadgeCount };

function EmailActorAvatar({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
      style={{ background: getEmailActorGradient(name, email) }}
      aria-hidden="true"
    >
      {getEmailActorInitials(name, email)}
    </div>
  );
}

export const EMAIL_INBOX_SORT_OPTIONS = [
  {
    value: "received_desc",
    label: "Date received (Newest first)",
  },
  {
    value: "received_asc",
    label: "Date received (Oldest first)",
  },
  {
    value: "sender_asc",
    label: "Sender (A-Z)",
  },
  {
    value: "subject_asc",
    label: "Subject (A-Z)",
  },
  {
    value: "confidence_desc",
    label: "Confidence (Highest first)",
  },
] as const;

export type EmailInboxSortOption =
  (typeof EMAIL_INBOX_SORT_OPTIONS)[number]["value"];

export type EmailInboxFilterTab = "all" | "unread" | "read" | "spam";
export type EmailReplyQueueTab = "threads" | "reply_queue";
export type EmailReplyQueueFilter =
  | "all"
  | "draft"
  | "scheduled"
  | "failed"
  | "sent";

function getBrowserNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return window.Notification.permission;
}

function parseJsonValue<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

export function filterInboxItemsForView(params: {
  inboxItems: InboxItem[];
  selectedMailboxId: string;
  filterTab: EmailInboxFilterTab;
  retainedSpamThreadIds: string[];
  view: string;
}) {
  const nowMs = Date.now();
  const base = params.inboxItems.filter((item) => {
    if (
      params.selectedMailboxId !== "all" &&
      item.mailboxId !== params.selectedMailboxId
    ) {
      return false;
    }

    // Boomeranged threads leave the inbox until their time passes / task done.
    // The server already excludes them; this also hides one the instant it's
    // boomeranged, before the next refetch.
    if (
      item.boomerangUntil &&
      new Date(item.boomerangUntil).getTime() > nowMs
    ) {
      return false;
    }
    if (item.boomerangTaskId) {
      return false;
    }

    if (params.view === "email-quarantine") {
      return item.status === "quarantine";
    }

    if (params.view === "email-trash") {
      return item.status === "deleted";
    }

    if (params.view === "email-sent") {
      if (item.status === "deleted" || item.status === "quarantine") {
        return false;
      }

      return item.origin === "outbound" || item.origin === "mixed";
    }

    if (item.status === "deleted") {
      return false;
    }

    // Mirrored provider-side archiving (and resolved threads) leave the inbox.
    if (item.status === "archived" || item.status === "resolved") {
      return false;
    }

    // Quarantined threads live exclusively in the Quarantine folder.
    if (item.status === "quarantine") {
      return false;
    }

    if (item.origin === "outbound") {
      return false;
    }

    return true;
  });

  if (params.filterTab === "unread") {
    return base.filter((item) => item.isUnread);
  }

  if (params.filterTab === "read") {
    return base.filter((item) => !item.isUnread);
  }

  if (params.filterTab === "spam") {
    return base.filter((item) => getInboxReviewState(item) !== null);
  }

  return base;
}

export function filterInboxItemsBySearchQuery(params: {
  items: InboxItem[];
  query: string;
  mailboxes: Mailbox[];
  projects: Database["projects"];
}) {
  const parsedQuery = parseEmailInboxSearchQuery(params.query);

  if (parsedQuery.isHelpMode) {
    return params.items;
  }

  if (
    parsedQuery.broadTerms.length === 0 &&
    Object.keys(parsedQuery.fieldTerms).length === 0
  ) {
    return params.items;
  }

  return params.items.filter((item) => {
    const mailbox = params.mailboxes.find(
      (candidate) => candidate.id === item.mailboxId,
    );
    const project = params.projects.find(
      (candidate) => candidate.id === item.projectId,
    );
    const primaryFields = [
      item.subject,
      item.normalizedSubject,
      item.actionTitle,
    ].filter((value): value is string => Boolean(value?.trim()));
    const secondaryFields = [
      item.previewText,
      item.summaryText,
      item.mailboxName,
      item.mailboxEmailAddress,
      mailbox?.name,
      mailbox?.displayName,
      mailbox?.emailAddress,
      project?.name,
      ...(item.participants || []).flatMap((participant) => [
        participant.displayName,
        participant.emailAddress,
      ]),
    ].filter((value): value is string => Boolean(value?.trim()));
    const receivedAt =
      item.latestInboundAt || item.latestMessageAt || item.createdAt || null;
    const receivedDate = receivedAt ? new Date(receivedAt) : null;
    const senderParticipants = (item.participants || []).filter(
      (participant) => participant.participantRole === "from",
    );
    const toParticipants = (item.participants || []).filter(
      (participant) => participant.participantRole === "to",
    );
    const ccParticipants = (item.participants || []).filter(
      (participant) => participant.participantRole === "cc",
    );
    const participantNames = (participants: typeof item.participants = []) =>
      (participants || []).flatMap((participant) => [
        participant.displayName,
        ...String(participant.displayName || "")
          .split(/\s+/)
          .filter(Boolean),
      ]);
    const participantEmails = (participants: typeof item.participants = []) =>
      (participants || []).map((participant) => participant.emailAddress);
    const hasAttachments = Boolean(
      (item.conversation || []).some((entry) => (entry.attachments || []).length > 0),
    );
    const fieldMatchers: Record<string, (value: string) => boolean> = {
      from: (value) =>
        matchesSearchTerm(value, [
          ...participantNames(senderParticipants),
          ...participantEmails(senderParticipants),
        ]),
      to: (value) =>
        matchesSearchTerm(value, [
          mailbox?.name,
          mailbox?.displayName,
          mailbox?.emailAddress,
          item.mailboxName,
          item.mailboxEmailAddress,
          ...participantNames(toParticipants),
          ...participantEmails(toParticipants),
        ]),
      subject: (value) =>
        matchesSearchTerm(value, [item.subject, item.normalizedSubject]),
      body: (value) => matchesSearchTerm(value, [item.previewText, item.summaryText]),
      project: (value) => matchesSearchTerm(value, [project?.name]),
      mailbox: (value) =>
        matchesSearchTerm(value, [
          mailbox?.name,
          mailbox?.displayName,
          mailbox?.emailAddress,
          item.mailboxName,
          item.mailboxEmailAddress,
        ]),
      email: (value) =>
        matchesSearchTerm(value, [
          mailbox?.emailAddress,
          item.mailboxEmailAddress,
          ...participantEmails(item.participants),
        ]),
      name: (value) => matchesSearchTerm(value, participantNames(item.participants)),
      cc: (value) =>
        matchesSearchTerm(value, [
          ...participantNames(ccParticipants),
          ...participantEmails(ccParticipants),
        ]),
      action: (value) => matchesSearchTerm(value, [item.actionTitle]),
      is: (value) => {
        const normalizedValue = value.toLocaleLowerCase();
        if (normalizedValue === "unread") return Boolean(item.isUnread);
        if (normalizedValue === "read") return !item.isUnread;
        if (normalizedValue === "spam") {
          return item.status === "spam" || item.classification === "spam";
        }
        if (normalizedValue === "quarantine") return item.status === "quarantine";
        if (normalizedValue === "deleted") return item.status === "deleted";
        return false;
      },
      has: (value) => {
        const normalizedValue = value.toLocaleLowerCase();
        if (normalizedValue === "project") return Boolean(item.projectId);
        if (normalizedValue === "tasks") return item.derivedTaskCount > 0;
        if (normalizedValue === "attachments") return hasAttachments;
        return false;
      },
      received: (value) => {
        if (!receivedDate || Number.isNaN(receivedDate.getTime())) {
          return false;
        }
        const normalizedValue = value.toLocaleLowerCase();
        const receivedDay = receivedDate.toISOString().slice(0, 10);
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const yesterdayDate = new Date(now);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().slice(0, 10);

        if (normalizedValue === "today") return receivedDay === today;
        if (normalizedValue === "yesterday") return receivedDay === yesterday;
        return receivedDay === normalizedValue;
      },
      before: (value) => {
        if (!receivedDate || Number.isNaN(receivedDate.getTime())) {
          return false;
        }
        const comparison = new Date(value);
        return !Number.isNaN(comparison.getTime()) && receivedDate < comparison;
      },
      after: (value) => {
        if (!receivedDate || Number.isNaN(receivedDate.getTime())) {
          return false;
        }
        const comparison = new Date(value);
        return !Number.isNaN(comparison.getTime()) && receivedDate > comparison;
      },
      id: (value) => matchesSearchTerm(value, [item.id]),
      "#": (value) => matchesSearchTerm(value, [item.id]),
    };

    const broadMatches = parsedQuery.broadTerms.every((term) =>
      matchesSearchTerm(
        term,
        term.trim().length <= 1
          ? primaryFields
          : [...primaryFields, ...secondaryFields],
      ),
    );

    if (!broadMatches) {
      return false;
    }

    return Object.entries(parsedQuery.fieldTerms).every(([field, values]) => {
      const matchesField = fieldMatchers[field];
      if (!matchesField) {
        return false;
      }

      return values.some((value) => matchesField(value));
    });
  });
}

export function getEmailInboxSplitClassName() {
  return "grid min-w-0 gap-6 xl:gap-0 xl:[grid-template-columns:minmax(0,1fr)_14px_minmax(320px,var(--email-detail-width))]";
}

export function filterReplyDraftsForView(
  drafts: EmailReplyDraft[],
  filter: EmailReplyQueueFilter,
) {
  if (filter === "all") {
    return drafts;
  }

  return drafts.filter((draft) => draft.status === filter);
}

export function sortReplyDraftsForView(drafts: EmailReplyDraft[]) {
  return [...drafts].sort((left, right) => {
    const leftTime = new Date(
      left.scheduledFor || left.updatedAt || left.createdAt,
    ).getTime();
    const rightTime = new Date(
      right.scheduledFor || right.updatedAt || right.createdAt,
    ).getTime();

    return rightTime - leftTime;
  });
}

export function clampEmailDetailPanelWidth(
  requestedWidth: number,
  containerWidth: number,
) {
  if (!Number.isFinite(requestedWidth)) {
    return EMAIL_DETAIL_PANEL_DEFAULT_WIDTH;
  }

  const maxWidth = Math.min(
    EMAIL_DETAIL_PANEL_MAX_WIDTH,
    Math.max(
      EMAIL_DETAIL_PANEL_MIN_WIDTH,
      containerWidth - EMAIL_LIST_PANEL_MIN_WIDTH,
    ),
  );

  return Math.min(
    Math.max(Math.round(requestedWidth), EMAIL_DETAIL_PANEL_MIN_WIDTH),
    maxWidth,
  );
}

export function buildEmailThreadPopoutUrl(
  currentUrl: string,
  threadId: string,
) {
  const url = new URL(currentUrl);
  url.searchParams.set("threadId", threadId);
  url.searchParams.set("emailPopout", "1");
  return url.toString();
}

// Removes a leading greeting ("Hi Spencer,", "Hello ", "Hey ", "Dear ") from
// AI-generated summary/title text and re-capitalizes the first character.
// Does not mutate stored data — call only at render time.
function stripAiGreeting(text: string | null | undefined): string {
  if (!text) {
    return "";
  }
  const stripped = text.replace(/^\s*(hi|hello|hey|dear)\b[^,\n]*,?\s*/i, "");
  const result = stripped || text;
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function getInboxItemReceivedTime(item: InboxItem) {
  const timestamp =
    item.latestInboundAt || item.latestMessageAt || item.createdAt;
  const parsed = Date.parse(timestamp || "");

  return Number.isNaN(parsed) ? 0 : parsed;
}

// Most-recent ACTIVITY on the thread — inbound OR outbound. Sorting by this (vs
// inbound-only) makes a thread you just replied to bubble to the top like
// Gmail, instead of sinking because no new inbound mail arrived. latestMessageAt
// is the server's max but can lag an outbound reply, so we take the max of all
// signals defensively.
function getInboxItemActivityTime(item: InboxItem) {
  let max = 0;
  for (const candidate of [
    item.latestMessageAt,
    item.latestOutboundAt,
    item.latestInboundAt,
    item.createdAt,
  ]) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed) && parsed > max) max = parsed;
  }
  return max;
}

// Client-side date-range filter over already-loaded items. `from`/`to` are
// "YYYY-MM-DD" strings (from <input type="date">); `from` is inclusive at the
// start of that day, `to` inclusive through the end of that day. Empty bounds
// are ignored. Matching is done against the item's received timestamp.
export function filterInboxItemsByDateRange(params: {
  items: InboxItem[];
  from: string;
  to: string;
}) {
  const { items, from, to } = params;
  const fromMs = from ? Date.parse(`${from}T00:00:00`) : Number.NaN;
  const toMs = to ? Date.parse(`${to}T23:59:59.999`) : Number.NaN;
  const hasFrom = !Number.isNaN(fromMs);
  const hasTo = !Number.isNaN(toMs);

  if (!hasFrom && !hasTo) {
    return items;
  }

  return items.filter((item) => {
    const received = getInboxItemReceivedTime(item);
    if (received === 0) {
      return false;
    }
    if (hasFrom && received < fromMs) {
      return false;
    }
    if (hasTo && received > toMs) {
      return false;
    }
    return true;
  });
}

function getInboxItemSenderSortValue(item: InboxItem) {
  const sender = getPrimarySenderParticipant(item.participants, [
    item.mailboxEmailAddress,
  ]);

  if (!sender) {
    return "\uffff";
  }

  return formatParticipantName(sender).toLocaleLowerCase();
}

function getInboxItemSubjectSortValue(item: InboxItem) {
  const subject = item.normalizedSubject || item.subject || "";
  const normalized = subject.trim().toLocaleLowerCase();

  return normalized || "\uffff";
}

function compareInboxItemsByReceived(
  left: InboxItem,
  right: InboxItem,
  direction: "asc" | "desc" = "desc",
) {
  const difference =
    getInboxItemActivityTime(left) - getInboxItemActivityTime(right);

  if (difference !== 0) {
    return direction === "asc" ? difference : -difference;
  }

  return left.id.localeCompare(right.id);
}

export function sortInboxItemsForView(
  items: InboxItem[],
  sortBy: EmailInboxSortOption,
) {
  return [...items].sort((left, right) => {
    switch (sortBy) {
      case "received_asc":
        return compareInboxItemsByReceived(left, right, "asc");
      case "sender_asc": {
        const comparison = getInboxItemSenderSortValue(left).localeCompare(
          getInboxItemSenderSortValue(right),
        );

        return comparison || compareInboxItemsByReceived(left, right);
      }
      case "subject_asc": {
        const comparison = getInboxItemSubjectSortValue(left).localeCompare(
          getInboxItemSubjectSortValue(right),
        );

        return comparison || compareInboxItemsByReceived(left, right);
      }
      case "confidence_desc": {
        const difference =
          (right.actionConfidence ?? -1) - (left.actionConfidence ?? -1);

        return difference || compareInboxItemsByReceived(left, right);
      }
      case "received_desc":
      default:
        return compareInboxItemsByReceived(left, right);
    }
  });
}

export function getThreadActionButtonIconName(action: ThreadAction) {
  switch (action) {
    case "approve":
      return "check";
    case "quarantine":
      return "shield";
    case "archive":
      return "archive";
    case "spam":
      return "shield-alert";
    case "delete":
    case "always_delete_sender":
      return "trash-2";
    default:
      return null;
  }
}

export function getThreadActionButtonClassName(options?: {
  destructive?: boolean;
}) {
  return options?.destructive
    ? "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-900/50 bg-red-950/40 text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
    : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50";
}

export function getConversationEntryHeaderClassName(
  isCurrentUserEntry: boolean,
) {
  return isCurrentUserEntry
    ? "flex items-start gap-3"
    : "flex items-start justify-between gap-3";
}

export function applyOptimisticThreadReadState(
  items: InboxItem[],
  threadId: string,
) {
  return items.map((item) =>
    item.id === threadId ? { ...item, isUnread: false } : item,
  );
}

export function applyOptimisticThreadActionState(
  items: InboxItem[],
  threadId: string,
  action: ThreadAction,
): InboxItem[] {
  let didChange = false;

  const nextItems = items.map((item) => {
    if (item.id !== threadId) {
      return item;
    }

    didChange = true;

    switch (action) {
      case "approve": {
        const nextItem: InboxItem = {
          ...item,
          status: item.projectId ? "active" : "needs_project",
          classification:
            item.classification === "spam" ? "actionable" : item.classification,
          isUnread: false,
        };
        return nextItem;
      }
      case "quarantine": {
        const nextItem: InboxItem = {
          ...item,
          status: "quarantine",
          isUnread: false,
        };
        return nextItem;
      }
      case "archive": {
        const nextItem: InboxItem = {
          ...item,
          status: "archived",
          isUnread: false,
        };
        return nextItem;
      }
      case "spam": {
        const nextItem: InboxItem = {
          ...item,
          status: "spam",
          classification: "spam",
          isUnread: false,
        };
        return nextItem;
      }
      case "delete":
      case "always_delete_sender": {
        const nextItem: InboxItem = {
          ...item,
          status: "deleted",
          classification: "spam",
          alwaysDelete: false,
          isUnread: false,
        };
        return nextItem;
      }
      case "mark_read": {
        const nextItem: InboxItem = {
          ...item,
          isUnread: false,
        };
        return nextItem;
      }
      default:
        return item;
    }
  });

  return didChange ? nextItems : items;
}

export function mergeInboxItem(items: InboxItem[], nextItem: InboxItem) {
  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

export function getSpamScanProgressPercent(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (completed / total) * 100));
}

function getThreadActionButtonIcon(action: ThreadAction) {
  switch (getThreadActionButtonIconName(action)) {
    case "check":
      return <Check className="h-4 w-4" />;
    case "shield":
      return <Shield className="h-4 w-4" />;
    case "archive":
      return <Archive className="h-4 w-4" />;
    case "shield-alert":
      return <ShieldAlert className="h-4 w-4" />;
    case "trash-2":
      return <Trash2 className="h-4 w-4" />;
    default:
      return null;
  }
}

/**
 * "unread/total" badge for an inbox category tab — same shape as the sidebar
 * folder counts: unread in the theme colour, total muted behind a slash. The
 * unread half is dropped when there is nothing unread, so a quiet tab stays
 * visually calm.
 */
function InboxTabCount({ unread, total }: { unread: number; total: number }) {
  if (total === 0) return null;
  return (
    <span className="ml-1 text-[10px] tabular-nums">
      {unread > 0 ? (
        <span className="font-medium text-[rgb(var(--theme-primary-rgb))]">
          {unread}
        </span>
      ) : null}
      {unread > 0 ? <span className="text-zinc-600">/</span> : null}
      <span className="text-zinc-500">{total}</span>
    </span>
  );
}

export function EmailInboxView({
  view,
  data,
  onRefresh,
  currentUserId,
  isDataLoading = false,
  hasLoadedInboxItems = true,
  isRefreshing = false,
  freshlyUpdatedInboxIds,
  onEditTask,
}: EmailInboxViewProps) {
  const router = useRouter();
  const {
    showSuccess: showContactsSuccess,
    showError: showContactsError,
    upsertAlert,
    dismissAlert,
  } = useToast();
  const isInboxView = view === "email-inbox";
  const isSentView = view === "email-sent";
  const isTrashView = view === "email-trash";
  const isQuarantineView = view === "email-quarantine";
  const isDefaultInboxView = !isSentView && !isTrashView && !isQuarantineView;
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [mailboxes, setMailboxes] = useState(data.mailboxes);
  const [inboxItems, setInboxItems] = useState(data.inboxItems);
  // Server-backed search results across the FULL mailbox (not just the recent
  // 200 loaded in `inboxItems`). Populated by a debounced fetch when the user
  // types a broad (non-field-scoped) term; null when no server search is active.
  const [serverSearchItems, setServerSearchItems] = useState<
    InboxItem[] | null
  >(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [quarantineCount, setQuarantineCount] = useState(data.quarantineCount);
  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState<NotificationPermission | "unsupported">("unsupported");
  const [loadingThread, setLoadingThread] = useState(false);
  const [showMailboxForm, setShowMailboxForm] = useState(false);
  const [editingMailboxId, setEditingMailboxId] = useState<string | null>(null);
  const [mailboxForm, setMailboxForm] = useState(createEmptyMailboxForm);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [inlineProjectPickerThreadId, setInlineProjectPickerThreadId] =
    useState<string | null>(null);
  const [inlineProjectSearchQuery, setInlineProjectSearchQuery] = useState("");
  const [assigningProjectThreadId, setAssigningProjectThreadId] = useState<
    string | null
  >(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<
    ComposerAttachment[]
  >([]);
  const [replyDrafts, setReplyDrafts] = useState<EmailReplyDraft[]>([]);
  const [selectedReplyDraftId, setSelectedReplyDraftId] = useState<
    string | null
  >(null);
  const [replyQueueTab, setReplyQueueTab] =
    useState<EmailReplyQueueTab>("threads");
  const [replyQueueFilter, setReplyQueueFilter] =
    useState<EmailReplyQueueFilter>("draft");
  const [scheduledReplyAt, setScheduledReplyAt] = useState("");
  const [replyStyleOverrideEnabled, setReplyStyleOverrideEnabled] =
    useState(false);
  const [replyStyleOverrides, setReplyStyleOverrides] =
    useState<EmailReplySettings>(DEFAULT_EMAIL_REPLY_SETTINGS);
  const [emailHtmlRenderMode, setEmailHtmlRenderMode] =
    useState<EmailHtmlRenderMode>("preserve");
  const [replyMode, setReplyMode] = useState<"reply_all" | "internal_note">(
    "reply_all",
  );
  const [emailSignatures, setEmailSignatures] = useState<EmailSignature[]>([]);
  const [hideEmailSignatures, setHideEmailSignatures] = useState(true);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(
    null,
  );
  const [signatureSearchQuery, setSignatureSearchQuery] = useState("");
  const [isSignaturePickerOpen, setIsSignaturePickerOpen] = useState(false);
  const [busyState, setBusyState] = useState<string | null>(null);

  const [pendingConfirmAction, setPendingConfirmAction] =
    useState<ThreadAction | null>(null);
  const [isEmptyTrashConfirmVisible, setIsEmptyTrashConfirmVisible] =
    useState(false);
  const [queuedAction, setQueuedAction] = useState<ThreadAction | null>(null);
  const [isQueuedActionNoticeVisible, setIsQueuedActionNoticeVisible] =
    useState(false);
  const [editingProfile, setEditingProfile] = useState<SummaryProfile | null>(
    null,
  );
  const [isSpamReviewOpen, setIsSpamReviewOpen] = useState(false);
  const [isRuleEditorOpen, setIsRuleEditorOpen] = useState(false);
  const [ruleEditorInitialRule, setRuleEditorInitialRule] =
    useState<EmailRule | null>(null);
  const [inboxFilterTab, setInboxFilterTab] =
    useState<EmailInboxFilterTab>("all");
  // Custom rule-based inbox tabs. `selectedInboxTabId` is null for "All"; the
  // first tab (Known Contacts) is selected once tabs load.
  const [inboxTabs, setInboxTabs] = useState<EmailInboxTab[]>([]);
  const [selectedInboxTabId, setSelectedInboxTabId] = useState<string | null>(
    null,
  );
  const [inboxTabModalOpen, setInboxTabModalOpen] = useState(false);
  const [editingInboxTab, setEditingInboxTab] = useState<EmailInboxTab | null>(
    null,
  );
  // Tab currently under a dragged email (drop-target highlight).
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  // Pending "drag email → tab" confirmation (rule verification modal).
  const [dragToTab, setDragToTab] = useState<{
    item: InboxItem;
    targetTab: EmailInboxTab;
    /** Opened from the context menu rather than a drop: let the user pick the
     *  destination tab inside the modal. */
    retarget?: boolean;
  } | null>(null);
  // Email pending a quarantine-rules confirmation modal.
  const [quarantineModalItem, setQuarantineModalItem] =
    useState<InboxItem | null>(null);
  const [showContactsView, setShowContactsView] = useState(false);

  // Returning from the Google contacts OAuth flow lands back on the inbox URL
  // with `?google=connected`. Finish the import, surface the result, open the
  // Contacts view, and scrub the query param so a refresh doesn't re-run it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") !== "connected") return;
    setShowContactsView(true);
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/email/contacts/google/import`, {
          method: "POST",
        });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const payload = (await response.json()) as {
          result?: {
            imported?: number;
            updated?: number;
            skipped?: number;
            total?: number;
          };
        };
        if (cancelled) return;
        const result = payload.result ?? {};
        showContactsSuccess(
          "Google contacts imported",
          `${result.imported ?? 0} added, ${result.updated ?? 0} updated, ${result.skipped ?? 0} skipped.`,
        );
      } catch (error) {
        console.error("Failed to import Google contacts", error);
        if (!cancelled) {
          showContactsError(
            "Google import failed",
            "Please try connecting again.",
          );
        }
      }
    })();
    params.delete("google");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
    return () => {
      cancelled = true;
    };
    // Run once on mount; intentionally not re-running on toast identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [inboxSearchQuery, setInboxSearchQuery] = useState("");
  const [isSearchHelpDialogOpen, setIsSearchHelpDialogOpen] = useState(false);
  const [copiedSearchHelpValue, setCopiedSearchHelpValue] = useState<
    string | null
  >(null);
  const [isFilterBarCollapsed, setIsFilterBarCollapsed] = useState(true);
  const [inboxGroupBy, setInboxGroupBy] = useState<InboxGroupBy>("none");
  // Client-side date-range filter (YYYY-MM-DD strings from <input type="date">).
  // Applied near-instantly over the already-loaded items in the filter pipeline.
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");
  const [showSpamInInbox, setShowSpamInInbox] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(EMAIL_INBOX_DEFAULT_PER_PAGE);
  // Raw text backing the per-page input so the user can clear/retype freely; the
  // committed numeric value lives in `perPage`.
  const [perPageInput, setPerPageInput] = useState<string>(
    String(EMAIL_INBOX_DEFAULT_PER_PAGE),
  );
  const [pageJumpInput, setPageJumpInput] = useState("");
  const [alwaysShowSummary, setAlwaysShowSummary] = useState(false);
  const [alwaysShowExcerpt, setAlwaysShowExcerpt] = useState(false);
  const [sortBy, setSortBy] = useState<EmailInboxSortOption>("received_desc");
  const [spamScanProgress, setSpamScanProgress] = useState<{
    total: number;
    completed: number;
    currentPosition: number;
    currentThreadId: string | null;
    currentSubject: string | null;
    detectedSpamIds: string[];
  } | null>(null);
  const [retainedSpamThreadIds, setRetainedSpamThreadIds] = useState<string[]>(
    [],
  );
  const [senderHistory, setSenderHistory] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [detailPanelWidth, setDetailPanelWidth] = useState(
    EMAIL_DETAIL_PANEL_DEFAULT_WIDTH,
  );
  const [isDesktopSplitLayout, setIsDesktopSplitLayout] = useState(false);
  const [isThreadModalOpen, setIsThreadModalOpen] = useState(false);
  // Optimistic delete animation: ids with a delete request in flight (row shows
  // a strike-through + "Deleting…" spinner) and ids whose delete succeeded and
  // are sliding off the list before being dropped from state.
  const [deletingThreadIds, setDeletingThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [removingThreadIds, setRemovingThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Deletion tray: emails are removed from the list instantly on delete, and
  // their in-flight (and failed) status lives here until the server confirms.
  // Thread the user asked to be shown after a delete failed. Drives the
  // three-blink red border on the row (see .email-row-blink-error).
  const [erroredThreadId, setErroredThreadId] = useState<string | null>(null);
  const erroredThreadTimerRef = useRef<number | null>(null);
  // When the user deletes the currently-open thread we close the detail panel
  // and keep it closed — without this the "auto-select first visible thread"
  // effect would immediately re-open another thread. Reset whenever the user
  // manually selects a thread.
  const suppressInboxAutoSelectRef = useRef(false);
  const [isReplyDragActive, setIsReplyDragActive] = useState(false);
  // Email whose project picker (type-to-search + suggestions) is open.
  const [assignProjectItem, setAssignProjectItem] = useState<InboxItem | null>(
    null,
  );
  const [isOutboundComposerOpen, setIsOutboundComposerOpen] = useState(false);
  const [outboundComposerInitialDraft, setOutboundComposerInitialDraft] =
    useState<EmailComposerInitialDraft | null>(null);
  // Optimistic completed-state overrides for linked tasks, keyed by task id.
  // Falls back to the task's persisted `completed` flag when no override.
  const [completedLinkedTaskOverrides, setCompletedLinkedTaskOverrides] =
    useState<Record<string, boolean>>({});
  // Optimistically flip the linked task's completed state, then best-effort
  // persist via PUT /api/tasks/:id. Keeps the row visible (strike-through).
  const handleToggleLinkedTaskCompleted = async (
    taskId: string,
    next: boolean,
  ) => {
    setCompletedLinkedTaskOverrides((current) => ({
      ...current,
      [taskId]: next,
    }));
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          completed: next,
          completed_at: next ? new Date().toISOString() : null,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to update task");
      }
    } catch {
      // Revert the optimistic flip on failure.
      setCompletedLinkedTaskOverrides((current) => ({
        ...current,
        [taskId]: !next,
      }));
    }
  };
  // When true the user is actively searching/editing the project field, so we
  // show the raw input instead of the selected-project chip occupying it.
  const [isEditingProjectField, setIsEditingProjectField] = useState(false);
  // Reveals previously-collapsed older conversation messages.
  const [showOlderConversation, setShowOlderConversation] = useState(false);
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement | null>(null);
  // "Has ever been opened" latches: keep lazy modals unmounted (so their JS
  // chunk stays out of the initial bundle) until first opened, then keep them
  // mounted so their close/exit animations are preserved on subsequent toggles.
  const threadModalShouldOpen = isThreadModalOpen && Boolean(selectedThreadId);
  const [threadModalLoaded, setThreadModalLoaded] = useState(false);
  const [spamReviewLoaded, setSpamReviewLoaded] = useState(false);
  const [outboundComposerLoaded, setOutboundComposerLoaded] = useState(false);
  const [senderHistoryLoaded, setSenderHistoryLoaded] = useState(false);
  useEffect(() => {
    if (threadModalShouldOpen) setThreadModalLoaded(true);
  }, [threadModalShouldOpen]);
  useEffect(() => {
    if (isSpamReviewOpen) setSpamReviewLoaded(true);
  }, [isSpamReviewOpen]);
  useEffect(() => {
    if (isOutboundComposerOpen) setOutboundComposerLoaded(true);
  }, [isOutboundComposerOpen]);
  // Cmd/Ctrl+N composes a new email anywhere in the inbox and its sub-views.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        (event.key === "n" || event.key === "N")
      ) {
        event.preventDefault();
        setOutboundComposerInitialDraft(null);
        setIsOutboundComposerOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (senderHistory) setSenderHistoryLoaded(true);
  }, [senderHistory]);
  const inboxSearchInputRef = useRef<HTMLInputElement | null>(null);
  const replyAttachmentsRef = useRef<ComposerAttachment[]>([]);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  // True once the user drags the divider this session, so profile re-syncs
  // don't snap the panel back out from under an active resize.
  const hasUserResizedPanelRef = useRef(false);
  const queuedActionTimeoutRef = useRef<number | null>(null);
  const copiedSearchHelpTimeoutRef = useRef<number | null>(null);
  // Last-loaded conversation per thread, so reopening one is instant.
  const threadDetailCacheRef = useRef<Map<string, any>>(new Map());
  const inboxSnapshotRef = useRef<InboxItem[]>(data.inboxItems);
  /** thread id → epoch ms the user last acted on it, so a status change the
   *  server makes moments later can be attributed and explained. */
  const touchedThreadsRef = useRef<Map<string, number>>(new Map());
  /** Epoch ms of the user's last list interaction. Background snapshots settle
   *  rather than re-sorting the list while they are still working in it. */
  const lastInteractionAtRef = useRef<number>(0);
  const deferredSnapshotRef = useRef<any>(null);
  const settleTimerRef = useRef<number | null>(null);
  const applyInboxSnapshotRef = useRef<((params: any) => void) | null>(null);
  // Orders concurrent /api/email/inbox reads so a stale response can never
  // overwrite a newer one (see lib/email-inbox/snapshot-sequence).
  const inboxSnapshotSequenceRef = useRef(createSnapshotSequence());
  const mailboxesRef = useRef<Mailbox[]>(data.mailboxes);
  const refreshInboxStateRef = useRef<
    | ((options?: {
        allowBrowserNotifications?: boolean;
        skipMailboxes?: boolean;
      }) => Promise<void>)
    | null
  >(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    mailboxId: "all",
    summaryStyle: "action_first",
    instructionText:
      "Summaries should lead with the next concrete action, note blockers, and preserve client tone.",
    isDefault: false,
    settingsJson: DEFAULT_PROFILE_SETTINGS,
  });
  const { profile, updateProfile } = useUserProfile();
  const { preferences } = useUserPreferences();
  const deleteUndoSeconds = clampEmailDeleteUndoSeconds(
    profile?.email_delete_undo_seconds,
  );

  // The broad (non-field-scoped) portion of the search query that the SERVER
  // searches across the full mailbox. Field-scoped terms (from:/subject:/etc.)
  // and date ranges stay client-side and are applied on top of the results.
  const serverSearchQuery = useMemo(() => {
    const trimmed = inboxSearchQuery.trim();
    if (!trimmed || isEmailInboxSearchHelpQuery(trimmed)) return "";
    const parsed = parseEmailInboxSearchQuery(trimmed);
    const broad = parsed.broadTerms.join(" ").trim();
    // Require at least one broad term of length >= 2 to avoid firing on a
    // single character or a purely field-scoped query.
    if (!parsed.broadTerms.some((term) => term.length >= 2)) return "";
    return broad;
  }, [inboxSearchQuery]);

  // Debounced server-side search across the full mailbox. AbortController +
  // request-id guard ensure a stale (older) response can never overwrite the
  // results of a newer query. On error we fall back to client-side filtering of
  // the already-loaded items (never blank the list).
  const searchRequestIdRef = useRef(0);
  useEffect(() => {
    if (!serverSearchQuery) {
      // Query cleared / no broad term: drop server results, revert to capped list.
      searchRequestIdRef.current += 1;
      setServerSearchItems(null);
      setSearchLoading(false);
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    const controller = new AbortController();
    setSearchLoading(true);

    const timer = setTimeout(() => {
      fetch(`/api/email/inbox?search=${encodeURIComponent(serverSearchQuery)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("search request failed");
          const items = (await response.json()) as InboxItem[];
          // Ignore stale responses: only the most recent request may commit.
          if (requestId !== searchRequestIdRef.current) return;
          setServerSearchItems(Array.isArray(items) ? items : []);
          setSearchLoading(false);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          if (requestId !== searchRequestIdRef.current) return;
          // Fall back to client-side filtering of loaded items on error.
          console.error("Email inbox server search failed", error);
          setServerSearchItems(null);
          setSearchLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [serverSearchQuery]);

  // When a server search is active, use its full-mailbox results as the base
  // list for the visible pipeline instead of the recency-capped `inboxItems`.
  // All client-side refinements (folder/mailbox/status, field-scoped search,
  // date range, sort, pagination) still run on top.
  const isServerSearchActive = serverSearchItems !== null;
  const baseInboxItems = isServerSearchActive ? serverSearchItems : inboxItems;

  const filteredInboxItems = useMemo(
    () =>
      filterInboxItemsForView({
        inboxItems: baseInboxItems,
        selectedMailboxId,
        filterTab: inboxFilterTab,
        retainedSpamThreadIds,
        view,
      }),
    [
      baseInboxItems,
      inboxFilterTab,
      retainedSpamThreadIds,
      selectedMailboxId,
      view,
    ],
  );
  const spamGatedInboxItems = useMemo(() => {
    // Only the main /email-inbox list hides spam by default. Quarantine, Trash,
    // and Sent views are unaffected. The user can opt-in via the toolbar
    // toggle (persisted in localStorage as `emailInboxShowSpam`).
    if (view !== "email-inbox" || showSpamInInbox) {
      return filteredInboxItems;
    }
    if (inboxFilterTab === "spam") {
      // Honor the explicit "Spam" filter tab even when the toggle is off.
      return filteredInboxItems;
    }
    return filteredInboxItems.filter(
      (item) => item.classification !== "spam",
    );
  }, [filteredInboxItems, inboxFilterTab, showSpamInInbox, view]);
  // A search is in progress the moment the user has typed something, whether or
  // not the debounced server search has come back yet. Category tabs stand down
  // for the whole of it, so results never depend on which tab happened to be
  // selected when the query was typed.
  const isInboxSearchActive = inboxSearchQuery.trim().length > 0;

  // Load the user's custom inbox tabs (seeds defaults on first use) and select
  // the first tab (Known Contacts) by default.
  useEffect(() => {
    if (view !== "email-inbox") return;
    let cancelled = false;
    fetch("/api/email/inbox-tabs", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { tabs: [] }))
      .then((d) => {
        if (cancelled) return;
        const tabs: EmailInboxTab[] = d.tabs || [];
        setInboxTabs(tabs);
        setSelectedInboxTabId((prev) =>
          prev ?? (tabs.length > 0 ? tabs[0].id : null),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Apply the selected custom tab's rules (null = "All"). An explicit tab
  // assignment (item.inboxTabId, set by dragging an email onto a tab) is a
  // "move": that thread appears ONLY under its assigned tab — hidden from other
  // category tabs and from "All" — overriding rule-based matching.
  const tabFilteredInboxItems = useMemo(
    () =>
      selectTabFilteredInboxItems({
        items: spamGatedInboxItems,
        tabs: inboxTabs,
        selectedTabId: selectedInboxTabId,
        isSearching: isInboxSearchActive,
      }),
    [spamGatedInboxItems, inboxTabs, selectedInboxTabId, isInboxSearchActive],
  );

  // Per-tab counts shown as "unread/total", mirroring the sidebar folders. Both
  // tab rows count from the same set the tabs themselves filter, so a badge can
  // never disagree with the list it opens.
  const inboxTabCounts = useMemo(() => {
    const countOf = (items: InboxItem[]) => ({
      total: items.length,
      unread: items.filter((item) => item.isUnread).length,
    });
    return {
      all: countOf(
        spamGatedInboxItems.filter((item) =>
          isUnfiledInboxItem(item, inboxTabs),
        ),
      ),
      byTabId: new Map(
        inboxTabs.map((tab) => [
          tab.id,
          countOf(
            spamGatedInboxItems.filter((item) =>
              item.inboxTabId
                ? item.inboxTabId === tab.id
                : matchInboxTab(item, tab.rules),
            ),
          ),
        ]),
      ),
    };
  }, [inboxTabs, spamGatedInboxItems]);

  // Read/unread/spam counts for the filter row. These count the tab-filtered
  // set, so they describe what each filter would actually show right now.
  const inboxFilterCounts = useMemo(() => {
    const items = tabFilteredInboxItems;
    return {
      all: items.length,
      unread: items.filter((item) => item.isUnread).length,
      read: items.filter((item) => !item.isUnread).length,
      spam: items.filter(
        (item) => item.status === "spam" || item.classification === "spam",
      ).length,
    };
  }, [tabFilteredInboxItems]);

  // "AI decides" tab conditions: ask the server for verdicts on threads that
  // don't have one yet, a small batch at a time, and merge them into state so
  // the rules can file the mail. Threads already judged cost nothing.
  const aiEvaluationInFlightRef = useRef(false);
  useEffect(() => {
    if (view !== "email-inbox") return;
    if (aiEvaluationInFlightRef.current) return;
    const unresolved = listUnresolvedAiIntents(inboxItems, inboxTabs);
    if (unresolved.length === 0) return;

    const threadIds = Array.from(
      new Set(unresolved.map((entry) => entry.threadId)),
    ).slice(0, 12);
    const prompts = Array.from(new Set(unresolved.map((e) => e.prompt)));

    aiEvaluationInFlightRef.current = true;
    void fetch("/api/email/inbox-tabs/ai-evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ threadIds, prompts }),
    })
      .then((r) => (r.ok ? r.json() : { verdicts: {} }))
      .then((payload: { verdicts?: Record<string, Record<string, boolean>> }) => {
        const verdicts = payload?.verdicts || {};
        if (Object.keys(verdicts).length === 0) return;
        setInboxItems((current) => {
          const next = current.map((item) =>
            verdicts[item.id]
              ? { ...item, aiTabVerdicts: { ...item.aiTabVerdicts, ...verdicts[item.id] } }
              : item,
          );
          inboxSnapshotRef.current = next;
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => {
        aiEvaluationInFlightRef.current = false;
      });
  }, [view, inboxItems, inboxTabs]);

  const searchedInboxItems = useMemo(
    () =>
      filterInboxItemsBySearchQuery({
        items: tabFilteredInboxItems,
        query: inboxSearchQuery,
        mailboxes,
        projects: data.projects,
      }),
    [data.projects, tabFilteredInboxItems, inboxSearchQuery, mailboxes],
  );
  const dateFilteredInboxItems = useMemo(
    () =>
      filterInboxItemsByDateRange({
        items: searchedInboxItems,
        from: searchDateFrom,
        to: searchDateTo,
      }),
    [searchedInboxItems, searchDateFrom, searchDateTo],
  );
  const visibleInboxItems = useMemo(
    () => sortInboxItemsForView(dateFilteredInboxItems, sortBy),
    [dateFilteredInboxItems, sortBy],
  );
  const pageCount = useMemo(
    () => getEmailInboxPageCount(visibleInboxItems.length, perPage),
    [visibleInboxItems.length, perPage],
  );
  const safeCurrentPage = useMemo(
    () => clampEmailInboxPage(currentPage, pageCount),
    [currentPage, pageCount],
  );
  // Cluster by the active grouping BEFORE paginating so groups stay
  // contiguous instead of being split across pages.
  const groupedInboxItems = useMemo(
    () =>
      groupInboxItems(
        visibleInboxItems,
        inboxGroupBy,
        (item) =>
          formatParticipantName(
            getPrimarySenderParticipant(item.participants, [
              item.mailboxEmailAddress,
            ]),
          ),
        (projectId) =>
          projectId
            ? (data.projects.find((project) => project.id === projectId)
                ?.name ?? null)
            : null,
      ),
    [data.projects, inboxGroupBy, visibleInboxItems],
  );
  const pagedInboxItems = useMemo(
    () => getEmailInboxPageItems(groupedInboxItems, safeCurrentPage, perPage),
    [groupedInboxItems, safeCurrentPage, perPage],
  );

  const visibleSyncError = useMemo(
    () => getVisibleMailboxSyncError(mailboxes, selectedMailboxId),
    [mailboxes, selectedMailboxId],
  );
  const unreadInboxCount = useMemo(
    () => visibleInboxItems.filter((item) => item.isUnread).length,
    [visibleInboxItems],
  );
  const trashedThreadCount = useMemo(
    () => filteredInboxItems.filter((item) => item.status === "deleted").length,
    [filteredInboxItems],
  );
  const spamScanProgressPercent = useMemo(
    () =>
      getSpamScanProgressPercent(
        spamScanProgress?.completed || 0,
        spamScanProgress?.total || 0,
      ),
    [spamScanProgress],
  );
  const selectedMailbox = useMemo(
    () =>
      selectedMailboxId === "all"
        ? null
        : mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) || null,
    [mailboxes, selectedMailboxId],
  );
  const sortedInboxProjects = useMemo(
    () => sortInboxProjects(data.projects),
    [data.projects],
  );
  const filteredInboxProjects = useMemo(
    () => filterInboxProjects(sortedInboxProjects, projectSearchQuery),
    [projectSearchQuery, sortedInboxProjects],
  );
  const filteredInlineInboxProjects = useMemo(
    () => filterInboxProjects(sortedInboxProjects, inlineProjectSearchQuery),
    [inlineProjectSearchQuery, sortedInboxProjects],
  );
  const isSearchHelpMode = useMemo(
    () => isEmailInboxSearchHelpQuery(inboxSearchQuery),
    [inboxSearchQuery],
  );
  const searchHelpFilter = useMemo(
    () => getEmailInboxSearchHelpFilter(inboxSearchQuery),
    [inboxSearchQuery],
  );
  const filteredSearchHelpDefinitions = useMemo(
    () =>
      filterEmailInboxSearchHelpDefinitions(
        EMAIL_INBOX_SEARCH_HELP_DEFINITIONS,
        searchHelpFilter,
      ),
    [searchHelpFilter],
  );
  const selectedProjectId = getThreadProjectId(selectedThread);
  const selectedProject = useMemo(
    () =>
      sortedInboxProjects.find((project) => project.id === selectedProjectId) ||
      null,
    [selectedProjectId, sortedInboxProjects],
  );
  const visibleReplyDrafts = useMemo(
    () =>
      sortReplyDraftsForView(
        filterReplyDraftsForView(replyDrafts, replyQueueFilter),
      ),
    [replyDrafts, replyQueueFilter],
  );
  const selectedReplyDraft = useMemo(
    () =>
      replyDrafts.find((draft) => draft.id === selectedReplyDraftId) || null,
    [replyDrafts, selectedReplyDraftId],
  );
  const currentUser = useMemo(
    () =>
      currentUserId
        ? data.users.find((user) => user.id === currentUserId) || null
        : null,
    [currentUserId, data.users],
  );
  const selectedThreadShowsSecondaryActionTitle =
    shouldShowSecondaryActionTitle(
      selectedThread?.actionTitle,
      selectedThread?.subject || "",
    );
  const applicableSignatures = useMemo(
    () =>
      getApplicableEmailSignatures(
        emailSignatures,
        selectedThread?.mailboxId || selectedThread?.mailbox_id || null,
      ),
    [emailSignatures, selectedThread],
  );
  const filteredApplicableSignatures = useMemo(() => {
    const query = signatureSearchQuery.trim().toLowerCase();
    if (!query) return applicableSignatures;

    return applicableSignatures.filter(
      (signature) =>
        signature.name.toLowerCase().includes(query) ||
        signature.content.toLowerCase().includes(query),
    );
  }, [applicableSignatures, signatureSearchQuery]);
  const selectedSignature =
    applicableSignatures.find(
      (signature) => signature.id === selectedSignatureId,
    ) || null;
  const selectedThreadPrimaryEntry = getPrimaryThreadRenderEntry(
    selectedThread?.conversation,
  );
  const selectedThreadPrimaryAttachments = getDisplayableThreadAttachments(
    selectedThreadPrimaryEntry,
  );
  const selectedThreadConversationEntries =
    getConversationEntriesExcludingPrimary(selectedThread?.conversation);
  const isEditingMailbox = editingMailboxId !== null;
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (inboxSearchQuery.trim()) count += 1;
    if (selectedMailboxId !== "all") count += 1;
    if (sortBy !== "received_desc") count += 1;
    if (inboxFilterTab !== "all") count += 1;
    if (searchDateFrom || searchDateTo) count += 1;
    return count;
  }, [
    inboxSearchQuery,
    selectedMailboxId,
    sortBy,
    inboxFilterTab,
    searchDateFrom,
    searchDateTo,
  ]);
  const hasActiveFilters = activeFilterCount > 0;
  const splitLayoutStyle = {
    "--email-detail-width": `${detailPanelWidth}px`,
    ...(isDesktopSplitLayout
      ? {
          gridTemplateColumns: `minmax(0, 1fr) 14px minmax(${EMAIL_DETAIL_PANEL_MIN_WIDTH}px, ${detailPanelWidth}px)`,
        }
      : {}),
  } as CSSProperties;

  useEffect(() => {
    setBrowserNotificationPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    setReplyStyleOverrides(
      normalizeEmailReplySettings(preferences?.email_reply_settings),
    );
  }, [preferences?.email_reply_settings]);

  useEffect(() => {
    setEmailHtmlRenderMode(
      normalizeEmailHtmlRenderMode(preferences?.default_email_html_render_mode),
    );
  }, [preferences?.default_email_html_render_mode]);

  // Publish the global unread-excluding-spam count to the macOS Dock badge from
  // the live inbox state so it updates instantly as the user reads/triages mail.
  // This is not gated on the current view, and we don't clear it on unmount —
  // the app shell keeps the badge in sync from the last loaded inbox snapshot
  // when the email view isn't mounted.
  useEffect(() => {
    publishDockBadgeCount(computeUnreadBadgeCount(inboxItems));
  }, [inboxItems]);

  // Claim ownership of the badge / document title for as long as this view is
  // mounted so the app-wide DockBadgeSync poller doesn't fight the effect above
  // for `document.title`. Releasing on unmount hands the poller back its job.
  useEffect(() => claimDockBadgeLiveSource(), []);

  useEffect(() => {
    if (!currentUserId) return;
    setEmailSignatures(loadEmailSignatures(currentUserId));
    setHideEmailSignatures(loadHideEmailSignaturesPreference(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    if (replyMode !== "reply_all") {
      setIsSignaturePickerOpen(false);
      return;
    }

    const defaultSignature = getDefaultEmailSignature(
      emailSignatures,
      selectedThread?.mailboxId || selectedThread?.mailbox_id || null,
    );
    setSelectedSignatureId(defaultSignature?.id || null);
    setSignatureSearchQuery(defaultSignature?.name || "");
  }, [emailSignatures, replyMode, selectedThreadId, selectedThread]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const syncSplitLayoutMode = (event?: MediaQueryListEvent) => {
      setIsDesktopSplitLayout(event ? event.matches : mediaQuery.matches);
    };

    syncSplitLayoutMode();
    mediaQuery.addEventListener("change", syncSplitLayoutMode);

    return () => {
      mediaQuery.removeEventListener("change", syncSplitLayoutMode);
    };
  }, []);

  // Reading-pane width is a PER-USER setting persisted on the profile so it
  // survives logout and navigation. `email_panel_default_width_pct` is the
  // initial width as a percentage of the container; `email_panel_width_px` is
  // the explicit pixel width once the user has dragged the resize handle.
  // Hydrate once the profile loads (or whenever the saved values change), but
  // never clobber an in-session drag the user is actively performing.
  const emailPanelDefaultWidthPct = clampEmailPanelWidthPercent(
    profile?.email_panel_default_width_pct ?? undefined,
  );
  const emailPanelWidthOverride = normalizeEmailPanelWidthOverride(
    profile?.email_panel_width_px,
  );

  useEffect(() => {
    if (typeof window === "undefined" || hasUserResizedPanelRef.current) {
      return;
    }

    const containerWidth = splitContainerRef.current?.clientWidth ?? 1120;
    const targetWidth =
      emailPanelWidthOverride ??
      emailPanelWidthPercentToPixels(
        emailPanelDefaultWidthPct,
        containerWidth,
      );

    setDetailPanelWidth(
      clampEmailDetailPanelWidth(
        targetWidth || computeDefaultEmailDetailPanelWidth(containerWidth),
        containerWidth,
      ),
    );
  }, [emailPanelDefaultWidthPct, emailPanelWidthOverride]);

  // Load the persisted per-page choice once on mount.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(
      EMAIL_INBOX_PER_PAGE_STORAGE_KEY,
    );
    if (stored) {
      setPerPage(clampEmailInboxPerPage(stored));
    }
  }, []);

  // Persist the per-page choice.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      EMAIL_INBOX_PER_PAGE_STORAGE_KEY,
      String(perPage),
    );
  }, [perPage]);

  // Keep the per-page input text in sync with the committed value (e.g. after
  // loading from storage or a clamp correction).
  useEffect(() => {
    setPerPageInput(String(perPage));
  }, [perPage]);

  // Reset to the first page whenever the filtered/searched/sorted set changes
  // (search query, filter tab, mailbox, sort order, per-page size, or view).
  useEffect(() => {
    setCurrentPage(1);
  }, [
    inboxSearchQuery,
    inboxFilterTab,
    selectedMailboxId,
    sortBy,
    perPage,
    view,
    searchDateFrom,
    searchDateTo,
  ]);

  // Keep the active page in range as items are removed (triage, refetch).
  useEffect(() => {
    setCurrentPage((current) => clampEmailInboxPage(current, pageCount));
  }, [pageCount]);

  const dispatchBrowserNotification = (item: InboxItem) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    if (window.Notification.permission !== "granted") {
      return false;
    }

    const alert = buildInboxBrowserNotificationContent(item);
    const notification = new window.Notification(alert.title, {
      body: alert.body,
      tag: `email-thread-${item.id}`,
    });

    notification.onclick = () => {
      window.focus();
      setSelectedMailboxId(item.mailboxId || "all");
      setSelectedThreadId(item.id);
      notification.close();
    };

    return true;
  };

  // Local optimistic override so the badge hides the instant the user clicks X,
  // even if the shared profile store is slow/stale to reflect the write (the
  // `profiles` table isn't in the realtime publication, so it won't push back).
  const [introBadgeLocallyDismissed, setIntroBadgeLocallyDismissed] =
    useState(false);
  const setInboxIntroDismissed = (dismissed: boolean) => {
    setIntroBadgeLocallyDismissed(dismissed);
    if (!updateProfile) {
      return;
    }
    void updateProfile({ email_inbox_intro_dismissed: dismissed });
  };

  const handleOpenThreadWindow = () => {
    if (!selectedThreadId || typeof window === "undefined") {
      return;
    }

    // Safari only opens a *separate* window (rather than a tab or reusing the
    // current page) when the features string includes explicit sizing. We also
    // build a real standalone thread URL (a popout query on the current path
    // that auto-opens the thread) and a unique per-thread window name so it is
    // never confused with the current document / reloaded.
    const targetUrl = buildEmailThreadPopoutUrl(
      window.location.href,
      selectedThreadId,
    );
    const features = [
      "popup=yes",
      "width=900",
      "height=1000",
      "menubar=no",
      "toolbar=no",
      "location=no",
      "status=no",
      "resizable=yes",
      "scrollbars=yes",
    ].join(",");

    const popout = window.open(
      targetUrl,
      `thread-${selectedThreadId}`,
      features,
    );

    // If the popup was blocked, fail gracefully rather than navigating away.
    if (!popout) {
      return;
    }

    popout.focus();
  };

  const focusInboxSearchInput = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const input = inboxSearchInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  const handleInsertInboxSearchHelp = (params: {
    prefix: string;
    tokenValue?: string;
  }) => {
    setInboxSearchQuery((current) =>
      buildEmailInboxSearchInsertion({
        currentQuery: current,
        prefix: params.prefix,
        tokenValue: params.tokenValue,
      }),
    );
    focusInboxSearchInput();
  };

  const handleCopyInboxSearchHelp = async (params: {
    prefix: string;
    example: string;
    tokenValue?: string;
  }) => {
    const text = getEmailInboxSearchHelpCopyText(params);

    try {
      await navigator.clipboard.writeText(text);
      setCopiedSearchHelpValue(text);
      if (copiedSearchHelpTimeoutRef.current !== null) {
        window.clearTimeout(copiedSearchHelpTimeoutRef.current);
      }
      copiedSearchHelpTimeoutRef.current = window.setTimeout(() => {
        setCopiedSearchHelpValue(null);
      }, 1200);
    } catch {
      updateStatus("Could not copy search syntax.");
    }
  };

  const handleSelectThread = (item: InboxItem) => {
    // Manual selection resumes normal auto-select behavior after a delete.
    suppressInboxAutoSelectRef.current = false;
    setSelectedThreadId(item.id);
    // Threads always open in the dedicated full-screen modal on every layout
    // (the inline reading pane has been removed).
    setIsThreadModalOpen(true);

    if (!item.isUnread) {
      return;
    }

    setInboxItems((current) =>
      applyOptimisticThreadReadState(current, item.id),
    );
    inboxSnapshotRef.current = applyOptimisticThreadReadState(
      inboxSnapshotRef.current,
      item.id,
    );

    setSelectedThread((current: any | null) =>
      current && current.id === item.id
        ? { ...current, isUnread: false }
        : current,
    );

    void fetch(`/api/email/threads/${item.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "mark_read" }),
    })
      .then(async (response) => {
        if (response.ok) {
          return;
        }

        const payload = await response
          .json()
          .catch(() => ({ error: "Failed to mark thread as read" }));
        throw new Error(payload.error || "Failed to mark thread as read");
      })
      .catch((error) => {
        updateStatus(
          error instanceof Error
            ? error.message
            : "Failed to mark thread as read",
        );
        void refreshInboxStateRef.current?.({ skipMailboxes: true });
      });
  };

  const handleSelectReplyDraft = (draft: EmailReplyDraft) => {
    setReplyQueueTab("reply_queue");
    setSelectedThreadId(draft.threadId);
    applyDraftToComposer(draft);
  };

  // Threads the user just actioned (delete/archive/spam) are suppressed from
  // reappearing until the server commits. Without this, a concurrent realtime
  // UPDATE (e.g. the async AI backfill writing a visible status) or a stale
  // inbox reconcile read — landing in the gap before the server finishes its
  // slow provider-side move (IMAP/Graph) and writes the new status — resurrects
  // the row, producing the "disappears, reappears, disappears" flicker the user
  // reported on delete. The suppression is status-aware and confirm-on-commit
  // (see lib/email-inbox/pending-removals): a pin persists across refetches
  // until the server returns the thread at its terminal status, so it can't
  // lapse mid-move the way the old fixed-duration tombstone did.
  const pendingRemovalsRef = useRef<PendingRemovals>(new Map());
  // Best-effort client-side action-log beacon (debug timeline for the
  // "deleted email reappears" race). Never awaited, never throws.
  const beaconEmailAction = (payload: {
    phase: "optimistic" | "realtime_event";
    action: string;
    threadId: string;
    detail?: Record<string, unknown>;
  }) => {
    try {
      void fetch("/api/email/action-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // ignore
    }
  };

  const markThreadRecentlyRemoved = (threadId: string, action: ThreadAction) => {
    markPendingRemoval(pendingRemovalsRef.current, threadId, action, Date.now());
  };
  const clearThreadRecentlyRemoved = (threadId: string) => {
    clearPendingRemoval(pendingRemovalsRef.current, threadId);
  };
  const isThreadRecentlyRemoved = (threadId: string) =>
    isPendingRemoval(pendingRemovalsRef.current, threadId, Date.now());

  const applyInboxSnapshot = (params: {
    nextMailboxes: Mailbox[];
    nextItems: InboxItem[];
    allowBrowserNotifications?: boolean;
    /** Monotonic id of the /api/email/inbox request this snapshot came from. */
    requestSeq?: number;
  }) => {
    // Settle window. The IMAP worker and the 60s poll write continuously, so a
    // snapshot that lands in the seconds after a click re-sorts the list, opens
    // new day-group headers and splices in fresh arrivals — all while the user
    // is still looking at the row they just acted on. In the reported recording
    // that produced four separate batches of rows shoving the list down over
    // 15s. Background snapshots are held briefly and the NEWEST one is applied
    // once the user stops interacting; the optimistic path still paints
    // immediately, so their own action is never delayed by this.
    const sinceInteraction = Date.now() - lastInteractionAtRef.current;
    if (sinceInteraction < INBOX_SETTLE_WINDOW_MS) {
      deferredSnapshotRef.current = params;
      if (settleTimerRef.current === null) {
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null;
          const deferred = deferredSnapshotRef.current;
          deferredSnapshotRef.current = null;
          if (deferred) applyInboxSnapshotRef.current?.(deferred);
        }, INBOX_SETTLE_WINDOW_MS - sinceInteraction);
      }
      return;
    }

    // Out-of-order guard. Deleting several emails in quick succession fires a
    // refresh per delete, so multiple /api/email/inbox reads are in flight at
    // once and can resolve in any order. A response issued BEFORE a later
    // delete still shows that thread as active; if it lands after the newer
    // response (which already reached the terminal "deleted" status and
    // therefore released the pending-removal pin), the stale rows are applied
    // wholesale and the just-deleted emails pop back into the list. Applying
    // only the newest issued read makes the last-writer the freshest one.
    if (
      params.requestSeq !== undefined &&
      !inboxSnapshotSequenceRef.current.shouldApply(params.requestSeq)
    ) {
      return;
    }

    // Reconcile just-actioned threads against this fresh read: rows the server
    // has now committed (or dropped) release their pin; rows still showing a
    // pre-commit status stay filtered out so a reconcile can't resurrect them.
    const nextItems = applyPendingRemovals(
      pendingRemovalsRef.current,
      params.nextItems,
      Date.now(),
    );

    // Drop the cached conversation for any thread that changed — a new message
    // landed, or its message count moved. That is the "only reload when the
    // IMAP check found something" half of the cache: unchanged threads reopen
    // instantly, changed ones refetch.
    {
      const previousById = new Map(
        inboxSnapshotRef.current.map((entry) => [entry.id, entry]),
      );
      for (const item of nextItems) {
        const previous = previousById.get(item.id);
        if (!previous) continue;
        if (
          previous.latestMessageAt !== item.latestMessageAt ||
          (previous.messageCount ?? 1) !== (item.messageCount ?? 1)
        ) {
          threadDetailCacheRef.current.delete(item.id);
        }
      }
    }

    if (
      params.allowBrowserNotifications &&
      browserNotificationPermission === "granted"
    ) {
      listNewInboxItemsForNotification({
        previousItems: inboxSnapshotRef.current,
        nextItems,
      }).forEach((item) => {
        dispatchBrowserNotification(item);
      });
    }

    // Explain any just-touched thread that the server moved out of the inbox on
    // its own (reprocessThread re-runs rules + AI on assign and can land on
    // quarantine/archived/resolved). The row is still allowed to leave — it no
    // longer belongs here — but it must not leave silently.
    const departures = listExplainedDepartures({
      previousItems: inboxSnapshotRef.current,
      nextItems,
      touchedAt: touchedThreadsRef.current,
      nowMs: Date.now(),
    });
    const departureMessage = describeDepartures(departures);
    if (departureMessage) {
      departures.forEach((departure) =>
        touchedThreadsRef.current.delete(departure.threadId),
      );
      updateStatus(departureMessage);
    }

    inboxSnapshotRef.current = nextItems;
    mailboxesRef.current = params.nextMailboxes;
    setMailboxes(params.nextMailboxes);
    setInboxItems(nextItems);
    setQuarantineCount(
      nextItems.filter((item) => item.status === "quarantine").length,
    );
  };

  applyInboxSnapshotRef.current = applyInboxSnapshot;

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    replyAttachmentsRef.current = replyAttachments;
  }, [replyAttachments]);

  useEffect(() => {
    return () => {
      if (queuedActionTimeoutRef.current !== null) {
        window.clearTimeout(queuedActionTimeoutRef.current);
      }
      if (erroredThreadTimerRef.current !== null) {
        window.clearTimeout(erroredThreadTimerRef.current);
      }
      if (copiedSearchHelpTimeoutRef.current !== null) {
        window.clearTimeout(copiedSearchHelpTimeoutRef.current);
      }
      replyAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    // Honor pending removals here too: a background email sync can push a fresh
    // data.inboxItems that pre-dates the server committing a just-actioned
    // thread (e.g. spam, whose provider move is awaited before the status
    // write). Without this filter that stale payload resurrects the row —
    // remove → reappears → disappears. applyPendingRemovals keeps the pinned id
    // hidden until the fresh row actually reaches its terminal status.
    const reconciled = applyPendingRemovals(
      pendingRemovalsRef.current,
      data.inboxItems,
      Date.now(),
    );
    inboxSnapshotRef.current = reconciled;
    mailboxesRef.current = data.mailboxes;
    setMailboxes(data.mailboxes);
    setInboxItems(reconciled);
    setQuarantineCount(
      reconciled.filter((item) => item.status === "quarantine").length,
    );
  }, [data.inboxItems, data.mailboxes]);

  useEffect(() => {
    if (!isEmailInboxView(view)) {
      return;
    }

    if (data.inboxItems.length > 0) {
      return;
    }

    void refreshInboxState().catch((error) => {
      updateStatus(
        error instanceof Error ? error.message : "Failed to load inbox",
      );
    });
  }, [data.inboxItems.length, view]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsFilterBarCollapsed(
      window.localStorage.getItem(EMAIL_INBOX_FILTER_BAR_STORAGE_KEY) === "1",
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setInboxGroupBy(
      normalizeInboxGroupBy(
        window.localStorage.getItem(INBOX_GROUP_BY_STORAGE_KEY),
      ),
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(INBOX_GROUP_BY_STORAGE_KEY, inboxGroupBy);
  }, [inboxGroupBy]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      EMAIL_INBOX_FILTER_BAR_STORAGE_KEY,
      isFilterBarCollapsed ? "1" : "0",
    );
  }, [isFilterBarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setShowSpamInInbox(
      window.localStorage.getItem(EMAIL_INBOX_SHOW_SPAM_STORAGE_KEY) === "true",
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      EMAIL_INBOX_SHOW_SPAM_STORAGE_KEY,
      showSpamInInbox ? "true" : "false",
    );
  }, [showSpamInInbox]);

  useEffect(() => {
    void refreshReplyDraftState().catch((error) => {
      updateStatus(
        error instanceof Error ? error.message : "Failed to load reply queue",
      );
    });
  }, []);

  useEffect(() => {
    setPendingConfirmAction(null);
    clearQueuedAction();
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setIsThreadModalOpen(false);
    }
  }, [selectedThreadId]);

  useEffect(() => {
    if (!isEmailInboxView(view)) return;
    if (visibleInboxItems.length === 0) {
      setSelectedThreadId(null);
      setSelectedThread(null);
      return;
    }
    // Don't auto-reopen a thread right after the user deleted the open one —
    // the panel should stay closed until they pick another email.
    if (suppressInboxAutoSelectRef.current) return;
    // Never auto-open an email on load/refresh — the reading pane opens only
    // when the user picks a row (or via the ?thread= deep-link below). If the
    // currently-selected thread scrolls out of the visible set, just clear it
    // rather than jumping to the newest email.
    if (
      selectedThreadId &&
      !visibleInboxItems.some((item) => item.id === selectedThreadId)
    ) {
      setSelectedThreadId(null);
      setSelectedThread(null);
    }
  }, [selectedThreadId, view, visibleInboxItems]);

  // Deep-link support: on first mount, open the thread named in the URL
  // (?thread=<id>) so a shared link lands directly on that email.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const threadParam = new URLSearchParams(window.location.search).get(
      "thread",
    );
    if (!threadParam) return;
    suppressInboxAutoSelectRef.current = false;
    setSelectedThreadId(threadParam);
    setIsThreadModalOpen(true);
    // Run once on mount only; later selection drives the URL (effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link support for the Drafts folder: ?composeDraft=<id> reopens that
  // outbound draft in the composer, fields and attachments intact, so saving
  // or sending updates the same row instead of creating a duplicate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const draftParam = new URLSearchParams(window.location.search).get(
      "composeDraft",
    );
    if (!draftParam) return;

    // The param is stripped only once the composer is actually open. A tab
    // that was loaded before a deploy can hit a stale-bundle ChunkLoadError
    // while the composer's chunk loads, and ChunkErrorReloader reloads the
    // page; stripping up front would drop the draft on that reload.
    const clearParam = () => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("composeDraft")) return;
      url.searchParams.delete("composeDraft");
      window.history.replaceState(window.history.state, "", url.toString());
    };

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/email/outbound-drafts", {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to load draft");
        const drafts = (await response.json()) as EmailOutboundDraft[];
        const draft = Array.isArray(drafts)
          ? drafts.find((entry) => entry.id === draftParam)
          : null;
        if (!draft || cancelled) return;
        clearParam();

        setOutboundComposerInitialDraft({
          draftId: draft.id,
          mailboxId: draft.mailboxId,
          projectId: draft.projectId ?? null,
          subject: draft.subject || "",
          body: draft.contentHtml || draft.contentText || "",
          to: formatComposerRecipients(draft.to),
          cc: formatComposerRecipients(draft.cc),
          bcc: formatComposerRecipients(draft.bcc),
          scheduledFor: toDateTimeLocalValue(draft.scheduledFor),
          existingAttachments: draft.attachments || [],
        });
        setIsOutboundComposerOpen(true);
      } catch {
        // A missing or unreadable draft just means no composer opens; the
        // Drafts list still shows the row — and the param is dropped so a
        // refresh doesn't retry forever.
        clearParam();
      }
    })();

    return () => {
      cancelled = true;
    };
    // Run once on mount; the param is cleared once the composer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the open thread so it can be referenced/shared.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isEmailInboxView(view)) return;
    const url = new URL(window.location.href);
    if (selectedThreadId) {
      url.searchParams.set("thread", selectedThreadId);
    } else {
      url.searchParams.delete("thread");
    }
    window.history.replaceState(window.history.state, "", url.toString());
  }, [selectedThreadId, view]);

  useEffect(() => {
    if (!selectedThreadId || !isEmailInboxView(view)) return;
    let cancelled = false;

    // Reopening a conversation renders from the last copy immediately and
    // revalidates behind it, instead of showing "Loading full conversation…"
    // again. Nothing is served stale for long: the fetch below still runs and
    // replaces the cached copy, and realtime/polling drops the entry when new
    // mail lands on the thread.
    const cached = threadDetailCacheRef.current.get(selectedThreadId);
    if (cached) {
      setSelectedThread(cached);
      setLoadingThread(false);
    } else {
      setLoadingThread(true);
    }

    fetch(`/api/email/threads/${selectedThreadId}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load thread");
        }
        if (!cancelled) {
          threadDetailCacheRef.current.set(selectedThreadId, payload);
          setSelectedThread(payload);
          if (payload?.activeReplyDraft) {
            applyDraftToComposer(payload.activeReplyDraft);
          } else {
            setSelectedReplyDraftId(null);
            setScheduledReplyAt("");
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          updateStatus(
            error instanceof Error ? error.message : "Failed to load thread",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedThreadId, view]);

  useEffect(() => {
    setIsProjectPickerOpen(false);
    setProjectSearchQuery("");
  }, [selectedThreadId]);

  useEffect(() => {
    closeInlineProjectPicker();
  }, [selectedThreadId, view]);

  useEffect(() => {
    setReplyContent("");
    setSelectedReplyDraftId(null);
    setScheduledReplyAt("");
    setReplyAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      return [];
    });
    setIsReplyDragActive(false);
  }, [selectedThreadId]);

  useEffect(() => {
    if (!isProjectPickerOpen) return;

    window.setTimeout(() => {
      projectSearchInputRef.current?.focus();
      projectSearchInputRef.current?.select();
    }, 0);

    const handlePointerDown = (event: MouseEvent) => {
      if (
        projectPickerRef.current &&
        !projectPickerRef.current.contains(event.target as Node)
      ) {
        setIsProjectPickerOpen(false);
        setProjectSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isProjectPickerOpen]);

  // Transient statuses ("Synced N messages…", minor failures) surface as
  // short-lived info alerts in the top-right alert center — the old
  // bottom-centre pill piled up with the other bottom-anchored toasts.
  const statusAlertSeqRef = useRef(0);
  const updateStatus = (message: string) => {
    upsertAlert({
      id: `email-status-${++statusAlertSeqRef.current}`,
      type: "info",
      title: message,
      duration: 3000,
    });
  };

  // Persistent intro hint ("Email threads are pre-processed …") rendered as a
  // fixed, bottom-center floating pill (out of document flow so it never causes
  // header layout shift), dismissable and remembered per-user.
  const introBadgeVisible =
    isDefaultInboxView &&
    !profile?.email_inbox_intro_dismissed &&
    !introBadgeLocallyDismissed;
  const introBadge = introBadgeVisible ? (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 inline-flex max-w-[92vw] items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-sm text-emerald-300 shadow-lg backdrop-blur">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
      <span className="min-w-0 truncate">
        Email threads are pre-processed and rendered as work items.
      </span>
      <button
        type="button"
        onClick={() => setInboxIntroDismissed(true)}
        aria-label="Dismiss"
        title="Dismiss"
        className="-mr-1 ml-0.5 shrink-0 rounded-md p-0.5 text-emerald-400/70 transition hover:bg-emerald-500/20 hover:text-emerald-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null;



  const applyInboxItemUpdate = (nextItem: InboxItem) => {
    setInboxItems((current) => {
      const updated = mergeInboxItem(current, nextItem);
      inboxSnapshotRef.current = updated;
      setQuarantineCount(
        updated.filter((item) => item.status === "quarantine").length,
      );
      return updated;
    });
  };

  const mailboxPreset = MAILBOX_PROVIDER_PRESETS[mailboxForm.provider];
  const mailboxPasswordError = getMailboxPasswordValidationError(
    mailboxForm.provider,
    mailboxForm.password,
  );

  const refreshInboxState = async (options?: {
    allowBrowserNotifications?: boolean;
    // Mailboxes change rarely, so high-frequency callers (realtime, polling,
    // post-action refreshes) pass skipMailboxes:true to fetch only the inbox and
    // reuse the already-loaded mailbox list — avoiding a redundant
    // /api/email/mailboxes request on every refresh. Initial load and
    // mailbox-changing actions leave this false to refresh both.
    skipMailboxes?: boolean;
  }) => {
    const requestSeq = inboxSnapshotSequenceRef.current.next();

    if (options?.skipMailboxes) {
      const inboxResponse = await fetch("/api/email/inbox", {
        credentials: "include",
      });
      const inboxPayload = await inboxResponse.json();

      if (!inboxResponse.ok) {
        throw new Error(inboxPayload.error || "Failed to load inbox");
      }

      applyInboxSnapshot({
        // Reuse the current mailbox list; we did not refetch it.
        nextMailboxes: mailboxesRef.current,
        nextItems: Array.isArray(inboxPayload) ? inboxPayload : [],
        allowBrowserNotifications: options?.allowBrowserNotifications,
        requestSeq,
      });
      return;
    }

    const [mailboxesResponse, inboxResponse] = await Promise.all([
      fetch("/api/email/mailboxes", {
        credentials: "include",
      }),
      fetch("/api/email/inbox", {
        credentials: "include",
      }),
    ]);

    const mailboxesPayload = await mailboxesResponse.json();
    const inboxPayload = await inboxResponse.json();

    if (!mailboxesResponse.ok) {
      throw new Error(mailboxesPayload.error || "Failed to load mailboxes");
    }
    if (!inboxResponse.ok) {
      throw new Error(inboxPayload.error || "Failed to load inbox");
    }

    applyInboxSnapshot({
      nextMailboxes: Array.isArray(mailboxesPayload) ? mailboxesPayload : [],
      nextItems: Array.isArray(inboxPayload) ? inboxPayload : [],
      allowBrowserNotifications: options?.allowBrowserNotifications,
      requestSeq,
    });
  };

  // Fetch a single thread and merge it into the inbox list. Used as the
  // realtime fallback for INSERTs (and UPDATEs to threads not yet in the list),
  // where the email_threads row alone lacks participants/task count needed to
  // render the row. Returns whether the item was newly added.
  const hydrateThreadIntoInbox = async (
    threadId: string,
    options?: { allowBrowserNotifications?: boolean },
  ): Promise<boolean> => {
    const response = await fetch(`/api/email/threads/${threadId}`, {
      credentials: "include",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.id) {
      throw new Error(payload?.error || "Failed to hydrate thread");
    }

    // The detail endpoint returns a superset of InboxItem; drop the detail-only
    // fields that aren't part of the list item shape.
    const { linkedTasks: _linkedTasks, activeReplyDraft: _activeReplyDraft, ...item } =
      payload as InboxItem & {
        linkedTasks?: unknown;
        activeReplyDraft?: unknown;
      };

    let wasAdded = false;
    setInboxItems((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === item.id);
      // Defense-in-depth against the "deleted email reappears" race: never add a
      // soft-deleted thread that isn't already in local state. The realtime patch
      // layer already refuses to request a hydrate for a deleted row, but a
      // direct hydrate could still race a concurrent delete (fetch started while
      // the thread was live, resolved after it was deleted). Patch it in place if
      // we already track it (so Trash stays correct), but don't resurrect it.
      if (
        existingIndex === -1 &&
        (item as InboxItem).status === "deleted"
      ) {
        return current;
      }
      let next: InboxItem[];
      if (existingIndex === -1) {
        wasAdded = true;
        next = [...current, item as InboxItem];
      } else {
        next = [...current];
        next[existingIndex] = { ...next[existingIndex], ...(item as InboxItem) };
      }
      inboxSnapshotRef.current = next;
      setQuarantineCount(
        next.filter((entry) => entry.status === "quarantine").length,
      );
      return next;
    });

    if (
      wasAdded &&
      options?.allowBrowserNotifications &&
      (item as InboxItem).isUnread &&
      (item as InboxItem).origin !== "outbound"
    ) {
      dispatchBrowserNotification(item as InboxItem);
    }

    return wasAdded;
  };

  // Patch local inbox state from a single Realtime change instead of refetching
  // the whole inbox. UPDATEs to a known thread patch that row in place; INSERTs
  // (and UPDATEs to unknown threads) hydrate the single thread; a too-incomplete
  // payload falls back to a full refresh. The low-frequency poll below remains
  // as a safety net so any missed patch self-heals.
  const handleRealtimeChange = (change: EmailThreadRealtimeChange) => {
    // Ignore events for a thread the user just deleted — a late UPDATE (e.g. AI
    // backfill writing a visible status) must not resurrect it into the list.
    const changedThreadId =
      (typeof change.new?.id === "string" && change.new.id) ||
      (typeof change.old?.id === "string" && change.old.id) ||
      null;
    // The stored thread-detail payload is now behind this row change (new
    // message / row update) — the next modal open must revalidate.
    if (changedThreadId) {
      invalidateCachedThreadDetail(changedThreadId);
    }
    if (changedThreadId && isThreadRecentlyRemoved(changedThreadId)) {
      beaconEmailAction({
        phase: "realtime_event",
        action: "suppressed_by_pending_removal",
        threadId: changedThreadId,
        detail: {
          eventType: change.eventType,
          newStatus:
            (change.new?.status as string | undefined) ?? null,
        },
      });
      return;
    }

    // A realtime event whose row is already soft-deleted is exactly the
    // resurrection vector we guard against — record it so the timeline shows
    // when the server/AI backfill touched a deleted thread.
    if (
      changedThreadId &&
      typeof change.new?.status === "string" &&
      change.new.status === "deleted"
    ) {
      beaconEmailAction({
        phase: "realtime_event",
        action: "deleted_row_event",
        threadId: changedThreadId,
        detail: { eventType: change.eventType },
      });
    }

    const result = applyEmailThreadRealtimeChange({
      items: inboxSnapshotRef.current,
      change,
    });

    if (result.changed) {
      inboxSnapshotRef.current = result.items;
      setInboxItems(result.items);
      setQuarantineCount(
        result.items.filter((item) => item.status === "quarantine").length,
      );
    }

    if (result.hydrateThreadId) {
      void hydrateThreadIntoInbox(result.hydrateThreadId, {
        allowBrowserNotifications: true,
      }).catch(() => {
        // Targeted hydrate failed — reconcile the whole inbox as a last resort.
        void refreshInboxStateRef.current?.({
          allowBrowserNotifications: true,
          skipMailboxes: true,
        });
      });
      return;
    }

    if (result.needsFullRefresh) {
      void refreshInboxStateRef.current?.({
        allowBrowserNotifications: true,
        skipMailboxes: true,
      });
    }
  };

  const refreshReplyDraftState = async () => {
    const response = await fetch("/api/email/reply-drafts", {
      credentials: "include",
    });
    const payload = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(payload.error || "Failed to load reply queue");
    }

    setReplyDrafts(Array.isArray(payload) ? payload : []);
  };

  const handleOutboundComposerSent = async (result: {
    mailboxId: string;
    threadId?: string | null;
  }) => {
    await refreshInboxState({ skipMailboxes: true });
    await onRefresh?.();

    if (typeof window !== "undefined") {
      const url = new URL("/email-sent", window.location.origin);
      url.searchParams.set("selectedMailbox", result.mailboxId || "all");
      if (result.threadId) {
        url.searchParams.set("threadId", result.threadId);
      }
      window.location.assign(url.toString());
    }
  };

  const handleOutboundComposerScheduled = async () => {
    await refreshInboxState({ skipMailboxes: true });
    await onRefresh?.();
    updateStatus("Email scheduled.");
  };

  const handleOutboundComposerDraftSaved = async () => {
    await refreshInboxState({ skipMailboxes: true });
    await onRefresh?.();
    updateStatus("Saved to Drafts.");
  };

  const applyDraftToComposer = (draft: EmailReplyDraft | null) => {
    if (!draft) {
      return;
    }

    setSelectedReplyDraftId(draft.id);
    setReplyMode(draft.replyMode);
    setReplyContent(draft.contentHtml || draft.contentText || "");
    setScheduledReplyAt(
      draft.scheduledFor
        ? new Date(draft.scheduledFor).toISOString().slice(0, 16)
        : "",
    );
    setReplyAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });

      return (draft.attachments || []) as ComposerAttachment[];
    });
  };

  const syncDueMailboxes = async (targetMailboxes: Mailbox[]) => {
    const now = Date.now();
    const dueMailboxes = targetMailboxes.filter((mailbox) => {
      if (!mailbox.autoSyncEnabled) return false;

      const lastSyncedAt = mailbox.lastSyncedAt
        ? new Date(mailbox.lastSyncedAt).getTime()
        : 0;
      // Cap the client-side due check at the same 60s floor the server enforces
      // (see syncDueMailboxesForUser BACKGROUND_SYNC_FLOOR_MS). Otherwise this
      // pre-filter refuses to POST /sync-due until the full syncFrequencyMinutes
      // (default 5 min) has elapsed, which is the only thing that reconciles
      // Gmail read/unread flag changes for existing messages — making
      // "mark as read" in Gmail take up to ~5 min to reflect in the inbox.
      const dueAfterMs = Math.min(
        mailbox.syncFrequencyMinutes * 60 * 1000,
        60 * 1000,
      );
      return now - lastSyncedAt >= dueAfterMs;
    });

    if (dueMailboxes.length === 0) {
      return {
        syncedMailboxCount: 0,
        changedThreadCount: 0,
      };
    }

    const response = await fetch("/api/email/mailboxes/sync-due", {
      method: "POST",
      credentials: "include",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || "Failed to sync due mailboxes");
    }

    return {
      syncedMailboxCount: Number(payload?.syncedMailboxCount || 0),
      changedThreadCount: Number(payload?.changedThreadCount || 0),
    };
  };

  refreshInboxStateRef.current = refreshInboxState;

  // Near real-time inbox updates: subscribe to Supabase Realtime postgres_changes
  // on public.email_threads for the signed-in user. When the in-process IMAP IDLE
  // worker writes new rows, this debounces and refetches the inbox. Gated on the
  // inbox view being active; falls back to the poll below when not connected.
  const { connected: isRealtimeConnected } = useEmailRealtime({
    userId: currentUserId,
    enabled: isEmailInboxView(view),
    onChange: handleRealtimeChange,
  });

  useEffect(() => {
    if (!isEmailInboxView(view)) return;

    void (async () => {
      try {
        const result = await syncDueMailboxes(mailboxesRef.current);
        if (result.syncedMailboxCount > 0 || result.changedThreadCount > 0) {
          await refreshInboxStateRef.current?.({
            allowBrowserNotifications: true,
            skipMailboxes: true,
          });
        }
      } catch {
        // Keep automatic refresh silent while the user is working in the inbox.
      }
    })();

    const pollIntervalMs = isRealtimeConnected
      ? REALTIME_CONNECTED_POLL_INTERVAL_MS
      : BROWSER_NOTIFICATION_POLL_INTERVAL_MS;

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const result = await syncDueMailboxes(mailboxesRef.current);
          if (result.syncedMailboxCount > 0 || result.changedThreadCount > 0) {
            await refreshInboxStateRef.current?.({
              allowBrowserNotifications: true,
              // Mailboxes change rarely; the interval branch was the only
              // high-frequency caller still refetching /api/email/mailboxes.
              skipMailboxes: true,
            });
          }
        } catch {
          // Keep polling silent while the user is working in the inbox.
        }
      })();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [view, isRealtimeConnected]);

  const openMailboxCreateForm = () => {
    setEditingMailboxId(null);
    setMailboxForm(createEmptyMailboxForm());
    setShowMailboxForm(true);
  };

  const openMailboxEditForm = (mailbox: Mailbox) => {
    setEditingMailboxId(mailbox.id);
    setMailboxForm(createMailboxFormFromMailbox(mailbox));
    setShowMailboxForm(true);
  };

  const closeMailboxForm = () => {
    setShowMailboxForm(false);
    setEditingMailboxId(null);
    setMailboxForm(createEmptyMailboxForm());
  };

  const handleMailboxFormToggle = () => {
    if (showMailboxForm) {
      closeMailboxForm();
      return;
    }

    if (selectedMailbox) {
      openMailboxEditForm(selectedMailbox);
      return;
    }

    openMailboxCreateForm();
  };

  const handleSync = async () => {
    if (busyState || mailboxes.length === 0) return;
    setBusyState("sync");
    try {
      const mailboxesToSync =
        selectedMailboxId === "all"
          ? mailboxes
          : mailboxes.filter((mailbox) => mailbox.id === selectedMailboxId);

      if (mailboxesToSync.length === 0) {
        throw new Error("Choose a mailbox before syncing.");
      }

      const results = await Promise.all(
        mailboxesToSync.map(async (mailbox) => {
          const response = await fetch(
            `/api/email/mailboxes/${mailbox.id}/sync`,
            {
              method: "POST",
              credentials: "include",
            },
          );
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || `Failed to sync ${mailbox.name}`);
          }
          return {
            mailbox,
            syncedMessageCount: Number(payload.syncedMessageCount || 0),
          };
        }),
      );

      await refreshInboxState({ allowBrowserNotifications: true });

      const totalMessages = results.reduce(
        (sum, result) => sum + result.syncedMessageCount,
        0,
      );
      updateStatus(
        mailboxesToSync.length === 1
          ? `Synced ${totalMessages} messages from ${mailboxesToSync[0].name}.`
          : `Synced ${totalMessages} messages across ${mailboxesToSync.length} mailboxes.`,
      );
    } catch (error) {
      try {
        await refreshInboxState();
      } catch {
        // Keep the primary sync error visible when lightweight refresh also fails.
      }
      updateStatus(
        error instanceof Error ? error.message : "Failed to sync mailbox",
      );
    } finally {
      setBusyState(null);
    }
  };

  const syncMailboxAfterCreate = async (
    mailboxId: string,
    mailboxName: string,
  ) => {
    const response = await fetch(`/api/email/mailboxes/${mailboxId}/sync`, {
      method: "POST",
      credentials: "include",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Failed to sync ${mailboxName}`);
    }
    return Number(payload.syncedMessageCount || 0);
  };

  const handleMailboxCreate = async () => {
    if (mailboxPasswordError) {
      updateStatus(mailboxPasswordError);
      return;
    }

    setBusyState("mailbox");
    const wasEditingMailbox = isEditingMailbox;
    let createdMailboxId: string | null = null;
    const normalizedPassword = normalizeMailboxPassword(
      mailboxForm.provider,
      mailboxForm.password,
    );
    try {
      const response = await fetch("/api/email/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: mailboxForm.provider,
          name: mailboxForm.name,
          displayName: mailboxForm.displayName || null,
          emailAddress: mailboxForm.emailAddress,
          loginUsername: mailboxForm.loginUsername || mailboxForm.emailAddress,
          password: normalizedPassword,
          imapHost: mailboxForm.imapHost,
          imapPort: Number(mailboxForm.imapPort || 993),
          smtpHost: mailboxForm.smtpHost,
          smtpPort: Number(mailboxForm.smtpPort || 465),
          syncFolder: mailboxForm.syncFolder || "INBOX",
          isShared: mailboxForm.isShared,
          organizationId:
            mailboxForm.organizationId !== "none"
              ? mailboxForm.organizationId
              : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create mailbox");
      }

      createdMailboxId = payload.id;
      setSelectedMailboxId(payload.id);
      closeMailboxForm();
      setMailboxes((prev) => {
        const remaining = prev.filter((mailbox) => mailbox.id !== payload.id);
        return [...remaining, payload];
      });

      const syncedMessageCount = await syncMailboxAfterCreate(
        payload.id,
        payload.name,
      );

      await refreshInboxState();
      updateStatus(
        wasEditingMailbox
          ? `Mailbox ${payload.name} updated and synced ${syncedMessageCount} messages.`
          : `Mailbox ${payload.name} connected and synced ${syncedMessageCount} messages.`,
      );
    } catch (error) {
      if (createdMailboxId) {
        try {
          await refreshInboxState();
        } catch {
          // Keep the mailbox update error visible when lightweight refresh fails.
        }
      }
      updateStatus(
        error instanceof Error ? error.message : "Failed to create mailbox",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleEmptyTrashPermanently = async () => {
    setBusyState("empty_trash");
    const mailboxId = selectedMailboxId === "all" ? null : selectedMailboxId;
    const previousItems = inboxSnapshotRef.current;

    try {
      const response = await fetch("/api/email/trash/empty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mailboxId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to empty trash");
      }

      const nextItems = previousItems.filter((item) => {
        if (item.status !== "deleted") {
          return true;
        }

        if (mailboxId && item.mailboxId !== mailboxId) {
          return true;
        }

        return false;
      });

      applyInboxSnapshot({
        nextMailboxes: mailboxesRef.current,
        nextItems,
        allowBrowserNotifications: false,
      });

      if (
        selectedThread?.status === "deleted" &&
        (!mailboxId || selectedThread.mailboxId === mailboxId)
      ) {
        setSelectedThread(null);
      }

      setIsEmptyTrashConfirmVisible(false);
      void refreshInboxState({ skipMailboxes: true }).catch(() => {
        // Keep the optimistic purge visible when the follow-up refresh fails.
      });
      updateStatus(
        payload.deletedThreadCount > 0
          ? `Permanently deleted ${payload.deletedThreadCount} trash thread${payload.deletedThreadCount === 1 ? "" : "s"}.`
          : "Trash is already empty.",
      );
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to empty trash",
      );
    } finally {
      setBusyState(null);
    }
  };

  // Delete path with the optimistic strike-through → slide-off animation.
  // 1) close the open detail panel immediately, 2) strike + spinner the row
  // while the request is in flight, 3) on success slide the row off to the
  // right (remaining rows shift up) before dropping it from state, 4) on
  // failure revert the optimistic state and surface the error.
  // Publish a deletion's current state ("Deleting…" / "Deleted …" / failure
  // with Retry / Report / Show-the-email actions) into the alert center.
  // Upserting under the stable pendingId keeps one card per delete whose state
  // flips in place; success cards auto-dismiss after 3s.
  const publishDeletionAlert = (
    entry: PendingDeletion,
    options?: { reporting?: boolean; undoSeconds?: number },
  ) => {
    const detail =
      entry.status === "failed" ? describeDeletionError(entry.error) : null;
    upsertAlert({
      id: entry.id,
      type:
        entry.status === "failed"
          ? "error"
          : entry.status === "succeeded"
            ? "success"
            : "progress",
      title: describeDeletionHeadline(entry),
      message:
        detail?.summary ??
        (options?.undoSeconds
          ? `Undo within ${formatEmailDeleteUndoDuration(options.undoSeconds)}.`
          : undefined),
      hint: detail?.hint,
      duration: entry.status === "succeeded" ? 3000 : 0,
      actions:
        entry.status === "deleting" && options?.undoSeconds
          ? [
              {
                id: "undo",
                label: "Undo",
                onClick: () => handleUndoPendingDeletion(entry.id),
              },
            ]
          : entry.status === "failed"
          ? [
              {
                id: "locate",
                label: "Show the email",
                variant: "link" as const,
                onClick: () => handleLocateFailedDeletion(entry),
              },
              {
                id: "retry",
                label: "Retry",
                onClick: () => handleRetryPendingDeletion(entry),
              },
              {
                id: "report",
                label: options?.reporting ? "Reporting…" : "Report bug",
                disabled: Boolean(options?.reporting),
                onClick: () => void handleReportDeletionBug(entry),
              },
            ]
          : undefined,
    });
  };

  const handleReportDeletionBug = async (entry: PendingDeletion) => {
    publishDeletionAlert(entry, { reporting: true });
    try {
      const response = await fetch("/api/email/report-bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          error: entry.error || "Email delete failed",
          threadId: entry.threadId,
          action: entry.action,
          context: `Email deletion failed for "${entry.subject}" from ${entry.sender}`,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to send bug report");
      }
      updateStatus("Bug report sent to the developer.");
    } catch (error) {
      updateStatus(
        error instanceof Error
          ? `Couldn't send bug report: ${error.message}`
          : "Couldn't send bug report.",
      );
    } finally {
      publishDeletionAlert(entry, { reporting: false });
    }
  };

  /**
   * Open undo windows, keyed by the deletion's pendingId. A row deleted from
   * the inbox disappears optimistically but the server call is held for the
   * user's undo window (profile `email_delete_undo_seconds`, default 60s) —
   * clicking Undo in the alert resolves the waiter and nothing is ever sent.
   */
  const undoWindowsRef = useRef<
    Map<string, { timer: number; resolve: (undone: boolean) => void }>
  >(new Map());

  const waitOutUndoWindow = (pendingId: string, seconds: number) =>
    new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        undoWindowsRef.current.delete(pendingId);
        resolve(false);
      }, seconds * 1000);
      undoWindowsRef.current.set(pendingId, { timer, resolve });
    });

  /** Undo clicked: cancel the pending send so the delete never happens. */
  const handleUndoPendingDeletion = (pendingId: string) => {
    const open = undoWindowsRef.current.get(pendingId);
    if (!open) return;
    window.clearTimeout(open.timer);
    undoWindowsRef.current.delete(pendingId);
    open.resolve(true);
  };

  useEffect(() => {
    const windows = undoWindowsRef.current;
    return () => {
      windows.forEach(({ timer }) => window.clearTimeout(timer));
      windows.clear();
    };
  }, []);

  const handleDeleteThreadWithAnimation = async (
    action: ThreadAction,
    threadId: string,
    shouldUpdateSelectedThread: boolean,
  ) => {
    const previousSelectedThreadId = selectedThreadId;
    const previousSelectedThread = selectedThread;
    const wasThreadModalOpen = isThreadModalOpen;

    // Capture the row's identity for the deletion tray BEFORE it leaves the
    // list (sender + subject), so the tray can describe what's being deleted.
    const targetItem = inboxSnapshotRef.current.find(
      (item) => item.id === threadId,
    );
    const sender = targetItem
      ? formatParticipantName(
          getPrimarySenderParticipant(targetItem.participants, [
            targetItem.mailboxEmailAddress,
          ]),
        )
      : "Unknown sender";
    const subject = targetItem
      ? formatEmailSubject(targetItem.subject) || "(no subject)"
      : "(no subject)";
    const pendingId = `${threadId}:${action}`;

    // 1. Immediately collapse the reading/detail panel for this thread and
    //    keep it closed (suppress the auto-select-first effect).
    if (selectedThreadId === threadId) {
      suppressInboxAutoSelectRef.current = true;
      setSelectedThreadId(null);
      setSelectedThread(null);
      setIsThreadModalOpen(false);
    }

    // 2. INSTANT removal — apply the optimistic "deleted" state right away so
    //    the email disappears from the list immediately (no lingering spinner).
    //    Suppress it from realtime/reconcile resurrection during the commit gap.
    markThreadRecentlyRemoved(threadId, action);
    beaconEmailAction({ phase: "optimistic", action, threadId });
    const beforeItems = inboxSnapshotRef.current;
    const optimisticItems = applyOptimisticThreadActionState(
      beforeItems,
      threadId,
      action,
    );
    if (optimisticItems !== beforeItems) {
      inboxSnapshotRef.current = optimisticItems;
      setInboxItems(optimisticItems);
      setQuarantineCount(
        optimisticItems.filter((item) => item.status === "quarantine").length,
      );
    }

    // 3. Announce the in-flight delete in the alert center ("Deleting
    //    {Subject} from {Who}", in the order the user triggered them).
    const pendingEntry: PendingDeletion = {
      id: pendingId,
      threadId,
      action,
      sender,
      subject,
      status: "deleting",
    };
    // A delete is held for the user's undo window before anything is sent, so
    // the alert card carries an Undo button. Other actions commit immediately.
    const undoSeconds = action === "delete" ? deleteUndoSeconds : 0;
    publishDeletionAlert(pendingEntry, {
      undoSeconds: undoSeconds > 0 ? undoSeconds : undefined,
    });
    setBusyState(action);

    if (undoSeconds > 0) {
      const undone = await waitOutUndoWindow(pendingId, undoSeconds);
      if (undone) {
        // Nothing was ever sent: put the row back and drop the alert.
        clearThreadRecentlyRemoved(threadId);
        if (targetItem) {
          setInboxItems((current) => {
            if (current.some((item) => item.id === threadId)) return current;
            const restored = [...current, targetItem];
            inboxSnapshotRef.current = restored;
            return restored;
          });
        }
        void refreshInboxState({ skipMailboxes: true }).catch(() => {});
        dismissAlert(pendingId);
        updateStatus("Delete canceled.");
        setBusyState(null);
        return;
      }
      // Window elapsed — the card loses its Undo button while the send runs.
      publishDeletionAlert(pendingEntry);
    }

    try {
      const response = await fetch(`/api/email/threads/${threadId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to apply thread action");
      }

      // 4. Success → flip the alert card to its green "Deleted …" state; it
      //    auto-dismisses after 3s with the slide-out animation.
      publishDeletionAlert({ ...pendingEntry, status: "succeeded" });

      void refreshInboxState({ skipMailboxes: true }).catch(() => {
        // Keep the optimistic removal instead of blocking on a slow refresh.
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to apply action";

      // 5. Failure → keep the email visible (don't silently lose it): restore
      //    the row into the list and flip the tray entry to a "failed" state
      //    with retry / report-bug affordances. Clear the suppression first so
      //    the reconcile/restore can actually bring the row back.
      clearThreadRecentlyRemoved(threadId);
      if (targetItem) {
        setInboxItems((current) => {
          if (current.some((item) => item.id === threadId)) {
            return current;
          }
          const restored = [...current, targetItem];
          inboxSnapshotRef.current = restored;
          return restored;
        });
      }
      // Reconcile ordering/state from the server (the thread still exists).
      void refreshInboxState({ skipMailboxes: true }).catch(() => {});

      publishDeletionAlert({ ...pendingEntry, status: "failed", error: message });

      if (
        shouldUpdateSelectedThread &&
        previousSelectedThread &&
        previousSelectedThreadId === threadId
      ) {
        suppressInboxAutoSelectRef.current = false;
        setSelectedThreadId(previousSelectedThreadId);
        setSelectedThread(previousSelectedThread);
        setIsThreadModalOpen(wasThreadModalOpen);
      }
    } finally {
      setBusyState(null);
    }
  };

  // "Show the email" on a failed-delete alert: scroll the row that stayed put
  // into view and blink it red so the user can find it in a long list.
  const handleLocateFailedDeletion = (entry: PendingDeletion) => {
    setErroredThreadId(entry.threadId);
    if (erroredThreadTimerRef.current !== null) {
      window.clearTimeout(erroredThreadTimerRef.current);
    }
    // Matches the 2.2s .email-row-blink-error run, then clears so the same row
    // can be flashed again on a later failure.
    erroredThreadTimerRef.current = window.setTimeout(() => {
      setErroredThreadId(null);
      erroredThreadTimerRef.current = null;
    }, 2400);

    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-email-thread-id="${entry.threadId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleRetryPendingDeletion = (entry: PendingDeletion) => {
    dismissAlert(entry.id);
    void handleDeleteThreadWithAnimation(
      entry.action as ThreadAction,
      entry.threadId,
      false,
    );
  };

  const handleThreadAction = async (
    action: ThreadAction,
    options?: {
      threadId?: string | null;
      updateSelectedThread?: boolean;
      snoozedUntil?: string;
      boomerangUntil?: string;
      boomerangTaskId?: string;
      skipQuarantinePrompt?: boolean;
    },
  ) => {
    const threadId = options?.threadId ?? selectedThreadId;
    if (!threadId) return;

    // Any deliberate action starts the settle window, so a background snapshot
    // can't re-sort the list out from under the user mid-triage.
    lastInteractionAtRef.current = Date.now();

    // Quarantine opens a rules-review modal first (shows the rules applied and
    // offers a quarantine rule); the modal re-invokes with skipQuarantinePrompt.
    if (action === "quarantine" && !options?.skipQuarantinePrompt) {
      const target =
        inboxSnapshotRef.current.find((it) => it.id === threadId) ?? null;
      if (target) {
        setQuarantineModalItem(target);
        return;
      }
    }

    const shouldUpdateSelectedThread = options?.updateSelectedThread ?? true;

    // Boomerang optimistically hides the row (the client filter drops any item
    // with a future boomerangUntil or a boomerangTaskId) so it leaves the inbox
    // the instant it's clicked; the server persists and keeps it out on refetch.
    if (
      action === "boomerang" &&
      (options?.boomerangUntil || options?.boomerangTaskId)
    ) {
      setInboxItems((prev) =>
        prev.map((it) =>
          it.id === threadId
            ? {
                ...it,
                boomerangUntil: options?.boomerangUntil ?? null,
                boomerangTaskId: options?.boomerangTaskId ?? null,
              }
            : it,
        ),
      );
      if (shouldUpdateSelectedThread) {
        setSelectedThreadId(null);
        setSelectedThread(null);
      }
    }

    if (action === "delete" || action === "always_delete_sender") {
      await handleDeleteThreadWithAnimation(
        action,
        threadId,
        shouldUpdateSelectedThread,
      );
      return;
    }

    const previousItems = inboxSnapshotRef.current;
    const previousSelectedThread = selectedThread;
    const optimisticItems = applyOptimisticThreadActionState(
      previousItems,
      threadId,
      action,
    );
    const changedOptimistically = optimisticItems !== previousItems;

    if (changedOptimistically) {
      inboxSnapshotRef.current = optimisticItems;
      setInboxItems(optimisticItems);
      setQuarantineCount(
        optimisticItems.filter((item) => item.status === "quarantine").length,
      );
      // archive/spam do the same slow provider-side move as delete, so a
      // pre-commit refetch could otherwise reset the row to "active" and flash
      // it back into the inbox. Pin it (no-op for non-lagging actions) until the
      // server confirms the terminal status.
      markThreadRecentlyRemoved(threadId, action);
    }

    if (
      shouldUpdateSelectedThread &&
      previousSelectedThread &&
      previousSelectedThread.id === threadId
    ) {
      setSelectedThread((current: any | null) => {
        if (!current || current.id !== threadId) {
          return current;
        }

        const [nextThread] = applyOptimisticThreadActionState(
          [current as InboxItem],
          threadId,
          action,
        );

        return nextThread ?? current;
      });
    }

    // Spam: surface a loading alert docked to the bell with an Undo affordance
    // while the action commits. The row already vanished (optimistic spam
    // status); Undo restores it via "approve" (= not spam).
    const spamAlertId = `spam:${threadId}`;
    const undoSpam = () => {
      dismissAlert(spamAlertId);
      clearThreadRecentlyRemoved(threadId);
      void handleThreadAction("approve", {
        threadId,
        updateSelectedThread: false,
      });
    };
    if (action === "spam") {
      const spamTargetItem =
        previousItems.find((it) => it.id === threadId) ?? null;
      const spamSender = spamTargetItem
        ? formatParticipantName(
            getPrimarySenderParticipant(spamTargetItem.participants, [
              spamTargetItem.mailboxEmailAddress,
            ]),
          )
        : null;
      upsertAlert({
        id: spamAlertId,
        type: "progress",
        title: "Marking as spam…",
        message: spamSender ? `From ${spamSender}` : undefined,
        duration: 0,
        actions: [
          { id: "undo", label: "Undo", variant: "button", onClick: undoSpam },
        ],
      });
    }

    setBusyState(action);
    try {
      const response = await fetch(`/api/email/threads/${threadId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action,
          snoozedUntil: options?.snoozedUntil,
          boomerangUntil: options?.boomerangUntil,
          boomerangTaskId: options?.boomerangTaskId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to apply thread action");
      }
      if (action === "mark_read" && shouldUpdateSelectedThread) {
        const detailResponse = await fetch(`/api/email/threads/${threadId}`, {
          credentials: "include",
        });
        const detailPayload = await detailResponse.json();

        if (!detailResponse.ok) {
          throw new Error(detailPayload.error || "Failed to load thread");
        }

        setSelectedThread(detailPayload);
      } else if (shouldUpdateSelectedThread) {
        setSelectedThread((current: any | null) =>
          payload?.id ? payload : current,
        );
      }

      void refreshInboxState({ skipMailboxes: true }).catch(() => {
        // Keep the optimistic state instead of blocking the UI on a slow refresh.
      });

      if (action === "spam") {
        // Commit landed — flip the bell alert to a confirmed state that keeps
        // Undo available for a short window before auto-dismissing.
        upsertAlert({
          id: spamAlertId,
          type: "success",
          title: "Marked as spam",
          duration: 5000,
          actions: [
            { id: "undo", label: "Undo", variant: "button", onClick: undoSpam },
          ],
        });
      }

      updateStatus(`Applied ${action.replace(/_/g, " ")}.`);
    } catch (error) {
      if (action === "spam") {
        const message =
          error instanceof Error ? error.message : "Failed to mark as spam";
        upsertAlert({
          id: spamAlertId,
          type: "error",
          title: "Couldn't mark as spam",
          message,
          duration: 0,
        });
      }
      if (changedOptimistically) {
        // Drop the pin first so the reverted (active) row isn't re-suppressed.
        clearThreadRecentlyRemoved(threadId);
        inboxSnapshotRef.current = previousItems;
        setInboxItems(previousItems);
        setQuarantineCount(
          previousItems.filter((item) => item.status === "quarantine").length,
        );
      }

      if (
        shouldUpdateSelectedThread &&
        previousSelectedThread &&
        previousSelectedThread.id === threadId
      ) {
        setSelectedThread(previousSelectedThread);
      }

      updateStatus(
        error instanceof Error ? error.message : "Failed to apply action",
      );
    } finally {
      setBusyState(null);
    }
  };

  // Unsubscribe: a one-click flow that (1) visits the sender's unsubscribe
  // link, (2) replies "unsubscribe", and (3) deletes the thread — each step
  // publishing its own bell alert. The row is removed optimistically the instant
  // it's clicked and only restored if the delete step fails.
  const handleUnsubscribe = async (threadIdArg?: string | null) => {
    const threadId = threadIdArg ?? selectedThreadId;
    if (!threadId) return;

    const previousItems = inboxSnapshotRef.current;
    const targetItem = previousItems.find((it) => it.id === threadId) ?? null;
    const sender = targetItem
      ? formatParticipantName(
          getPrimarySenderParticipant(targetItem.participants, [
            targetItem.mailboxEmailAddress,
          ]),
        )
      : null;
    const from = sender ? `From ${sender}` : undefined;

    // Optimistically remove the row (pin so a mid-flight refetch can't flash it
    // back) and clear the open thread if it's the target.
    const optimisticItems = previousItems.filter((it) => it.id !== threadId);
    inboxSnapshotRef.current = optimisticItems;
    setInboxItems(optimisticItems);
    markThreadRecentlyRemoved(threadId, "delete");
    const previousSelectedThread = selectedThread;
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
      setSelectedThread(null);
    }

    const linkAlertId = `unsub-link:${threadId}`;
    const replyAlertId = `unsub-reply:${threadId}`;
    const deleteAlertId = `unsub-delete:${threadId}`;

    upsertAlert({
      id: linkAlertId,
      type: "progress",
      title: "Unsubscribing…",
      message: from,
      duration: 0,
    });
    upsertAlert({
      id: replyAlertId,
      type: "progress",
      title: "Replying “unsubscribe”…",
      message: from,
      duration: 0,
    });
    upsertAlert({
      id: deleteAlertId,
      type: "progress",
      title: "Removing email…",
      message: from,
      duration: 0,
    });

    try {
      const response = await fetch(
        `/api/email/threads/${threadId}/unsubscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to unsubscribe");
      }

      const link = payload.link ?? { attempted: false, ok: false };
      const reply = payload.reply ?? { attempted: false, ok: false };
      const removed = payload.removed ?? { attempted: false, ok: false };

      upsertAlert({
        id: linkAlertId,
        type: link.ok ? "success" : link.attempted ? "error" : "info",
        title: link.ok
          ? "Unsubscribe link completed"
          : link.attempted
            ? "Unsubscribe link failed"
            : "No unsubscribe link",
        message: link.detail || from,
        duration: link.ok ? 5000 : 0,
      });
      upsertAlert({
        id: replyAlertId,
        type: reply.ok ? "success" : "error",
        title: reply.ok
          ? "Sent “unsubscribe” reply"
          : "Couldn’t send unsubscribe reply",
        message: reply.detail || from,
        duration: reply.ok ? 5000 : 0,
      });
      upsertAlert({
        id: deleteAlertId,
        type: removed.ok ? "success" : "error",
        title: removed.ok ? "Email removed" : "Couldn’t remove email",
        message: removed.detail || from,
        duration: removed.ok ? 5000 : 0,
      });

      if (!removed.ok) {
        // Delete failed — bring the row back.
        clearThreadRecentlyRemoved(threadId);
        inboxSnapshotRef.current = previousItems;
        setInboxItems(previousItems);
      }

      void refreshInboxState({ skipMailboxes: true }).catch(() => {});
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to unsubscribe";
      upsertAlert({
        id: linkAlertId,
        type: "error",
        title: "Unsubscribe failed",
        message,
        duration: 0,
      });
      dismissAlert(replyAlertId);
      dismissAlert(deleteAlertId);
      // Whole request failed — restore the row.
      clearThreadRecentlyRemoved(threadId);
      inboxSnapshotRef.current = previousItems;
      setInboxItems(previousItems);
      if (selectedThreadId === threadId && previousSelectedThread) {
        setSelectedThread(previousSelectedThread);
        setSelectedThreadId(threadId);
      }
    }
  };

  const handleInboxItemThreadAction = async (
    item: InboxItem,
    action: ThreadAction,
    actionOptions?: {
      snoozedUntil?: string;
      boomerangUntil?: string;
      boomerangTaskId?: string;
    },
  ) => {
    await handleThreadAction(action, {
      threadId: item.id,
      updateSelectedThread: selectedThreadId === item.id,
      ...actionOptions,
    });
  };

  const handleRunSpamScan = async () => {
    if (spamScanProgress || visibleInboxItems.length === 0) {
      return;
    }

    const itemsToScan = [...visibleInboxItems];
    const retainedIds = new Set(retainedSpamThreadIds);
    const detectedSpamIds = new Set<string>();

    setSpamScanProgress({
      total: itemsToScan.length,
      completed: 0,
      currentPosition: itemsToScan.length > 0 ? 1 : 0,
      currentThreadId: itemsToScan[0]?.id || null,
      currentSubject: itemsToScan[0]?.subject || null,
      detectedSpamIds: [],
    });

    try {
      for (const [index, item] of itemsToScan.entries()) {
        setSpamScanProgress({
          total: itemsToScan.length,
          completed: index,
          currentPosition: index + 1,
          currentThreadId: item.id,
          currentSubject: item.subject,
          detectedSpamIds: [...detectedSpamIds],
        });

        const response = await fetch(`/api/email/threads/${item.id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "reprocess" }),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Failed to run spam detection");
        }

        applyInboxItemUpdate(payload);

        if (
          payload.status === "quarantine" ||
          payload.status === "spam" ||
          payload.classification === "spam"
        ) {
          retainedIds.add(payload.id);
          detectedSpamIds.add(payload.id);
          setRetainedSpamThreadIds([...retainedIds]);
        }

        if (selectedThreadId === payload.id) {
          setSelectedThread(payload);
        }

        setSpamScanProgress({
          total: itemsToScan.length,
          completed: index + 1,
          currentPosition: index + 1,
          currentThreadId: item.id,
          currentSubject: item.subject,
          detectedSpamIds: [...detectedSpamIds],
        });
      }

      updateStatus(
        detectedSpamIds.size > 0
          ? `Spam scan flagged ${detectedSpamIds.size} email${detectedSpamIds.size === 1 ? "" : "s"}.`
          : "Spam scan finished. No spam detected.",
      );
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to run spam detection",
      );
    } finally {
      setSpamScanProgress((current) =>
        current
          ? {
              ...current,
              currentThreadId: null,
              currentSubject: null,
            }
          : null,
      );
      window.setTimeout(() => {
        setSpamScanProgress(null);
      }, 1800);
    }
  };

  const handleMarkThreadNotSpam = async () => {
    if (!selectedThreadId) {
      return;
    }

    setBusyState("spam_exception");

    try {
      const response = await fetch("/api/email/spam-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ threadId: selectedThreadId }),
      });
      const payload = (await response.json()) as EmailSpamExceptionResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to create spam exception");
      }

      setRuleEditorInitialRule(payload.rule);
      setIsRuleEditorOpen(true);

      await Promise.allSettled([
        refreshInboxState({ skipMailboxes: true }),
        Promise.resolve(onRefresh?.()),
      ]);

      updateStatus("Marked as not spam. Review the generated rule.");
    } catch (error) {
      updateStatus(
        error instanceof Error
          ? error.message
          : "Failed to create spam exception",
      );
    } finally {
      setBusyState(null);
    }
  };

  const clearQueuedAction = () => {
    if (queuedActionTimeoutRef.current !== null) {
      window.clearTimeout(queuedActionTimeoutRef.current);
      queuedActionTimeoutRef.current = null;
    }
    setQueuedAction(null);
    setIsQueuedActionNoticeVisible(false);
  };

  const executeThreadAction = async (action: ThreadAction) => {
    await handleThreadAction(action);
  };

  const queueThreadAction = (action: ThreadAction) => {
    const undoSeconds =
      action === "delete"
        ? deleteUndoSeconds
        : DEFAULT_THREAD_ACTION_QUEUE_SECONDS;

    clearQueuedAction();
    setPendingConfirmAction(null);
    setQueuedAction(action);
    setIsQueuedActionNoticeVisible(true);
    updateStatus(getQueuedThreadActionMessage(action, undoSeconds));
    queuedActionTimeoutRef.current = window.setTimeout(() => {
      queuedActionTimeoutRef.current = null;
      setQueuedAction(null);
      setIsQueuedActionNoticeVisible(false);
      void executeThreadAction(action);
    }, undoSeconds * 1000);
  };

  const handleUndoQueuedAction = () => {
    const action = queuedAction;
    clearQueuedAction();
    setPendingConfirmAction(null);
    if (action) {
      updateStatus(`${getThreadActionLabel(action)} canceled.`);
    }
  };

  const handleDismissQueuedAction = () => {
    setIsQueuedActionNoticeVisible(false);
  };

  const handleActionButtonClick = (action: ThreadAction) => {
    if (queuedAction) {
      return;
    }

    if (requiresThreadActionConfirmation(action)) {
      setPendingConfirmAction((current) =>
        current === action ? null : action,
      );
      return;
    }

    void executeThreadAction(action);
  };

  const renderThreadActionButton = (
    action: ThreadAction,
    options: {
      icon?: ReactNode;
      label?: string;
      destructive?: boolean;
    },
  ) => {
    const isPendingConfirm = pendingConfirmAction === action;
    const isQueued = queuedAction === action;
    const isBusy = busyState === action;
    const label = options.label ?? getThreadActionLabel(action);
    const baseClassName = getThreadActionButtonClassName({
      destructive: options.destructive,
    });

    if (isPendingConfirm) {
      return (
        <div key={action} className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => queueThreadAction(action)}
            disabled={Boolean(busyState) || Boolean(queuedAction)}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/15 px-3 py-2 text-sm text-white transition-colors hover:border-[rgb(var(--theme-primary-rgb))]/70 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setPendingConfirmAction(null)}
            disabled={Boolean(busyState) || Boolean(queuedAction)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
          >
            Undo
          </button>
        </div>
      );
    }

    return (
      <Tooltip
        key={action}
        content={isQueued ? `${label} queued` : label}
        className="w-auto"
        side="top"
      >
        <button
          type="button"
          onClick={() => handleActionButtonClick(action)}
          disabled={Boolean(busyState) || Boolean(queuedAction)}
          className={baseClassName}
          aria-label={isQueued ? `${label} queued` : label}
          title={isQueued ? `${label} queued` : label}
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : options.icon ? (
            options.icon
          ) : null}
        </button>
      </Tooltip>
    );
  };

  const handleProjectAssign = async (threadId: string, projectId: string) => {
    if (!threadId) return;

    // Assigning triggers a server-side reprocess that can reclassify the thread
    // straight out of the inbox. Remember the interaction so the next snapshot
    // can say where it went instead of the row just disappearing.
    touchedThreadsRef.current.set(threadId, Date.now());
    lastInteractionAtRef.current = Date.now();

    // Optimistic: reflect the assignment in local state immediately so the row
    // updates without waiting on the round-trip. Snapshot prior state to revert
    // on failure.
    const previousItems = inboxSnapshotRef.current;
    const previousSelectedThread = selectedThread;
    const optimisticItems = previousItems.map((item) => {
      if (item.id !== threadId) {
        return item;
      }
      const nextProjectIds = [
        projectId,
        ...(item.projectIds || []).filter((id) => id && id !== projectId),
      ];
      const nextItem: InboxItem = {
        ...item,
        projectId,
        projectIds: nextProjectIds,
        needsProject: false,
        status: item.status === "needs_project" ? "active" : item.status,
      };
      return nextItem;
    });
    const changedOptimistically = optimisticItems !== previousItems;

    if (changedOptimistically) {
      inboxSnapshotRef.current = optimisticItems;
      setInboxItems(optimisticItems);
    }
    if (
      previousSelectedThread &&
      previousSelectedThread.id === threadId
    ) {
      setSelectedThread((current: any | null) =>
        current && current.id === threadId
          ? {
              ...current,
              projectId,
              projectIds: [
                projectId,
                ...((current.projectIds as string[] | undefined) || []).filter(
                  (id: string) => id && id !== projectId,
                ),
              ],
              needsProject: false,
              status:
                current.status === "needs_project" ? "active" : current.status,
            }
          : current,
      );
    }

    setBusyState("project");
    setAssigningProjectThreadId(threadId);
    try {
      const response = await fetch(`/api/email/threads/${threadId}/project`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to assign project");
      }
      if (selectedThreadId === threadId && payload?.id) {
        setSelectedThread(payload);
      }
      // Reconcile in the background without blocking the UI on the round-trip.
      // Only the assigned thread changed, so hydrate that ONE row rather than
      // re-reading /api/email/inbox and replacing the whole list: a full
      // snapshot hands every row a new object identity, re-renders the entire
      // list, and — because the poll and the IMAP worker are writing
      // concurrently — folds unrelated arrivals, re-sorts and day-group changes
      // into the same frame, which is what made a single project assignment
      // look like a cascade of reloads.
      void hydrateThreadIntoInbox(threadId).catch(() => {
        // Keep the optimistic state if the reconcile fetch fails; the low
        // frequency poll below still self-heals any missed field.
      });
      updateStatus("Project assigned.");
    } catch (error) {
      // Revert the optimistic assignment.
      if (changedOptimistically) {
        inboxSnapshotRef.current = previousItems;
        setInboxItems(previousItems);
      }
      if (previousSelectedThread && previousSelectedThread.id === threadId) {
        setSelectedThread(previousSelectedThread);
      }
      updateStatus(
        error instanceof Error ? error.message : "Failed to assign project",
      );
    } finally {
      setBusyState(null);
      setAssigningProjectThreadId(null);
    }
  };

  const closeProjectPicker = () => {
    setIsProjectPickerOpen(false);
    setProjectSearchQuery("");
    setIsEditingProjectField(false);
  };

  const closeInlineProjectPicker = () => {
    setInlineProjectPickerThreadId(null);
    setInlineProjectSearchQuery("");
  };

  const handleProjectPickerSelect = (projectId: string) => {
    closeProjectPicker();
    if (projectId !== selectedProjectId) {
      void handleProjectAssign(selectedThreadId || "", projectId);
    }
  };

  const handleProjectPickerOpenForItem = (item: InboxItem) => {
    setInlineProjectPickerThreadId(item.id);
    setInlineProjectSearchQuery("");
  };

  // Priority is a triage marker, so it flips instantly and reconciles after —
  // the row must not wait on a round trip. A failed write rolls the row back
  // and says so rather than leaving a flag that isn't really saved.
  const handleSetThreadPriority = async (
    item: InboxItem,
    priority: number | null,
  ) => {
    const previous = item.priority ?? null;
    const next = (priority ?? null) as InboxItem["priority"];
    const apply = (value: InboxItem["priority"]) => {
      setInboxItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, priority: value } : entry,
        ),
      );
      inboxSnapshotRef.current = inboxSnapshotRef.current.map((entry) =>
        entry.id === item.id ? { ...entry, priority: value } : entry,
      );
    };

    apply(next);

    try {
      const response = await fetch(`/api/email/threads/${item.id}/priority`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priority }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to set priority");
      }
    } catch (error) {
      apply(previous as InboxItem["priority"]);
      updateStatus(
        error instanceof Error ? error.message : "Failed to set priority",
      );
    }
  };

  const handleInlineProjectPickerSelect = (
    item: InboxItem,
    projectId: string,
  ) => {
    closeInlineProjectPicker();
    if (projectId !== item.projectId) {
      void handleProjectAssign(item.id, projectId);
    }
  };

  const handleCreateProject = async (options?: {
    threadId?: string | null;
    mailboxId?: string | null;
    query?: string;
    closePicker?: () => void;
  }) => {
    const name = (options?.query ?? projectSearchQuery).trim();
    if (!name || isCreatingProject) return;

    const existingProject = sortedInboxProjects.find(
      (project) => project.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existingProject) {
      if (options?.threadId) {
        options.closePicker?.();
        void handleProjectAssign(options.threadId, existingProject.id);
      } else {
        handleProjectPickerSelect(existingProject.id);
      }
      return;
    }

    const mailboxForThread = mailboxes.find(
      (mailbox) =>
        mailbox.id ===
        (options?.mailboxId || selectedThread?.mailboxId || null),
    );
    const organizationId =
      mailboxForThread?.organizationId || data.organizations[0]?.id || null;

    if (!organizationId) {
      updateStatus("Add an organization before creating a project.");
      return;
    }

    setIsCreatingProject(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          color: "#6B7280",
          organization_id: organizationId,
          is_favorite: false,
          archived: false,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create project");
      }

      await onRefresh();
      if (options?.closePicker) {
        options.closePicker();
      } else {
        closeProjectPicker();
      }
      await handleProjectAssign(
        options?.threadId || selectedThreadId || "",
        payload.id,
      );
      updateStatus(`Created project "${name}".`);
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to create project",
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleGenerateTasks = async () => {
    if (!selectedThreadId) return;
    setBusyState("tasks");
    try {
      const response = await fetch(
        `/api/email/threads/${selectedThreadId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId:
              selectedThread?.projectId || selectedThread?.project_id || null,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to generate tasks");
      }
      await refreshInboxState({ skipMailboxes: true });
      updateStatus(
        `Generated ${payload.length || 0} task${payload.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to generate tasks",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleReplyFilesAdded = async (files: File[]) => {
    if (files.length === 0 || busyState === "reply_upload") {
      return;
    }

    setBusyState("reply_upload");

    try {
      const uploadedAttachments: ComposerAttachment[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/attachments/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || `Failed to upload ${file.name}`);
        }

        uploadedAttachments.push({
          id: payload.id,
          name: payload.name,
          url: payload.url,
          type: payload.type,
          sizeBytes: payload.size_bytes,
          mimeType: payload.mime_type,
          storageProvider: payload.storage_provider,
          inline: false,
          isImage: file.type.startsWith("image/"),
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : null,
        });
      }

      setReplyAttachments((current) => [...current, ...uploadedAttachments]);
      updateStatus(
        `Uploaded ${uploadedAttachments.length} attachment${uploadedAttachments.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to upload files",
      );
    } finally {
      setBusyState(null);
      if (replyFileInputRef.current) {
        replyFileInputRef.current.value = "";
      }
    }
  };

  const handleReplyAttachmentRemove = (attachmentId: string) => {
    setReplyAttachments((current) => {
      const attachment = current.find((item) => item.id === attachmentId);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }

      return current.filter((item) => item.id !== attachmentId);
    });
  };

  const handleReplyAttachmentInlineToggle = (attachmentId: string) => {
    setReplyAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId
          ? { ...attachment, inline: !attachment.inline }
          : attachment,
      ),
    );
  };

  const handleReplyFileInputChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await handleReplyFilesAdded(Array.from(files));
  };

  const handleReplyEditorDrop = async (
    event: ReactDragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    setIsReplyDragActive(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) return;
    await handleReplyFilesAdded(files);
  };

  const buildReplyAttachmentPayload = () =>
    replyMode === "reply_all"
      ? replyAttachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          url: attachment.url,
          type: attachment.type,
          sizeBytes: attachment.sizeBytes,
          mimeType: attachment.mimeType,
          storageProvider: attachment.storageProvider,
          inline: attachment.inline,
        }))
      : [];

  const refreshSelectedThreadDetail = async (threadId: string) => {
    const detailResponse = await fetch(`/api/email/threads/${threadId}`, {
      credentials: "include",
    });
    const detailPayload = await detailResponse.json();

    if (detailResponse.ok) {
      setSelectedThread(detailPayload);
      if (detailPayload?.activeReplyDraft) {
        applyDraftToComposer(detailPayload.activeReplyDraft);
      }
    }
  };

  const ensureComposerDraft = async () => {
    if (!selectedThreadId) {
      throw new Error("Choose a thread before saving a draft.");
    }

    const payload = {
      source: selectedReplyDraft?.source || "manual",
      replyMode,
      subject: selectedReplyDraft?.subject || "",
      contentText: richTextToPlainText(replyContent),
      contentHtml: replyContent,
      signatureText:
        replyMode === "reply_all"
          ? selectedSignature?.content ||
            selectedReplyDraft?.signatureText ||
            null
          : null,
      attachments: buildReplyAttachmentPayload(),
    };

    if (selectedReplyDraftId) {
      const response = await fetch(
        `/api/email/reply-drafts/${selectedReplyDraftId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to update reply draft");
      }
      return result as EmailReplyDraft;
    }

    const response = await fetch(
      `/api/email/threads/${selectedThreadId}/reply-drafts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Failed to save reply draft");
    }
    return result as EmailReplyDraft;
  };

  const resetComposerAfterSend = () => {
    setReplyContent("");
    setSelectedReplyDraftId(null);
    setScheduledReplyAt("");
    setReplyAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
      return [];
    });
    setIsSignaturePickerOpen(false);
  };

  const handleReply = async () => {
    if (
      !selectedThreadId ||
      !hasRichTextContent(replyContent) ||
      busyState === "reply_upload"
    ) {
      return;
    }
    setBusyState("reply");
    try {
      const draft = await ensureComposerDraft();
      const response = await fetch(`/api/email/reply-drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to send reply");
      }
      resetComposerAfterSend();
      await refreshInboxState({ skipMailboxes: true });
      await refreshReplyDraftState();
      await refreshSelectedThreadDetail(selectedThreadId);
      updateStatus(
        replyMode === "internal_note" ? "Internal note saved." : "Reply sent.",
      );
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to send reply",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleScheduleReply = async () => {
    if (!selectedThreadId || !hasRichTextContent(replyContent)) {
      return;
    }

    if (!scheduledReplyAt) {
      updateStatus("Choose a date and time before scheduling.");
      return;
    }

    setBusyState("reply_schedule");
    try {
      const draft = await ensureComposerDraft();
      const response = await fetch(
        `/api/email/reply-drafts/${draft.id}/schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            scheduledFor: new Date(scheduledReplyAt).toISOString(),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to schedule reply");
      }

      await refreshReplyDraftState();
      applyDraftToComposer(payload);
      setReplyQueueTab("reply_queue");
      updateStatus("Reply scheduled.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to schedule reply",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleGenerateAiReply = async () => {
    if (!selectedThreadId) {
      return;
    }

    setBusyState("reply_ai");
    try {
      const response = await fetch(
        `/api/email/threads/${selectedThreadId}/reply/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            override: replyStyleOverrideEnabled ? replyStyleOverrides : null,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to generate AI reply");
      }

      await refreshReplyDraftState();
      applyDraftToComposer(payload);
      setReplyQueueTab("reply_queue");
      updateStatus("AI reply drafted.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to generate AI reply",
      );
    } finally {
      setBusyState(null);
    }
  };

  const handleSaveProfile = async () => {
    setBusyState("profile");
    try {
      const response = await fetch(
        editingProfile
          ? `/api/email/ai-profiles/${editingProfile.id}`
          : "/api/email/ai-profiles",
        {
          method: editingProfile ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: profileForm.name,
            mailboxId:
              profileForm.mailboxId !== "all" ? profileForm.mailboxId : null,
            summaryStyle: profileForm.summaryStyle,
            instructionText: profileForm.instructionText,
            isDefault: profileForm.isDefault,
            settings: parseJsonValue(profileForm.settingsJson, {}),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save AI profile");
      }
      setEditingProfile(null);
      setProfileForm({
        name: "",
        mailboxId: "all",
        summaryStyle: "action_first",
        instructionText:
          "Summaries should lead with the next concrete action, note blockers, and preserve client tone.",
        isDefault: false,
        settingsJson: DEFAULT_PROFILE_SETTINGS,
      });
      await onRefresh();
      updateStatus("AI profile saved.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to save AI profile",
      );
    } finally {
      setBusyState(null);
    }
  };

  const startEditingProfile = (profile: SummaryProfile) => {
    setEditingProfile(profile);
    setProfileForm({
      name: profile.name,
      mailboxId: profile.mailboxId || "all",
      summaryStyle: profile.summaryStyle,
      instructionText: profile.instructionText,
      isDefault: profile.isDefault,
      settingsJson: JSON.stringify(profile.settings, null, 2),
    });
  };

  if (view === "email-rules") {
    return (
      <AiRulesTabs
        data={data}
        mailboxes={mailboxes}
        currentUserId={currentUserId}
        onRefresh={onRefresh}
      />
    );
  }

  if (view === "email-ai-lab") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Email AI Lab</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Advanced profile controls for summary, routing, tone, and task
              splitting.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-400">
            {data.summaryProfiles.length} profile
            {data.summaryProfiles.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            {data.summaryProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => startEditingProfile(profile)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Bot className="h-4 w-4 text-zinc-400" />
                    {profile.name}
                  </div>
                  {profile.isDefault ? (
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-400">
                      Default
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  {profile.summaryStyle}
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                  {profile.instructionText}
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="text-lg font-semibold text-white">
              {editingProfile ? "Edit Profile" : "New Profile"}
            </h2>
            <div className="mt-4 space-y-3">
              <input
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Profile name"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              />
              <Select
                value={profileForm.mailboxId}
                onValueChange={(value) =>
                  setProfileForm((prev) => ({ ...prev, mailboxId: value }))
                }
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Mailbox scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">User-wide</SelectItem>
                  {mailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      {mailbox.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                value={profileForm.summaryStyle}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    summaryStyle: event.target.value,
                  }))
                }
                placeholder="Summary style"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              />
              <textarea
                value={profileForm.instructionText}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    instructionText: event.target.value,
                  }))
                }
                rows={6}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              />
              <textarea
                value={profileForm.settingsJson}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    settingsJson: event.target.value,
                  }))
                }
                rows={8}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300"
              />
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-400">
                  <input
                    type="checkbox"
                    checked={profileForm.isDefault}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        isDefault: event.target.checked,
                      }))
                    }
                  />
                  Default profile
                </label>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={busyState === "profile" || !profileForm.name.trim()}
                  className="rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busyState === "profile" ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showContactsView) {
    return (
      <div className="min-w-0 space-y-4">
        <button
          type="button"
          onClick={() => setShowContactsView(false)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to inbox
        </button>
        <EmailContactsView />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-nowrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {!isQuarantineView ? (
              <div className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 text-sm font-medium">
                <Tooltip content="Unread" className="w-auto" side="bottom">
                  <span className="cursor-default text-[rgb(var(--theme-primary-rgb))]">
                    {unreadInboxCount}
                  </span>
                </Tooltip>
                <span className="text-zinc-600">/</span>
                <Tooltip content="Total" className="w-auto" side="bottom">
                  <span className="cursor-default text-zinc-400">
                    {visibleInboxItems.length}
                  </span>
                </Tooltip>
                {isRefreshing ? (
                  <Tooltip content="Refreshing…" className="w-auto" side="bottom">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                  </Tooltip>
                ) : null}
                {searchLoading ? (
                  <Tooltip
                    content="Searching full mailbox…"
                    className="w-auto"
                    side="bottom"
                  >
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Searching…
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            ) : null}
            <h1 className="text-2xl font-bold">
              {isQuarantineView
                ? "Quarantine"
                : isSentView
                  ? "Sent"
                : isTrashView
                  ? "Trash"
                  : "Email Inbox"}
            </h1>
          </div>
          {/* The default-inbox intro hint is rendered as a floating
              bottom-center pill (see introBadge) instead of here, to avoid
              header layout shift and reserved empty space. */}
          {isDefaultInboxView ? null : (
            <p className="mt-1 whitespace-nowrap text-sm text-zinc-500">
              {isQuarantineView
                ? "Review suspected spam and decide what Fluid should do next."
                : isSentView
                  ? "Review outbound threads and keep follow-ups organized."
                  : "Review deleted threads and permanently empty the selected trash mailbox."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
          <AlertBellButton />
          {visibleInboxItems.length > 0 ? (
            <div className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 px-1.5 text-sm text-zinc-400">
              <Tooltip content="Previous page" className="w-auto" side="bottom">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((current) =>
                      clampEmailInboxPage(current - 1, pageCount),
                    )
                  }
                  disabled={safeCurrentPage <= 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </Tooltip>
              <span className="whitespace-nowrap tabular-nums">
                Page{" "}
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={pageJumpInput || String(safeCurrentPage)}
                  onChange={(event) => setPageJumpInput(event.target.value)}
                  onFocus={() => setPageJumpInput(String(safeCurrentPage))}
                  onBlur={() => {
                    const next = clampEmailInboxPage(
                      Number.parseInt(pageJumpInput, 10),
                      pageCount,
                    );
                    setCurrentPage(next);
                    setPageJumpInput("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  className="w-9 rounded-md border border-zinc-700 bg-zinc-950/70 px-1 py-0.5 text-center text-sm tabular-nums text-white focus:outline-none focus:ring-1 ring-theme [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label="Jump to page"
                />{" "}
                of {pageCount}
              </span>
              <Tooltip content="Next page" className="w-auto" side="bottom">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((current) =>
                      clampEmailInboxPage(current + 1, pageCount),
                    )
                  }
                  disabled={safeCurrentPage >= pageCount}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Tooltip>
              <span className="mx-0.5 h-4 w-px bg-zinc-700" aria-hidden />
              <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                <input
                  type="number"
                  inputMode="numeric"
                  min={EMAIL_INBOX_MIN_PER_PAGE}
                  max={EMAIL_INBOX_MAX_PER_PAGE}
                  value={perPageInput}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setPerPageInput(raw);
                    if (raw.trim() === "") {
                      return;
                    }
                    const next = clampEmailInboxPerPage(raw);
                    setPerPage(next);
                  }}
                  onBlur={() => {
                    const next = clampEmailInboxPerPage(perPageInput);
                    setPerPage(next);
                    setPerPageInput(String(next));
                  }}
                  className="h-7 w-[6ch] rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-0 text-center text-sm tabular-nums text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label="Emails per page"
                />
                <span className="whitespace-nowrap">Per Page</span>
              </div>
            </div>
          ) : null}
          {isTrashView ? (
            isEmptyTrashConfirmVisible ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleEmptyTrashPermanently()}
                  disabled={busyState === "empty_trash"}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-800/60 bg-red-950/50 px-3 text-sm font-medium text-red-100 transition-colors hover:border-red-700 hover:text-white disabled:opacity-50"
                >
                  {busyState === "empty_trash" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Empty All Permanently
                </button>
                <button
                  type="button"
                  onClick={() => setIsEmptyTrashConfirmVisible(false)}
                  disabled={busyState === "empty_trash"}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsEmptyTrashConfirmVisible(true)}
                disabled={
                  trashedThreadCount === 0 || busyState === "empty_trash"
                }
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 text-sm font-medium text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
              >
                {busyState === "empty_trash" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Empty All Permanently
              </button>
            )
          ) : null}
          <Tooltip content="AI + Spam" className="w-auto" side="bottom">
            <button
              type="button"
              onClick={() => setIsSpamReviewOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
              aria-label="AI + Spam"
            >
              <Bot className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip
            content={
              showMailboxForm
                ? "Close Mailbox"
                : selectedMailbox
                  ? "Edit Mailbox"
                  : "Connect Mailbox"
            }
            className="w-auto"
            side="bottom"
          >
            <button
              type="button"
              onClick={handleMailboxFormToggle}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
              aria-label={
                showMailboxForm
                  ? "Close Mailbox"
                  : selectedMailbox
                    ? "Edit Mailbox"
                    : "Connect Mailbox"
              }
            >
              <MailPlus className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip
            content={selectedMailboxId === "all" ? "Sync All" : "Sync"}
            className="w-auto"
            side="bottom"
          >
            <button
              type="button"
              onClick={handleSync}
              disabled={mailboxes.length === 0 || busyState === "sync"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
              aria-label={selectedMailboxId === "all" ? "Sync All" : "Sync"}
            >
              {busyState === "sync" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </Tooltip>
          <Tooltip
            content={
              isFilterBarCollapsed
                ? "Search & filters"
                : "Hide search & filters"
            }
            className="w-auto"
            side="bottom"
          >
            <button
              type="button"
              onClick={() => {
                if (isFilterBarCollapsed) {
                  setIsFilterBarCollapsed(false);
                  focusInboxSearchInput();
                } else {
                  setIsFilterBarCollapsed(true);
                }
              }}
              className={cn(
                "relative inline-flex h-9 w-9 items-center justify-center text-sm text-zinc-200 transition-colors hover:text-white",
                // Collapsed: a regular toolbar button. Expanded: THIS button
                // becomes the tab of the search/filters panel below — square
                // bottom corners, the panel's border/bg, no bottom border —
                // instead of rendering a second, duplicate tab in the panel.
                isFilterBarCollapsed
                  ? "rounded-lg border border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                  : "-mb-px rounded-t-lg rounded-b-none border border-b-0 border-zinc-800 bg-zinc-950/60 pb-2 text-white",
              )}
              aria-expanded={!isFilterBarCollapsed}
              aria-label={
                isFilterBarCollapsed
                  ? "Show search and filters"
                  : "Hide search and filters"
              }
            >
              <SlidersHorizontal className="h-4 w-4" />
              {isFilterBarCollapsed && hasActiveFilters ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--theme-primary-rgb))] px-1 text-xs sm:text-[9px] font-semibold leading-none text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </Tooltip>
          <Tooltip content="Contacts" className="w-auto" side="bottom">
            <button
              type="button"
              onClick={() => setShowContactsView(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
              aria-label="Contacts"
            >
              <Contact className="h-4 w-4" />
            </button>
          </Tooltip>
          {!isTrashView && !isQuarantineView ? (
            <Tooltip content="New Email" className="w-auto" side="bottom">
              <button
                type="button"
                onClick={() => setIsOutboundComposerOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
                aria-label="New Email"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {visibleSyncError ? (
        <div className="rounded-xl border border-amber-900/70 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          {visibleSyncError}
        </div>
      ) : null}

      <Dialog
        open={showMailboxForm}
        onOpenChange={(open) => {
          if (!open) {
            closeMailboxForm();
          }
        }}
      >
        <DialogContent className="max-h-[92vh] w-[min(96vw,920px)] max-w-[96vw] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogTitle className="text-lg font-semibold text-white">
            {isEditingMailbox ? "Update Mailbox" : "Connect Mailbox"}
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-500">
            {isEditingMailbox
              ? "Replace the mailbox password with a new App Password, then save to reconnect."
              : "Add a new mailbox connection for Fluid to sync and process."}
          </DialogDescription>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Select
              value={mailboxForm.provider}
              onValueChange={(value) =>
                setMailboxForm((prev) =>
                  applyMailboxProviderPreset(
                    prev,
                    value as Mailbox["provider"],
                  ),
                )
              }
            >
              <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MAILBOX_PROVIDER_PRESETS).map(
                  ([provider, preset]) => (
                    <SelectItem key={provider} value={provider}>
                      {preset.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <input
              value={mailboxForm.name}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              placeholder="Mailbox name"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.displayName}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  displayName: event.target.value,
                }))
              }
              placeholder="Display name"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.emailAddress}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  emailAddress: event.target.value,
                  loginUsername:
                    !prev.loginUsername ||
                    prev.loginUsername === prev.emailAddress
                      ? event.target.value
                      : prev.loginUsername,
                }))
              }
              placeholder="Mailbox email"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.loginUsername}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  loginUsername: event.target.value,
                }))
              }
              placeholder="Login username"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.password}
              type="password"
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              placeholder={
                mailboxForm.provider === "gmail"
                  ? "16-character Google App Password"
                  : isEditingMailbox
                    ? "New mailbox password / App Password"
                    : "Mailbox password"
              }
              className={`rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-white ${
                mailboxPasswordError ? "border-red-500/70" : "border-zinc-700"
              }`}
            />
            <input
              value={mailboxForm.imapHost}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  imapHost: event.target.value,
                }))
              }
              placeholder="IMAP host"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.imapPort}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  imapPort: event.target.value,
                }))
              }
              placeholder="IMAP port"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.smtpHost}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  smtpHost: event.target.value,
                }))
              }
              placeholder="SMTP host"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.smtpPort}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  smtpPort: event.target.value,
                }))
              }
              placeholder="SMTP port"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <input
              value={mailboxForm.syncFolder}
              onChange={(event) =>
                setMailboxForm((prev) => ({
                  ...prev,
                  syncFolder: event.target.value,
                }))
              }
              placeholder="Sync folder"
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            />
            <Select
              value={mailboxForm.organizationId}
              onValueChange={(value) =>
                setMailboxForm((prev) => ({ ...prev, organizationId: value }))
              }
            >
              <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
                <SelectValue placeholder="Organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Personal mailbox</SelectItem>
                {data.organizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={mailboxForm.isShared}
                onChange={(event) =>
                  setMailboxForm((prev) => ({
                    ...prev,
                    isShared: event.target.checked,
                  }))
                }
              />
              Shared mailbox
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
            <div className="text-sm font-medium text-zinc-200">
              {mailboxPreset.label}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {mailboxPreset.description}
            </div>
            {mailboxForm.provider === "gmail" ? (
              <div className="mt-2 text-xs text-amber-300">
                Paste the 16-character Google App Password. Forge strips the
                display spaces automatically.
              </div>
            ) : null}
            {mailboxPasswordError ? (
              <div className="mt-2 text-xs text-red-300">
                {mailboxPasswordError}
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeMailboxForm}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMailboxCreate}
              disabled={
                busyState === "mailbox" ||
                !mailboxForm.name ||
                !mailboxForm.password ||
                Boolean(mailboxPasswordError)
              }
              className="rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busyState === "mailbox"
                ? isEditingMailbox
                  ? "Updating…"
                  : "Connecting…"
                : isEditingMailbox
                  ? "Update Mailbox"
                  : "Save Mailbox"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div
        ref={splitContainerRef}
        className="min-w-0"
        style={splitLayoutStyle}
      >
        <div className="min-w-0 space-y-3">
          <div className="min-w-0">
            {isQuarantineView || isTrashView ? (
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-sm text-zinc-400">
                  {isQuarantineView ? (
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-red-300" />
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {isQuarantineView ? (
                    <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-400">
                      {quarantineCount} quarantined
                    </div>
                  ) : (
                    <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-400">
                      {trashedThreadCount} in trash
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            <div className="mb-3">
              {isFilterBarCollapsed &&
              (inboxSearchQuery.trim() || searchDateFrom || searchDateTo) ? (
                <div className="mb-2 flex items-center gap-2">
                  <div className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/35 bg-[rgb(var(--theme-primary-rgb))]/10 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-[rgb(var(--theme-primary-rgb))]">
                    {visibleInboxItems.length} match
                    {visibleInboxItems.length === 1 ? "" : "es"}
                  </div>
                </div>
              ) : null}
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                  isFilterBarCollapsed
                    ? "grid-rows-[0fr] opacity-0"
                    : "grid-rows-[1fr] opacity-100",
                )}
                aria-hidden={isFilterBarCollapsed}
              >
                <div className="overflow-hidden">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                    {inboxSearchQuery.trim() ||
                    searchDateFrom ||
                    searchDateTo ? (
                      <div className="mb-3 flex items-center justify-end gap-2">
                        <div className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/35 bg-[rgb(var(--theme-primary-rgb))]/10 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-[rgb(var(--theme-primary-rgb))]">
                          {visibleInboxItems.length} match
                          {visibleInboxItems.length === 1 ? "" : "es"}
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-3">
                  <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)_minmax(240px,0.9fr)]">
                    <div className="relative pt-2">
                      <FloatingFieldLabel label="Search inbox" />
                      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <div className="pointer-events-none absolute left-9 top-1/2 z-10 h-5 w-px -translate-y-1/2 bg-zinc-700" />
                      <Input
                        ref={inboxSearchInputRef}
                        value={inboxSearchQuery}
                        onChange={(event) =>
                          setInboxSearchQuery(event.target.value)
                        }
                        placeholder="Search sender, subject, preview, or mailbox..."
                        className="h-11 rounded-xl border-zinc-800 bg-zinc-950/70 pl-12 pr-11"
                        aria-label="Search inbox"
                      />
                      {inboxSearchQuery.trim() ? (
                        <button
                          type="button"
                          onClick={() => setInboxSearchQuery("")}
                          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-zinc-500 transition-colors hover:text-white"
                          aria-label="Clear inbox search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {isSearchHelpMode ? (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2">
                        <div className="mb-2 flex items-center justify-between gap-3 px-2 pt-1">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                              Search Help
                            </div>
                            <div className="text-xs text-zinc-400">
                              Type like caveman. Click to insert. Click copy to steal syntax.
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsSearchHelpDialogOpen(true)}
                            className="inline-flex h-8 items-center gap-2 rounded-lg border border-zinc-800 px-2 text-xs text-zinc-400 transition-colors hover:text-white"
                          >
                            <CircleHelp className="h-3.5 w-3.5" />
                            Full help
                          </button>
                        </div>
                        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {filteredSearchHelpDefinitions.map((definition) => (
                            <div
                              key={definition.fullPrefix}
                              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInsertInboxSearchHelp({
                                      prefix: definition.fullPrefix,
                                    })
                                  }
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-white">
                                      {definition.label}
                                    </span>
                                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[11px] text-zinc-300">
                                      {definition.fullPrefix}
                                    </span>
                                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[11px] text-zinc-500">
                                      {definition.shortPrefix}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-xs text-zinc-400">
                                    {definition.description}
                                  </div>
                                  <div className="mt-2 text-xs text-[rgb(var(--theme-primary-rgb))]">
                                    {definition.example}
                                  </div>
                                </button>
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleInsertInboxSearchHelp({
                                        prefix: definition.fullPrefix,
                                      })
                                    }
                                    className="inline-flex h-8 items-center rounded-lg border border-zinc-800 px-2 text-xs text-zinc-300 transition-colors hover:text-white"
                                  >
                                    Insert
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopyInboxSearchHelp({
                                        prefix: definition.fullPrefix,
                                        example: definition.example,
                                      })
                                    }
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:text-white"
                                    aria-label={`Copy ${definition.label} search syntax`}
                                  >
                                    {copiedSearchHelpValue === definition.example ? (
                                      <Check className="h-4 w-4" />
                                    ) : (
                                      <Copy className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              {definition.tokens?.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {definition.tokens.map((token) => (
                                    <div
                                      key={`${definition.fullPrefix}${token.value}`}
                                      className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-2 py-1"
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleInsertInboxSearchHelp({
                                            prefix: definition.fullPrefix,
                                            tokenValue: token.value,
                                          })
                                        }
                                        className="text-xs text-zinc-300 transition-colors hover:text-white"
                                      >
                                        {definition.fullPrefix}
                                        {token.value}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleCopyInboxSearchHelp({
                                            prefix: definition.fullPrefix,
                                            example: definition.example,
                                            tokenValue: token.value,
                                          })
                                        }
                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                                        aria-label={`Copy ${definition.label} token ${token.value}`}
                                      >
                                        {copiedSearchHelpValue ===
                                        `${definition.fullPrefix}${token.value}` ? (
                                          <Check className="h-3 w-3" />
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {filteredSearchHelpDefinitions.length === 0 ? (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-4 text-sm text-zinc-500">
                              No search help matches that helper query.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="relative pt-2">
                      <FloatingFieldLabel label="Mailbox" />
                      <Mail className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <div className="pointer-events-none absolute left-9 top-1/2 z-10 h-5 w-px -translate-y-1/2 bg-zinc-700" />
                      <Select
                        value={selectedMailboxId}
                        onValueChange={setSelectedMailboxId}
                      >
                        <SelectTrigger className="h-11 rounded-xl border-zinc-800 bg-zinc-950/70 pl-12 text-white">
                          <SelectValue placeholder="Mailbox" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All mailboxes</SelectItem>
                          {mailboxes.map((mailbox) => (
                            <SelectItem key={mailbox.id} value={mailbox.id}>
                              {mailbox.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="relative pt-2">
                      <FloatingFieldLabel label="Sort by" />
                      <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <div className="pointer-events-none absolute left-9 top-1/2 z-10 h-5 w-px -translate-y-1/2 bg-zinc-700" />
                      <Select
                        value={sortBy}
                        onValueChange={(value) =>
                          setSortBy(value as EmailInboxSortOption)
                        }
                      >
                        <SelectTrigger className="h-11 rounded-xl border-zinc-800 bg-zinc-950/70 pl-12 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EMAIL_INBOX_SORT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <div className="relative pt-2">
                      <FloatingFieldLabel label="From date" />
                      <input
                        type="date"
                        value={searchDateFrom}
                        max={searchDateTo || undefined}
                        onChange={(event) =>
                          setSearchDateFrom(event.target.value)
                        }
                        className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 text-sm text-white focus:outline-none focus:ring-1 ring-theme [color-scheme:dark]"
                        aria-label="Filter from date"
                      />
                    </div>
                    <div className="relative pt-2">
                      <FloatingFieldLabel label="To date" />
                      <input
                        type="date"
                        value={searchDateTo}
                        min={searchDateFrom || undefined}
                        onChange={(event) =>
                          setSearchDateTo(event.target.value)
                        }
                        className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 text-sm text-white focus:outline-none focus:ring-1 ring-theme [color-scheme:dark]"
                        aria-label="Filter to date"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInboxSearchQuery("");
                        setSearchDateFrom("");
                        setSearchDateTo("");
                        setSelectedMailboxId("all");
                        setInboxFilterTab("all");
                        setSortBy("received_desc");
                      }}
                      disabled={!hasActiveFilters}
                      className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </button>
                  </div>
                  {!isQuarantineView ? (
                    // One-row toolbar on wide screens: each control group keeps
                    // its width and the category-tab group absorbs any overflow
                    // by scrolling, so nothing wraps to a second line until the
                    // viewport is genuinely too narrow.
                    // Two rows at any width: the compact controls (mode, read filter,
                    // grouping) on one non-wrapping line that scrolls if needed, and the
                    // category tabs on their own line below — they grow with the number
                    // of tabs, so keeping them here stopped the rest from stacking.
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {isInboxView ? (
                          <div className="inline-flex shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/70 p-0.5">
                            {[
                              { id: "threads", label: "Threads" },
                              { id: "reply_queue", label: "Reply Queue" },
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() =>
                                  setReplyQueueTab(tab.id as EmailReplyQueueTab)
                                }
                                className={
                                  replyQueueTab === tab.id
                                    ? "rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-white"
                                    : "rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                                }
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {!isInboxView || replyQueueTab === "threads" ? (
                          <>
                          <div className="inline-flex shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/70 p-0.5">
                            {[
                              { id: "all", label: "All" },
                              { id: "unread", label: "Unread" },
                              { id: "read", label: "Read" },
                              ...(!isTrashView && !isSentView
                                ? [{ id: "spam", label: "Spam" }]
                                : []),
                            ].map((tab) => {
                              const count =
                                inboxFilterCounts[
                                  tab.id as keyof typeof inboxFilterCounts
                                ] ?? 0;
                              return (
                              <Tooltip
                                key={tab.id}
                                content={`${count} ${tab.label.toLowerCase()} ${
                                  count === 1 ? "email" : "emails"
                                }`}
                                className="w-auto"
                                side="top"
                              >
                              <button
                                type="button"
                                onClick={() =>
                                  setInboxFilterTab(
                                    tab.id as EmailInboxFilterTab,
                                  )
                                }
                                className={
                                  inboxFilterTab === tab.id
                                    ? tab.id === "unread"
                                      ? "rounded-md border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 px-2 py-1 text-xs font-medium text-[rgb(var(--theme-primary-rgb))]"
                                      : tab.id === "spam"
                                        ? "rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1 text-xs font-medium text-red-200"
                                        : tab.id === "read"
                                          ? "rounded-md border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-xs font-medium text-zinc-200"
                                          : "rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-white"
                                    : "rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                                }
                              >
                                {tab.label}
                                <span className="ml-1 text-[10px] text-zinc-500">
                                  {count}
                                </span>
                              </button>
                              </Tooltip>
                              );
                            })}
                          </div>
                          <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/70 p-0.5">
                            <span className="pl-1.5 pr-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                              Group
                            </span>
                            {INBOX_GROUP_BY_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setInboxGroupBy(option.id)}
                                className={
                                  inboxGroupBy === option.id
                                    ? "rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-white"
                                    : "rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                                }
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          </>
                        ) : (
                          <div className="inline-flex shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/70 p-0.5">
                            {[
                              { id: "draft", label: "Draft" },
                              { id: "scheduled", label: "Scheduled" },
                              { id: "failed", label: "Failed" },
                              { id: "sent", label: "Sent" },
                              { id: "all", label: "All" },
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() =>
                                  setReplyQueueFilter(
                                    tab.id as EmailReplyQueueFilter,
                                  )
                                }
                                className={
                                  replyQueueFilter === tab.id
                                    ? "rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-white"
                                    : "rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                                }
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="inline-flex shrink-0 items-center gap-2">
                        <Tooltip
                          content="Search help"
                          className="w-auto"
                          side="bottom"
                        >
                          <button
                            type="button"
                            onClick={() => setIsSearchHelpDialogOpen(true)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/70 text-zinc-400 transition-colors hover:text-white"
                            aria-label="Open search help"
                          >
                            <CircleHelp className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip
                          content="Run AI spam detection"
                          className="w-auto"
                          side="bottom"
                        >
                          <button
                            type="button"
                            onClick={() => void handleRunSpamScan()}
                            disabled={
                              Boolean(spamScanProgress) ||
                              visibleInboxItems.length === 0
                            }
                            aria-label="Run AI spam detection"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                              spamScanProgress
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                                : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-white",
                            )}
                          >
                            {spamScanProgress ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Radar className="h-4 w-4" />
                            )}
                          </button>
                        </Tooltip>
                        {isInboxView ? (
                          <Tooltip
                            content={
                              showSpamInInbox
                                ? "Hide spam from inbox"
                                : "Show spam in inbox"
                            }
                            className="w-auto"
                            side="bottom"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setShowSpamInInbox((current) => !current)
                              }
                              aria-pressed={showSpamInInbox}
                              aria-label="Toggle spam visibility in inbox"
                              className={cn(
                                "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                                showSpamInInbox
                                  ? "border-red-900/60 bg-red-950/40 text-red-200"
                                  : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-white",
                              )}
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        ) : null}
                        <Tooltip
                          content={
                            alwaysShowSummary
                              ? "Always show AI summary"
                              : "Show AI summary on hover"
                          }
                          className="w-auto"
                          side="bottom"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setAlwaysShowSummary((current) => !current)
                            }
                            aria-pressed={alwaysShowSummary}
                            aria-label="Toggle AI summary visibility"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                              alwaysShowSummary
                                ? "border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 text-[rgb(var(--theme-primary-rgb))]"
                                : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-white",
                            )}
                          >
                            <Bot className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip
                          content={
                            alwaysShowExcerpt
                              ? "Always show email excerpt"
                              : "Show email excerpt on hover"
                          }
                          className="w-auto"
                          side="bottom"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setAlwaysShowExcerpt((current) => !current)
                            }
                            aria-pressed={alwaysShowExcerpt}
                            aria-label="Toggle email excerpt visibility"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                              alwaysShowExcerpt
                                ? "border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 text-[rgb(var(--theme-primary-rgb))]"
                                : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-white",
                            )}
                          >
                            <MailOpen className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </div>
                      </div>
                          {isInboxView && !isInboxSearchActive ? (
                            <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              <Tooltip
                                content={`${inboxTabCounts.all.unread} unread of ${inboxTabCounts.all.total} in All`}
                                className="w-auto"
                                side="top"
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedInboxTabId(null)}
                                  className={
                                    selectedInboxTabId === null
                                      ? "rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-white"
                                      : "rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                                  }
                                >
                                  All
                                  <InboxTabCount
                                    unread={inboxTabCounts.all.unread}
                                    total={inboxTabCounts.all.total}
                                  />
                                </button>
                              </Tooltip>
                              {inboxTabs.map((tab) => (
                                <span
                                  key={tab.id}
                                  className="inline-flex shrink-0 items-center"
                                  title={`${
                                    inboxTabCounts.byTabId.get(tab.id)?.unread ?? 0
                                  } unread of ${
                                    inboxTabCounts.byTabId.get(tab.id)?.total ?? 0
                                  } in ${tab.name}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setSelectedInboxTabId(tab.id)}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = "move";
                                      if (dragOverTabId !== tab.id)
                                        setDragOverTabId(tab.id);
                                    }}
                                    onDragLeave={() => {
                                      if (dragOverTabId === tab.id)
                                        setDragOverTabId(null);
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      setDragOverTabId(null);
                                      const threadId =
                                        e.dataTransfer.getData(
                                          "application/x-thread-id",
                                        ) ||
                                        e.dataTransfer.getData("text/plain");
                                      const dropped = inboxItems.find(
                                        (it) => it.id === threadId,
                                      );
                                      if (dropped)
                                        setDragToTab({
                                          item: dropped,
                                          targetTab: tab,
                                        });
                                    }}
                                    className={
                                      dragOverTabId === tab.id
                                        ? "rounded-md bg-theme-gradient px-2 py-1 text-xs font-medium text-white ring-2 ring-white/40"
                                        : selectedInboxTabId === tab.id
                                        ? "rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-white"
                                        : "rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-white"
                                    }
                                  >
                                    {tab.name}
                                    <InboxTabCount
                                      unread={
                                        inboxTabCounts.byTabId.get(tab.id)
                                          ?.unread ?? 0
                                      }
                                      total={
                                        inboxTabCounts.byTabId.get(tab.id)
                                          ?.total ?? 0
                                      }
                                    />
                                  </button>
                                  {selectedInboxTabId === tab.id ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingInboxTab(tab);
                                        setInboxTabModalOpen(true);
                                      }}
                                      title="Edit tab"
                                      aria-label={`Edit ${tab.name} tab`}
                                      className="rounded-md px-1 py-1 text-zinc-500 hover:text-white"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </span>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingInboxTab(null);
                                  setInboxTabModalOpen(true);
                                }}
                                title="New tab"
                                aria-label="New inbox tab"
                                className="rounded-md px-1.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : isInboxView ? (
                            /* Tabs are inert during a search — showing them
                               selected would imply the results were narrowed by
                               the active category, which is exactly the
                               confusion this replaces. */
                            <div className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-xs text-zinc-400">
                              <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                              <span className="truncate">
                                Searching all tabs
                              </span>
                            </div>
                          ) : null}
                    </div>
                  ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {isInboxView && spamScanProgress ? (
              <div className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-rose-100">
                      Running AI spam detection
                    </div>
                    <div className="truncate text-xs text-rose-200/80">
                      {spamScanProgress.currentSubject
                        ? `Scanning ${spamScanProgress.currentPosition} of ${spamScanProgress.total}: ${formatEmailSubject(spamScanProgress.currentSubject)}`
                        : `Scanned ${spamScanProgress.completed} of ${spamScanProgress.total}`}
                    </div>
                  </div>
                  <div className="text-xs text-rose-200/80">
                    {spamScanProgress.detectedSpamIds.length} flagged
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-rose-400 transition-[width] duration-300"
                    style={{ width: `${spamScanProgressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}
            {isDataLoading ||
            (!hasLoadedInboxItems && pagedInboxItems.length === 0) ? (
              <div className="space-y-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <SkeletonEmailRow key={i} />
                ))}
              </div>
            ) : !isInboxView || replyQueueTab === "threads" ? (
              <EmailWorkList
                items={pagedInboxItems}
                mailboxes={mailboxes}
                projects={data.projects}
                emailRules={data.emailRules}
                onEditRules={() => router.push("/email-rules")}
                onEditAiProfile={() => router.push("/email-ai-lab")}
                selectedId={selectedThreadId}
                freshlyUpdatedIds={freshlyUpdatedInboxIds}
                erroredThreadId={erroredThreadId}
                groupBy={inboxGroupBy}
                deletingIds={deletingThreadIds}
                removingIds={removingThreadIds}
                alwaysShowSummary={alwaysShowSummary}
                alwaysShowExcerpt={alwaysShowExcerpt}
                activeProjectPickerThreadId={inlineProjectPickerThreadId}
                projectSearchQuery={inlineProjectSearchQuery}
                filteredProjects={filteredInlineInboxProjects}
                isProjectActionBusy={busyState === "project"}
                assigningProjectThreadId={assigningProjectThreadId}
                isCreatingProject={isCreatingProject}
                onSelect={handleSelectThread}
                onSenderClick={(sender) => setSenderHistory(sender)}
                onProjectClick={handleProjectPickerOpenForItem}
                onProjectSearchQueryChange={setInlineProjectSearchQuery}
                onProjectPickerSelect={handleInlineProjectPickerSelect}
                onAssignProject={(item) => setAssignProjectItem(item)}
                onSetPriority={(item, priority) =>
                  void handleSetThreadPriority(item, priority)
                }
                priorityColor={currentUser?.priorityColor}
                onCreateRule={(item) => {
                  // Rules live on a category tab, so the builder opens against
                  // the tab in view — or the first one when browsing All — and
                  // the destination can be changed inside the modal.
                  const target =
                    inboxTabs.find((tab) => tab.id === selectedInboxTabId) ||
                    inboxTabs[0];
                  if (!target) return;
                  setDragToTab({ item, targetTab: target, retarget: true });
                }}
                onProjectCreate={(item) =>
                  void handleCreateProject({
                    threadId: item.id,
                    mailboxId: item.mailboxId,
                    query: inlineProjectSearchQuery,
                    closePicker: closeInlineProjectPicker,
                  })
                }
                onProjectPickerClose={closeInlineProjectPicker}
                onForwardAttachment={(item, attachment) => {
                  // One-click forward: seed the outbound composer with a
                  // "Fwd:" subject, a brief forwarded-message note, and the
                  // attachment itself. The composer fetches the attachment
                  // binary from the streaming route and runs it through its
                  // normal upload path, turning it into a real
                  // Supabase-storage draft attachment.
                  const subject = `Fwd: ${formatEmailSubject(item.subject)}`;
                  const fileName = attachment.filename || "attachment";
                  setOutboundComposerInitialDraft({
                    subject,
                    body: "<p><br></p><p>---------- Forwarded message ----------</p>",
                    attachments: [
                      {
                        sourceUrl: attachment.url,
                        name: fileName,
                        mimeType: attachment.contentType,
                      },
                    ],
                  });
                  setIsOutboundComposerOpen(true);
                }}
                onThreadAction={(item, action, options) =>
                  handleInboxItemThreadAction(item, action, options)
                }
                onUnsubscribe={(item) => void handleUnsubscribe(item.id)}
                emptyLabel={
                  isQuarantineView
                    ? "No suspicious email is waiting for review."
                    : isSentView
                      ? "No sent email matches your current filters."
                    : isTrashView
                      ? "Trash is empty."
                      : inboxSearchQuery.trim() ||
                          searchDateFrom ||
                          searchDateTo
                        ? "No email matches your current search."
                        : "No inbox work yet."
                }
              />
            ) : visibleReplyDrafts.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-8 text-center text-sm text-zinc-500">
                No reply drafts in this queue.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleReplyDrafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => handleSelectReplyDraft(draft)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                      selectedReplyDraftId === draft.id
                        ? "border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/10"
                        : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-950/70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">
                          {draft.senderName ||
                            draft.senderEmail ||
                            draft.threadSubject ||
                            "Reply draft"}
                        </div>
                        <div className="truncate text-xs text-zinc-500">
                          {draft.subject ||
                            draft.threadSubject ||
                            "Untitled reply"}
                        </div>
                      </div>
                      <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[10px] uppercase tracking-wide text-zinc-300">
                        {draft.status}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-[11px] text-zinc-500">
                      {draft.projectName ? (
                        <span>{draft.projectName}</span>
                      ) : null}
                      {draft.scheduledFor ? (
                        <span>
                          {new Date(draft.scheduledFor).toLocaleString()}
                        </span>
                      ) : null}
                      {draft.aiMetadata["confidence"] ? (
                        <span>
                          AI{" "}
                          {Math.round(
                            Number(draft.aiMetadata["confidence"]) * 100,
                          )}
                          %
                        </span>
                      ) : null}
                    </div>
                    {draft.aiMetadata["rationale"] ? (
                      <div className="mt-2 line-clamp-2 text-xs text-zinc-400">
                        {String(draft.aiMetadata["rationale"])}
                      </div>
                    ) : null}
                    {draft.lastError ? (
                      <div className="mt-2 text-xs text-red-300">
                        {draft.lastError}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {introBadge}

      <Dialog
        open={isSearchHelpDialogOpen}
        onOpenChange={setIsSearchHelpDialogOpen}
      >
        <DialogContent className="max-h-[92vh] w-[min(96vw,1100px)] max-w-[96vw] overflow-y-auto border-zinc-800 bg-zinc-950 p-0 text-white">
          <div className="border-b border-zinc-800 px-6 py-5">
            <DialogTitle className="text-xl text-white">
              Search Help
            </DialogTitle>
            <DialogDescription className="mt-2 text-zinc-400">
              Plain text hunt everywhere. Prefix text hunt one field. Tiny cave
              brain still find big email.
            </DialogDescription>
            <div className="mt-4 grid gap-2 text-xs text-zinc-400 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                Plain text = broad search
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                Spaces = AND
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                Same field repeated = OR inside field
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                Quotes keep phrase together
              </div>
            </div>
          </div>
          <div className="space-y-3 px-6 py-5">
            {EMAIL_INBOX_SEARCH_HELP_DEFINITIONS.map((definition) => (
              <div
                key={definition.fullPrefix}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">
                        {definition.label}
                      </div>
                      <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[11px] text-zinc-300">
                        {definition.fullPrefix}
                      </div>
                      <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs sm:text-[11px] text-zinc-500">
                        {definition.shortPrefix}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-zinc-400">
                      {definition.description}
                    </div>
                    <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 font-mono text-xs text-[rgb(var(--theme-primary-rgb))]">
                      {definition.example}
                    </div>
                    {definition.tokens?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {definition.tokens.map((token) => (
                          <button
                            key={`${definition.fullPrefix}${token.value}`}
                            type="button"
                            onClick={() =>
                              handleInsertInboxSearchHelp({
                                prefix: definition.fullPrefix,
                                tokenValue: token.value,
                              })
                            }
                            className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-300 transition-colors hover:text-white"
                          >
                            {definition.fullPrefix}
                            {token.value}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleInsertInboxSearchHelp({
                          prefix: definition.fullPrefix,
                        })
                      }
                      className="inline-flex h-9 items-center rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition-colors hover:text-white"
                    >
                      Insert
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyInboxSearchHelp({
                          prefix: definition.fullPrefix,
                          example: definition.example,
                        })
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:text-white"
                      aria-label={`Copy ${definition.label} search example`}
                    >
                      {copiedSearchHelpValue === definition.example ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {spamReviewLoaded && (
        <EmailSpamReviewModal
          open={isSpamReviewOpen}
          onOpenChange={setIsSpamReviewOpen}
          items={inboxItems}
          mailboxes={mailboxes}
          rules={data.emailRules}
          mailboxFilterId={selectedMailboxId}
          onRefresh={onRefresh}
        />
      )}

      <InboxTabModal
        isOpen={inboxTabModalOpen}
        tab={editingInboxTab}
        onClose={() => setInboxTabModalOpen(false)}
        onSaved={(saved) => {
          setInboxTabs((prev) => {
            const exists = prev.some((t) => t.id === saved.id);
            return exists
              ? prev.map((t) => (t.id === saved.id ? saved : t))
              : [...prev, saved];
          });
          setSelectedInboxTabId(saved.id);
        }}
        onDeleted={(tabId) => {
          setInboxTabs((prev) => prev.filter((t) => t.id !== tabId));
          setSelectedInboxTabId((cur) => (cur === tabId ? null : cur));
        }}
      />
      <EmailAssignProjectModal
        open={Boolean(assignProjectItem)}
        item={assignProjectItem}
        projects={data.projects}
        onOpenChange={(open) => {
          if (!open) setAssignProjectItem(null);
        }}
        onAssign={(item, projectId) => {
          handleInlineProjectPickerSelect(item, projectId ?? "");
        }}
      />
      {dragToTab ? (
        <DragToTabModal
          item={dragToTab.item}
          sourceTab={
            inboxTabs.find((t) => t.id === selectedInboxTabId) ?? null
          }
          targetTab={dragToTab.targetTab}
          allowRetarget={dragToTab.retarget}
          allTabs={inboxTabs}
          onClose={() => setDragToTab(null)}
          onSaved={(saved) => {
            const movedThreadId = dragToTab.item.id;
            setInboxTabs((prev) =>
              prev.map((t) => (t.id === saved.id ? saved : t)),
            );
            // Explicitly move the thread into the target tab so it leaves All
            // and any other category tab (exclusive membership).
            setInboxItems((prev) =>
              prev.map((it) =>
                it.id === movedThreadId
                  ? { ...it, inboxTabId: saved.id }
                  : it,
              ),
            );
            inboxSnapshotRef.current = inboxSnapshotRef.current.map((it) =>
              it.id === movedThreadId ? { ...it, inboxTabId: saved.id } : it,
            );
            // Stay on the tab the user is working in. Filing an email is a
            // triage action on the current list, so jumping to the destination
            // tab pulled them away from the queue they were working through.
            setDragToTab(null);
            // Persist the move, THEN refresh. If the assignment fails, surface
            // it instead of silently letting the row snap back on refetch.
            void (async () => {
              try {
                const res = await fetch(
                  `/api/email/threads/${movedThreadId}/inbox-tab`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ tabId: saved.id }),
                  },
                );
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(data?.error || "Failed to move email");
                }
              } catch (error) {
                upsertAlert({
                  id: `move:${movedThreadId}`,
                  type: "error",
                  title: "Couldn't move the email",
                  message:
                    error instanceof Error ? error.message : undefined,
                  duration: 6000,
                });
              }
              void refreshInboxState({ skipMailboxes: true }).catch(() => {});
            })();
          }}
          onEditTab={(tab) => {
            setDragToTab(null);
            setEditingInboxTab(tab);
            setInboxTabModalOpen(true);
          }}
          onTabsChanged={(saved) => {
            setInboxTabs((prev) =>
              prev.map((t) => (t.id === saved.id ? saved : t)),
            );
          }}
        />
      ) : null}
      {quarantineModalItem ? (
        <QuarantineRulesModal
          item={quarantineModalItem}
          emailRules={data.emailRules}
          onClose={() => setQuarantineModalItem(null)}
          onConfirm={async (rule) => {
            const target = quarantineModalItem;
            setQuarantineModalItem(null);
            if (!target) return;
            if (rule) {
              try {
                await fetch("/api/email/rules", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    name: rule.name,
                    matchMode: "all",
                    conditions: [rule.condition],
                    actions: [{ type: "quarantine" }],
                  }),
                });
              } catch {
                // Non-fatal — still quarantine the current email below.
              }
            }
            void handleThreadAction("quarantine", {
              threadId: target.id,
              updateSelectedThread: selectedThreadId === target.id,
              skipQuarantinePrompt: true,
            });
          }}
          onEditRules={() => {
            setQuarantineModalItem(null);
            router.push("/email-rules");
          }}
        />
      ) : null}
      {outboundComposerLoaded && (
        <EmailOutboundComposerModal
          open={isOutboundComposerOpen}
          mailboxes={mailboxes}
          projects={data.projects}
          signatures={emailSignatures}
          onSignaturesChange={setEmailSignatures}
          selectedMailboxId={selectedMailboxId}
          userId={currentUserId}
          initialDraft={outboundComposerInitialDraft}
          onOpenChange={(open) => {
            setIsOutboundComposerOpen(open);
            if (!open) setOutboundComposerInitialDraft(null);
          }}
          onSent={(result) => {
            void handleOutboundComposerSent(result);
          }}
          onScheduled={() => {
            void handleOutboundComposerScheduled();
          }}
          onDraftSaved={() => {
            void handleOutboundComposerDraftSaved();
          }}
        />
      )}

      <Dialog
        open={isRuleEditorOpen}
        onOpenChange={(open) => {
          setIsRuleEditorOpen(open);
          if (!open) {
            setRuleEditorInitialRule(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] w-[min(96vw,1200px)] max-w-[96vw] overflow-y-auto border-zinc-800 bg-zinc-950 p-0 text-white">
          <div className="border-b border-zinc-800 px-6 py-5">
            <DialogTitle className="text-xl text-white">
              Edit Not-Spam Rule
            </DialogTitle>
            <DialogDescription className="mt-2 text-zinc-400">
              Review the generated rule and adjust it before future matching
              messages are allowed out of quarantine.
            </DialogDescription>
          </div>
          <div className="px-6 py-5">
            <EmailRulesPanel
              rules={data.emailRules}
              mailboxes={mailboxes}
              onRefresh={onRefresh}
              initialEditingRule={ruleEditorInitialRule}
              compact
              showHeader={false}
            />
          </div>
        </DialogContent>
      </Dialog>

      {senderHistoryLoaded && (
        <SenderHistoryModal
          open={Boolean(senderHistory)}
          senderName={senderHistory?.name || null}
          senderEmail={senderHistory?.email || null}
          onOpenChange={(open) => {
            if (!open) {
              setSenderHistory(null);
            }
          }}
        />
      )}

      {threadModalLoaded && (
        <EmailThreadModal
          open={threadModalShouldOpen}
          threadId={selectedThreadId}
          freshnessSignal={
            selectedThreadId
              ? (inboxItems.find((item) => item.id === selectedThreadId) ?? null)
              : null
          }
          projects={data.projects}
          hideEmailSignatures={hideEmailSignatures}
          onRefresh={onRefresh}
          onEditTask={onEditTask}
          onForward={(draft) => {
            setOutboundComposerInitialDraft({
              subject: draft.subject,
              body: draft.body,
            });
            setIsThreadModalOpen(false);
            setIsOutboundComposerOpen(true);
          }}
          onUnsubscribe={handleUnsubscribe}
          onOpenChange={setIsThreadModalOpen}
        />
      )}
    </div>
  );
}
