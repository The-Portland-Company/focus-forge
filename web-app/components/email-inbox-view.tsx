"use client";

import Image from "next/image";
import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  ArrowUpDown,
  BellRing,
  Bot,
  Check,
  CircleHelp,
  ChevronDown,
  Copy,
  Expand,
  ExternalLink,
  FileText,
  FolderSearch,
  GripVertical,
  ImageIcon,
  Loader2,
  Mail,
  MailPlus,
  MailCheck,
  MailOpen,
  Paperclip,
  Plus,
  Radar,
  RefreshCw,
  Search,
  SendHorizontal,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
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
import { EmailRulesPanel } from "@/components/email-rules-panel";
import { EmailSignatureContent } from "@/components/email-signature-content";
import { EmailSpamReviewModal } from "@/components/email-spam-review-modal";
import { EmailThreadAttachments } from "@/components/email-thread-attachments";
import { EmailThreadModal } from "@/components/email-thread-modal";
import { SenderHistoryModal } from "@/components/sender-history-modal";
import { Tooltip } from "@/components/tooltip";
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
  getQueuedThreadActionMessage,
  getThreadActionLabel,
  requiresThreadActionConfirmation,
  type ThreadAction,
} from "@/lib/email-inbox/thread-actions";
import {
  formatReplyAttachmentSize,
  isInlineAttachmentEligible,
  type EmailReplyAttachment,
} from "@/lib/email-reply";
import { hasRichTextContent, richTextToPlainText } from "@/lib/rich-text";
import { useUserPreferences, useUserProfile } from "@/lib/supabase/hooks";
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
import { cn } from "@/lib/utils";

type EmailInboxViewProps = {
  view: string;
  data: Database;
  onRefresh: () => Promise<void> | void;
  currentUserId?: string;
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
const EMAIL_DETAIL_PANEL_DEFAULT_WIDTH = 380;
const EMAIL_DETAIL_PANEL_MIN_WIDTH = 320;
const EMAIL_DETAIL_PANEL_MAX_WIDTH = 720;
const EMAIL_LIST_PANEL_MIN_WIDTH = 520;
const EMAIL_DETAIL_PANEL_STORAGE_KEY =
  "focus-forge.email-inbox.detail-panel-width";
const EMAIL_INBOX_FILTER_BAR_STORAGE_KEY =
  "focus-forge.email-inbox.filter-bar-collapsed";
const DOCK_BADGE_EVENT_NAME = "focus-forge:dock-badge-count-change";
const APP_TITLE = "Focus: Forge";

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

export function normalizeDockBadgeCount(count: number) {
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }

  return Math.floor(count);
}

export function getDockBadgeDocumentTitle(count: number, appTitle = APP_TITLE) {
  const normalizedCount = normalizeDockBadgeCount(count);
  return normalizedCount > 0 ? `(${normalizedCount}) ${appTitle}` : appTitle;
}

function publishDockBadgeCount(count: number) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedCount = normalizeDockBadgeCount(count);
  const badgingNavigator = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  if (normalizedCount > 0) {
    void badgingNavigator.setAppBadge?.(normalizedCount);
  } else {
    void badgingNavigator.clearAppBadge?.();
  }

  if (typeof document !== "undefined") {
    document.title = getDockBadgeDocumentTitle(normalizedCount);
  }

  window.dispatchEvent(
    new CustomEvent(DOCK_BADGE_EVENT_NAME, {
      detail: { count: normalizedCount },
    }),
  );

  const nativeWindow = window as Window & {
    electronAPI?: {
      setDockBadgeCount?: (count: number) => void;
    };
    focusForgeDesktop?: {
      setDockBadgeCount?: (count: number) => void;
    };
    webkit?: {
      messageHandlers?: {
        setDockBadgeCount?: {
          postMessage?: (payload: { count: number }) => void;
        };
      };
    };
  };

  nativeWindow.focusForgeDesktop?.setDockBadgeCount?.(normalizedCount);
  nativeWindow.electronAPI?.setDockBadgeCount?.(normalizedCount);
  nativeWindow.webkit?.messageHandlers?.setDockBadgeCount?.postMessage?.({
    count: normalizedCount,
  });
}

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
  const base = params.inboxItems.filter((item) => {
    if (
      params.selectedMailboxId !== "all" &&
      item.mailboxId !== params.selectedMailboxId
    ) {
      return false;
    }

    if (params.view === "email-quarantine") {
      return item.status === "quarantine";
    }

    if (params.view === "email-trash") {
      return item.status === "deleted";
    }

    if (item.status === "deleted") {
      return false;
    }

    if (item.status === "quarantine") {
      return params.retainedSpamThreadIds.includes(item.id);
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
  const normalizedQuery = params.query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return params.items;
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  const matchesWordPrefix = (value: string, queryToken: string) => {
    const normalizedValue = value.toLocaleLowerCase();
    const compactWords = normalizedValue.split(/[^a-z0-9@._+-]+/i);

    return compactWords.some((word) => word.startsWith(queryToken));
  };

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

    return queryTokens.every((queryToken) => {
      if (queryToken.length <= 1) {
        return primaryFields.some((value) => matchesWordPrefix(value, queryToken));
      }

      const searchableFields = [...primaryFields, ...secondaryFields];
      return searchableFields.some((value) =>
        value.toLocaleLowerCase().includes(queryToken),
      );
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

function getInboxItemReceivedTime(item: InboxItem) {
  const timestamp =
    item.latestInboundAt || item.latestMessageAt || item.createdAt;
  const parsed = Date.parse(timestamp || "");

  return Number.isNaN(parsed) ? 0 : parsed;
}

function getInboxItemSenderSortValue(item: InboxItem) {
  const sender = getPrimarySenderParticipant(item.participants);

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
    getInboxItemReceivedTime(left) - getInboxItemReceivedTime(right);

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

export function EmailInboxView({
  view,
  data,
  onRefresh,
  currentUserId,
}: EmailInboxViewProps) {
  const isInboxView = view === "email-inbox";
  const isTrashView = view === "email-trash";
  const isQuarantineView = view === "email-quarantine";
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [mailboxes, setMailboxes] = useState(data.mailboxes);
  const [inboxItems, setInboxItems] = useState(data.inboxItems);
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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
  const [inboxSearchQuery, setInboxSearchQuery] = useState("");
  const [isFilterBarCollapsed, setIsFilterBarCollapsed] = useState(false);
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
  const [isReplyDragActive, setIsReplyDragActive] = useState(false);
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement | null>(null);
  const replyAttachmentsRef = useRef<ComposerAttachment[]>([]);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const queuedActionTimeoutRef = useRef<number | null>(null);
  const inboxSnapshotRef = useRef<InboxItem[]>(data.inboxItems);
  const mailboxesRef = useRef<Mailbox[]>(data.mailboxes);
  const refreshInboxStateRef = useRef<
    | ((options?: { allowBrowserNotifications?: boolean }) => Promise<void>)
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
  const { profile } = useUserProfile();
  const { preferences } = useUserPreferences();
  const deleteUndoSeconds = clampEmailDeleteUndoSeconds(
    profile?.email_delete_undo_seconds,
  );

  const filteredInboxItems = useMemo(
    () =>
      filterInboxItemsForView({
        inboxItems,
        selectedMailboxId,
        filterTab: inboxFilterTab,
        retainedSpamThreadIds,
        view,
      }),
    [
      inboxItems,
      inboxFilterTab,
      retainedSpamThreadIds,
      selectedMailboxId,
      view,
    ],
  );
  const searchedInboxItems = useMemo(
    () =>
      filterInboxItemsBySearchQuery({
        items: filteredInboxItems,
        query: inboxSearchQuery,
        mailboxes,
        projects: data.projects,
      }),
    [data.projects, filteredInboxItems, inboxSearchQuery, mailboxes],
  );
  const visibleInboxItems = useMemo(
    () => sortInboxItemsForView(searchedInboxItems, sortBy),
    [searchedInboxItems, sortBy],
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

  useEffect(() => {
    publishDockBadgeCount(isEmailInboxView(view) ? unreadInboxCount : 0);

    return () => {
      publishDockBadgeCount(0);
    };
  }, [unreadInboxCount, view]);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedWidth = window.localStorage.getItem(
      EMAIL_DETAIL_PANEL_STORAGE_KEY,
    );

    if (!storedWidth) {
      return;
    }

    const parsedWidth = Number.parseInt(storedWidth, 10);
    const containerWidth = splitContainerRef.current?.clientWidth ?? 1120;

    setDetailPanelWidth(
      clampEmailDetailPanelWidth(parsedWidth, containerWidth),
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      EMAIL_DETAIL_PANEL_STORAGE_KEY,
      String(detailPanelWidth),
    );
  }, [detailPanelWidth]);

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

  const updateDetailPanelWidth = (nextWidth: number) => {
    const containerWidth = splitContainerRef.current?.clientWidth ?? 1120;

    setDetailPanelWidth(clampEmailDetailPanelWidth(nextWidth, containerWidth));
  };

  const handleDetailPanelResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!splitContainerRef.current) {
      return;
    }

    event.preventDefault();

    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const containerBounds =
        splitContainerRef.current?.getBoundingClientRect();

      if (!containerBounds) {
        return;
      }

      updateDetailPanelWidth(containerBounds.right - moveEvent.clientX);
    };

    const handlePointerUp = () => {
      document.body.classList.remove("cursor-col-resize");
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
    };

    document.body.classList.add("cursor-col-resize");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  const handleOpenThreadWindow = () => {
    if (!selectedThreadId || typeof window === "undefined") {
      return;
    }

    window.open(
      buildEmailThreadPopoutUrl(window.location.href, selectedThreadId),
      `email-thread-${selectedThreadId}`,
      "popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes",
    );
  };

  const handleSelectThread = (item: InboxItem) => {
    setSelectedThreadId(item.id);

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
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Failed to mark thread as read",
        );
        void refreshInboxStateRef.current?.();
      });
  };

  const handleSelectReplyDraft = (draft: EmailReplyDraft) => {
    setReplyQueueTab("reply_queue");
    setSelectedThreadId(draft.threadId);
    applyDraftToComposer(draft);
  };

  const applyInboxSnapshot = (params: {
    nextMailboxes: Mailbox[];
    nextItems: InboxItem[];
    allowBrowserNotifications?: boolean;
  }) => {
    if (
      params.allowBrowserNotifications &&
      browserNotificationPermission === "granted"
    ) {
      listNewInboxItemsForNotification({
        previousItems: inboxSnapshotRef.current,
        nextItems: params.nextItems,
      }).forEach((item) => {
        dispatchBrowserNotification(item);
      });
    }

    inboxSnapshotRef.current = params.nextItems;
    mailboxesRef.current = params.nextMailboxes;
    setMailboxes(params.nextMailboxes);
    setInboxItems(params.nextItems);
    setQuarantineCount(
      params.nextItems.filter((item) => item.status === "quarantine").length,
    );
  };

  useEffect(() => {
    replyAttachmentsRef.current = replyAttachments;
  }, [replyAttachments]);

  useEffect(() => {
    return () => {
      if (queuedActionTimeoutRef.current !== null) {
        window.clearTimeout(queuedActionTimeoutRef.current);
      }
      replyAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, []);

  useEffect(() => {
    inboxSnapshotRef.current = data.inboxItems;
    mailboxesRef.current = data.mailboxes;
    setMailboxes(data.mailboxes);
    setInboxItems(data.inboxItems);
    setQuarantineCount(
      data.inboxItems.filter((item) => item.status === "quarantine").length,
    );
  }, [data.inboxItems, data.mailboxes]);

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

    window.localStorage.setItem(
      EMAIL_INBOX_FILTER_BAR_STORAGE_KEY,
      isFilterBarCollapsed ? "1" : "0",
    );
  }, [isFilterBarCollapsed]);

  useEffect(() => {
    void refreshReplyDraftState().catch((error) => {
      setStatusMessage(
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
    if (
      !selectedThreadId ||
      !visibleInboxItems.some((item) => item.id === selectedThreadId)
    ) {
      setSelectedThreadId(visibleInboxItems[0].id);
    }
  }, [selectedThreadId, view, visibleInboxItems]);

  useEffect(() => {
    if (!selectedThreadId || !isEmailInboxView(view)) return;
    let cancelled = false;
    setLoadingThread(true);
    fetch(`/api/email/threads/${selectedThreadId}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load thread");
        }
        if (!cancelled) {
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
          setStatusMessage(
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

  const updateStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2400);
  };

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
  }) => {
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
    });
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
      return now - lastSyncedAt >= mailbox.syncFrequencyMinutes * 60 * 1000;
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

  useEffect(() => {
    if (!isEmailInboxView(view)) return;

    void (async () => {
      try {
        const result = await syncDueMailboxes(mailboxesRef.current);
        if (result.syncedMailboxCount > 0 || result.changedThreadCount > 0) {
          await refreshInboxStateRef.current?.({
            allowBrowserNotifications: true,
          });
        }
      } catch {
        // Keep automatic refresh silent while the user is working in the inbox.
      }
    })();

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const result = await syncDueMailboxes(mailboxesRef.current);
          if (result.syncedMailboxCount > 0 || result.changedThreadCount > 0) {
            await refreshInboxStateRef.current?.({
              allowBrowserNotifications: true,
            });
          }
        } catch {
          // Keep polling silent while the user is working in the inbox.
        }
      })();
    }, BROWSER_NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [view]);

  const handleBrowserNotificationTest = async () => {
    const currentPermission = getBrowserNotificationPermission();
    if (currentPermission === "unsupported") {
      updateStatus("Browser notifications are not supported here.");
      return;
    }

    let nextPermission = currentPermission;

    if (nextPermission === "default") {
      nextPermission = await window.Notification.requestPermission();
      setBrowserNotificationPermission(nextPermission);
    } else {
      setBrowserNotificationPermission(nextPermission);
    }

    if (nextPermission === "denied") {
      updateStatus("Browser notifications are blocked in this browser.");
      return;
    }

    if (nextPermission !== "granted") {
      updateStatus("Browser notifications were not enabled.");
      return;
    }

    const testItem = visibleInboxItems[0] || inboxItems[0] || null;

    if (testItem) {
      dispatchBrowserNotification(testItem);
    } else {
      new window.Notification("Email Inbox", {
        body: "Browser notifications are enabled for Focus Forge.",
        tag: "email-inbox-browser-test",
      });
    }

    updateStatus("Browser notification sent.");
  };

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
      void refreshInboxState().catch(() => {
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

  const handleThreadAction = async (
    action: ThreadAction,
    options?: {
      threadId?: string | null;
      updateSelectedThread?: boolean;
    },
  ) => {
    const threadId = options?.threadId ?? selectedThreadId;
    if (!threadId) return;

    const shouldUpdateSelectedThread = options?.updateSelectedThread ?? true;
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

    setBusyState(action);
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

      void refreshInboxState().catch(() => {
        // Keep the optimistic state instead of blocking the UI on a slow refresh.
      });

      updateStatus(`Applied ${action.replace(/_/g, " ")}.`);
    } catch (error) {
      if (changedOptimistically) {
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

  const handleInboxItemThreadAction = async (
    item: InboxItem,
    action: ThreadAction,
  ) => {
    await handleThreadAction(action, {
      threadId: item.id,
      updateSelectedThread: selectedThreadId === item.id,
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
        refreshInboxState(),
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
    setStatusMessage(getQueuedThreadActionMessage(action, undoSeconds));
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
    setBusyState("project");
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
      await refreshInboxState();
      if (selectedThreadId === threadId) {
        setSelectedThread(payload);
      }
      updateStatus("Project assigned.");
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to assign project",
      );
    } finally {
      setBusyState(null);
    }
  };

  const closeProjectPicker = () => {
    setIsProjectPickerOpen(false);
    setProjectSearchQuery("");
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
      await refreshInboxState();
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
      await refreshInboxState();
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
      <EmailRulesPanel
        rules={data.emailRules}
        mailboxes={mailboxes}
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
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
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
                  className="rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busyState === "profile" ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </div>
          </div>
        </div>
        {statusMessage ? (
          <div className="text-sm text-zinc-400">{statusMessage}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {isQuarantineView
              ? "Quarantine"
              : isTrashView
                ? "Trash"
                : "Email Inbox"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isQuarantineView
              ? "Review suspected spam and decide what Fluid should do next."
              : isTrashView
                ? "Review deleted threads and permanently empty the selected trash mailbox."
                : "Email threads are pre-processed and rendered as work items."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isTrashView ? (
            isEmptyTrashConfirmVisible ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleEmptyTrashPermanently()}
                  disabled={busyState === "empty_trash"}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-800/60 bg-red-950/50 px-3 text-sm font-medium text-red-100 transition-colors hover:border-red-700 hover:text-white disabled:opacity-50"
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
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
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
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 text-sm font-medium text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
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
          <Tooltip
            content={
              browserNotificationPermission === "granted"
                ? "Send Test Alert"
                : browserNotificationPermission === "denied"
                  ? "Alerts Blocked"
                  : "Enable Alerts"
            }
            className="w-auto"
            side="bottom"
          >
            <button
              type="button"
              onClick={handleBrowserNotificationTest}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
              aria-label={
                browserNotificationPermission === "granted"
                  ? "Send Test Alert"
                  : browserNotificationPermission === "denied"
                    ? "Alerts Blocked"
                    : "Enable Alerts"
              }
            >
              <BellRing className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="AI + Spam" className="w-auto" side="bottom">
            <button
              type="button"
              onClick={() => setIsSpamReviewOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-theme-gradient text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              aria-label={selectedMailboxId === "all" ? "Sync All" : "Sync"}
            >
              {busyState === "sync" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {visibleSyncError ? (
        <div className="rounded-xl border border-amber-900/70 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          {visibleSyncError}
        </div>
      ) : null}

      {showMailboxForm ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-white">
                {isEditingMailbox ? "Update Mailbox" : "Connect Mailbox"}
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                {isEditingMailbox
                  ? "Replace the mailbox password with a new App Password, then save to reconnect."
                  : "Add a new mailbox connection for Fluid to sync and process."}
              </div>
            </div>
            <button
              type="button"
              onClick={closeMailboxForm}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              className="rounded-lg bg-[rgb(var(--theme-primary-rgb))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
        </div>
      ) : null}

      <div
        ref={splitContainerRef}
        className={getEmailInboxSplitClassName()}
        style={splitLayoutStyle}
      >
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                <div className="inline-flex items-center gap-2">
                  {isQuarantineView ? (
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                  ) : isTrashView ? (
                    <Trash2 className="h-4 w-4 text-red-300" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </div>
                {!isQuarantineView ? (
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium">
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
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {isQuarantineView ? (
                  <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                    {quarantineCount} quarantined
                  </div>
                ) : isTrashView ? (
                  <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                    {trashedThreadCount} in trash
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mb-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300">
                    <Search className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">
                      Search & Filters
                    </div>
                    <div className="text-xs text-zinc-500">
                      Search sender, subject, project, preview, or mailbox.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {inboxSearchQuery.trim() ? (
                    <div className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/35 bg-[rgb(var(--theme-primary-rgb))]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgb(var(--theme-primary-rgb))]">
                      {visibleInboxItems.length} match
                      {visibleInboxItems.length === 1 ? "" : "es"}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setIsFilterBarCollapsed((current) => !current)
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-300 transition-colors hover:text-white"
                    aria-expanded={!isFilterBarCollapsed}
                    aria-label={
                      isFilterBarCollapsed
                        ? "Expand search and filters"
                        : "Collapse search and filters"
                    }
                  >
                    {isFilterBarCollapsed ? "Show" : "Hide"}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isFilterBarCollapsed ? "" : "rotate-180",
                      )}
                    />
                  </button>
                </div>
              </div>
              {!isFilterBarCollapsed ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)_minmax(240px,0.9fr)]">
                    <div className="relative">
                      <FloatingFieldLabel label="Search inbox" />
                      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <div className="pointer-events-none absolute left-9 top-1/2 z-10 h-5 w-px -translate-y-1/2 bg-zinc-700" />
                      <Input
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
                    <div className="relative">
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
                    <div className="relative">
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
                  {!isQuarantineView ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isInboxView ? (
                          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950/70 p-1">
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
                                    ? "rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white"
                                    : "rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
                                }
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {!isInboxView || replyQueueTab === "threads" ? (
                          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950/70 p-1">
                            {[
                              { id: "all", label: "All" },
                              { id: "unread", label: "Unread" },
                              { id: "read", label: "Read" },
                              ...(!isTrashView
                                ? [{ id: "spam", label: "Spam" }]
                                : []),
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() =>
                                  setInboxFilterTab(
                                    tab.id as EmailInboxFilterTab,
                                  )
                                }
                                className={
                                  inboxFilterTab === tab.id
                                    ? tab.id === "unread"
                                      ? "rounded-lg border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/12 px-3 py-1.5 text-sm font-medium text-[rgb(var(--theme-primary-rgb))]"
                                      : tab.id === "spam"
                                        ? "rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm font-medium text-red-200"
                                        : tab.id === "read"
                                          ? "rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm font-medium text-zinc-200"
                                          : "rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white"
                                    : "rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
                                }
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950/70 p-1">
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
                                    ? "rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white"
                                    : "rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
                                }
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="inline-flex items-center gap-2">
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
                  ) : null}
                </div>
              ) : null}
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
            {!isInboxView || replyQueueTab === "threads" ? (
              <EmailWorkList
                items={visibleInboxItems}
                mailboxes={mailboxes}
                projects={data.projects}
                selectedId={selectedThreadId}
                alwaysShowSummary={alwaysShowSummary}
                alwaysShowExcerpt={alwaysShowExcerpt}
                activeProjectPickerThreadId={inlineProjectPickerThreadId}
                projectSearchQuery={inlineProjectSearchQuery}
                filteredProjects={filteredInlineInboxProjects}
                isProjectActionBusy={busyState === "project"}
                isCreatingProject={isCreatingProject}
                onSelect={handleSelectThread}
                onSenderClick={(sender) => setSenderHistory(sender)}
                onProjectClick={handleProjectPickerOpenForItem}
                onProjectSearchQueryChange={setInlineProjectSearchQuery}
                onProjectPickerSelect={handleInlineProjectPickerSelect}
                onProjectCreate={(item) =>
                  void handleCreateProject({
                    threadId: item.id,
                    mailboxId: item.mailboxId,
                    query: inlineProjectSearchQuery,
                    closePicker: closeInlineProjectPicker,
                  })
                }
                onProjectPickerClose={closeInlineProjectPicker}
                onThreadAction={(item, action) =>
                  handleInboxItemThreadAction(item, action)
                }
                emptyLabel={
                  isQuarantineView
                    ? "No suspicious email is waiting for review."
                    : isTrashView
                      ? "Trash is empty."
                      : inboxSearchQuery.trim()
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
                      <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                        {draft.status}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
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

        <div className="relative hidden xl:flex items-stretch justify-center">
          <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-zinc-800" />
          <button
            type="button"
            onPointerDown={handleDetailPanelResizeStart}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                updateDetailPanelWidth(detailPanelWidth + 24);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                updateDetailPanelWidth(detailPanelWidth - 24);
              }
            }}
            className="group relative z-10 my-16 inline-flex w-3 items-center justify-center rounded-full bg-transparent text-zinc-600 outline-none transition-colors hover:text-zinc-300 focus-visible:text-zinc-200"
            aria-label="Resize thread details panel"
            title="Resize thread details panel"
            role="separator"
            aria-orientation="vertical"
          >
            <span className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 rounded-full bg-transparent group-hover:bg-zinc-800/80 group-focus-visible:bg-zinc-800/80" />
            <GripVertical className="relative z-10 h-4 w-4" />
          </button>
        </div>

        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          {loadingThread ? (
            <div className="flex min-h-[420px] items-center justify-center text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : selectedThread ? (
            <div className="min-w-0 space-y-5">
              <div className="border-b border-zinc-800 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
                    <div
                      className={getEmailReadStateBadgeClassName(
                        selectedThread.isUnread,
                      )}
                    >
                      {getEmailReadStateLabel(selectedThread.isUnread)}
                    </div>
                    {shouldShowStatusBadge(selectedThread) &&
                    getInboxReviewBadgeLabel(selectedThread) ? (
                      <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                        {getInboxReviewBadgeLabel(selectedThread)}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
                    {isTrashView ? null : isQuarantineView ? (
                      <>
                        <Tooltip
                          content="Mark Not Spam"
                          className="w-auto"
                          side="top"
                        >
                          <button
                            type="button"
                            onClick={() => void handleMarkThreadNotSpam()}
                            disabled={
                              Boolean(busyState) || Boolean(queuedAction)
                            }
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/15 disabled:opacity-50"
                            aria-label="Mark not spam"
                            title="Mark not spam"
                          >
                            {busyState === "spam_exception" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            <span>Not Spam</span>
                          </button>
                        </Tooltip>
                        {renderThreadActionButton("approve", {
                          label: "Approve",
                          icon: getThreadActionButtonIcon("approve"),
                        })}
                      </>
                    ) : (
                      renderThreadActionButton("quarantine", {
                        icon: getThreadActionButtonIcon("quarantine"),
                      })
                    )}
                    {isTrashView
                      ? null
                      : renderThreadActionButton("archive", {
                          icon: getThreadActionButtonIcon("archive"),
                        })}
                    {isTrashView
                      ? null
                      : renderThreadActionButton("spam", {
                          icon: getThreadActionButtonIcon("spam"),
                        })}
                    {isTrashView
                      ? null
                      : renderThreadActionButton("delete", {
                          icon: getThreadActionButtonIcon("delete"),
                          destructive: true,
                        })}
                  </div>
                </div>
                <div className="mt-4 min-w-0 space-y-3">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="inline-flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">
                        {formatEmailSubject(selectedThread.subject)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEmailHtmlRenderMode((current) =>
                          current === "preserve" ? "simplified" : "preserve",
                        )
                      }
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                    >
                      {getEmailHtmlRenderModeToggleLabel(emailHtmlRenderMode)}
                    </button>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-300">
                    {selectedThreadShowsSecondaryActionTitle &&
                    selectedThread.actionTitle ? (
                      <div className="mb-3 flex items-start gap-2 break-words text-[13px] italic text-zinc-400">
                        <Tooltip
                          content="AI Summary"
                          className="w-auto shrink-0"
                          side="bottom"
                        >
                          <span className="inline-flex">
                            <Bot className="mt-0.5 h-3.5 w-3.5 text-zinc-400" />
                          </span>
                        </Tooltip>
                        <span className="min-w-0 break-words">
                          {selectedThread.actionTitle}
                        </span>
                      </div>
                    ) : null}
                    {selectedThreadPrimaryEntry?.contentHtml ||
                    selectedThreadPrimaryEntry?.content ? (
                      <EmailSignatureContent
                        html={selectedThreadPrimaryEntry?.contentHtml}
                        text={selectedThreadPrimaryEntry?.content}
                        contentKind={
                          selectedThreadPrimaryEntry?.type === "internal_note"
                            ? "rich_text"
                            : "email"
                        }
                        hideSignatures={hideEmailSignatures}
                        renderMode={emailHtmlRenderMode}
                        contentClassName="break-words text-sm leading-6 text-zinc-200"
                        signatureClassName="break-words text-sm leading-6 text-zinc-200 opacity-90"
                      />
                    ) : (
                      <div className="break-words text-sm text-zinc-400">
                        {selectedThread.summaryText ||
                          selectedThread.previewText ||
                          "No message body available yet."}
                      </div>
                    )}
                    <EmailThreadAttachments
                      attachments={selectedThreadPrimaryAttachments}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div ref={projectPickerRef} className="relative pt-2">
                  <FloatingFieldLabel label="Project" />
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      ref={projectSearchInputRef}
                      type="text"
                      value={projectSearchQuery}
                      onFocus={() => setIsProjectPickerOpen(true)}
                      onChange={(event) => {
                        setProjectSearchQuery(event.target.value);
                        setIsProjectPickerOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          closeProjectPicker();
                          return;
                        }

                        if (
                          event.key === "Enter" &&
                          filteredInboxProjects.length > 0
                        ) {
                          event.preventDefault();
                          handleProjectPickerSelect(
                            filteredInboxProjects[0].id,
                          );
                        }
                      }}
                      placeholder="Search projects..."
                      disabled={busyState === "project" || isCreatingProject}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 pl-10 pr-10 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setIsProjectPickerOpen((current) => !current)
                      }
                      className="absolute inset-y-0 right-3 inline-flex items-center text-zinc-500 transition-colors hover:text-zinc-300"
                      aria-label="Toggle project search"
                    >
                      {busyState === "project" || isCreatingProject ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isProjectPickerOpen ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </button>
                  </div>
                  {isProjectPickerOpen ? (
                    <div className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
                      <div className="border-b border-zinc-700/80 bg-zinc-900/80 px-3 py-2">
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                          Current Project
                        </div>
                        <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-300">
                          {selectedProject ? (
                            <>
                              <div
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: selectedProject.color,
                                }}
                              />
                              <span className="truncate">
                                {selectedProject.name}
                              </span>
                            </>
                          ) : (
                            <span className="truncate">No Project</span>
                          )}
                        </div>
                      </div>
                      {filteredInboxProjects.length > 0 ? (
                        filteredInboxProjects.map((project) => {
                          const isSelected = project.id === selectedProjectId;
                          return (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() =>
                                handleProjectPickerSelect(project.id)
                              }
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                isSelected
                                  ? "bg-[rgb(var(--theme-primary-rgb))]/15 text-white"
                                  : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                              }`}
                            >
                              <div
                                className="h-3 w-3 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              <span className="flex-1 truncate">
                                {project.name}
                              </span>
                              {isSelected ? (
                                <Check className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-zinc-500">
                          No matching projects
                        </div>
                      )}
                      {projectSearchQuery.trim() ? (
                        <button
                          type="button"
                          onClick={() => void handleCreateProject()}
                          disabled={isCreatingProject}
                          className="flex w-full items-center gap-2 border-t border-zinc-700 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-50"
                        >
                          {isCreatingProject ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          <span className="truncate">
                            Add New Project &quot;{projectSearchQuery.trim()}
                            &quot;
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleGenerateTasks}
                    disabled={busyState === "tasks"}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                  >
                    <FolderSearch className="h-4 w-4" />
                    Generate Tasks
                  </button>
                </div>
              </div>

              {!isTrashView ? (
                <div className="flex justify-end pt-1">
                  {pendingConfirmAction === "delete" ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => queueThreadAction("delete")}
                        disabled={Boolean(busyState) || Boolean(queuedAction)}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-800/60 bg-red-950/50 px-3 py-2 text-sm font-medium text-red-100 transition-colors hover:border-red-700 hover:text-white disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingConfirmAction(null)}
                        disabled={Boolean(busyState) || Boolean(queuedAction)}
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleActionButtonClick("delete")}
                      disabled={Boolean(busyState) || Boolean(queuedAction)}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:border-red-800 hover:text-white disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Email
                    </button>
                  )}
                </div>
              ) : null}

              {queuedAction && isQueuedActionNoticeVisible ? (
                <div className="flex items-center gap-3 rounded-xl border border-[rgb(var(--theme-primary-rgb))]/30 bg-[rgb(var(--theme-primary-rgb))]/10 px-3 py-2 text-sm text-zinc-200">
                  <span>
                    {getQueuedThreadActionMessage(
                      queuedAction,
                      queuedAction === "delete"
                        ? deleteUndoSeconds
                        : DEFAULT_THREAD_ACTION_QUEUE_SECONDS,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleUndoQueuedAction}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:border-zinc-600"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissQueuedAction}
                    className="rounded-md border border-zinc-700/80 bg-transparent px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

              {selectedThread.linkedTasks?.length > 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                    Linked Tasks
                  </div>
                  <div className="space-y-2">
                    {selectedThread.linkedTasks.map((task: any) => (
                      <div
                        key={task.id}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300"
                      >
                        {task.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="mb-3 flex items-center justify-end gap-2">
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setReplyStyleOverrideEnabled((current) => !current)
                      }
                      className={cn(
                        "inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors",
                        replyStyleOverrideEnabled
                          ? "border-theme-primary bg-zinc-800 text-white"
                          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-white",
                      )}
                    >
                      AI Style Override
                    </button>
                    <Tooltip content="Generate AI reply" className="w-auto">
                      <button
                        type="button"
                        onClick={() => void handleGenerateAiReply()}
                        disabled={Boolean(busyState) || !selectedThreadId}
                        title="Generate AI reply"
                        aria-label="Generate AI reply"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {busyState === "reply_ai" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip>
                    <Tooltip content="Modal popout" className="w-auto">
                      <button
                        type="button"
                        onClick={() => setIsThreadModalOpen(true)}
                        disabled={!selectedThreadId}
                        title="Open thread in modal"
                        aria-label="Open thread in modal"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Expand className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Separate window" className="w-auto">
                      <button
                        type="button"
                        onClick={handleOpenThreadWindow}
                        disabled={!selectedThreadId}
                        title="Open thread in separate window"
                        aria-label="Open thread in separate window"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Mark read" className="w-auto">
                      <button
                        type="button"
                        onClick={() => void handleThreadAction("mark_read")}
                        disabled={
                          Boolean(busyState) || !selectedThread.isUnread
                        }
                        title={
                          selectedThread.isUnread
                            ? "Mark thread as read"
                            : "Thread already read"
                        }
                        aria-label={
                          selectedThread.isUnread
                            ? "Mark thread as read"
                            : "Thread already read"
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {busyState === "mark_read" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MailCheck className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedReplyDraft ? (
                      <div className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-400">
                        {selectedReplyDraft.source === "ai" ? "AI" : "Draft"} /{" "}
                        {selectedReplyDraft.status}
                      </div>
                    ) : null}
                    <div className="relative pt-2">
                      <FloatingFieldLabel label="Reply Mode" />
                      <Select
                        value={replyMode}
                        onValueChange={(value) =>
                          setReplyMode(value as "reply_all" | "internal_note")
                        }
                      >
                        <SelectTrigger className="h-9 w-[180px] border-zinc-700 bg-zinc-900 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reply_all">Reply All</SelectItem>
                          <SelectItem value="internal_note">
                            Internal Note
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                {replyStyleOverrideEnabled ? (
                  <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
                      Reply Style Override
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-300">
                          Conciseness
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {EMAIL_REPLY_CONCISENESS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setReplyStyleOverrides((current) => ({
                                  ...current,
                                  conciseness: option.value,
                                }))
                              }
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                replyStyleOverrides.conciseness === option.value
                                  ? "border-theme-primary bg-zinc-800 text-white"
                                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-300">
                          Tone
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {EMAIL_REPLY_TONE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setReplyStyleOverrides((current) => ({
                                  ...current,
                                  tone: option.value,
                                }))
                              }
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                replyStyleOverrides.tone === option.value
                                  ? "border-theme-primary bg-zinc-800 text-white"
                                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-zinc-300">
                          Personality
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {EMAIL_REPLY_PERSONALITY_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setReplyStyleOverrides((current) => ({
                                  ...current,
                                  personality: option.value,
                                }))
                              }
                              className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                replyStyleOverrides.personality === option.value
                                  ? "border-theme-primary bg-zinc-800 text-white"
                                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                <input
                  ref={replyFileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleReplyFileInputChange}
                />
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsReplyDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (
                      !event.currentTarget.contains(event.relatedTarget as Node)
                    ) {
                      setIsReplyDragActive(false);
                    }
                  }}
                  onDrop={(event) => void handleReplyEditorDrop(event)}
                  className={cn(
                    "rounded-xl border transition-colors",
                    isReplyDragActive
                      ? "border-[rgb(var(--theme-primary-rgb))]/60 bg-[rgb(var(--theme-primary-rgb))]/10"
                      : "border-transparent",
                  )}
                >
                  <div className="relative">
                    <RichTextEditor
                      value={replyContent}
                      onChange={setReplyContent}
                      placeholder={
                        replyMode === "internal_note"
                          ? "Write an internal note for linked Forge tasks…"
                          : "Reply to all participants…"
                      }
                      minHeightClassName="min-h-[160px] pb-16"
                    />
                    <Tooltip content="Send now" className="w-auto">
                      <button
                        type="button"
                        onClick={handleReply}
                        disabled={
                          busyState === "reply" ||
                          busyState === "reply_upload" ||
                          !hasRichTextContent(replyContent)
                        }
                        className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-theme-gradient text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {busyState === "reply" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <SendHorizontal className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
                    <Tooltip content="Add attachments" className="w-auto">
                      <button
                        type="button"
                        onClick={() => replyFileInputRef.current?.click()}
                        disabled={busyState === "reply_upload"}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                      >
                        {busyState === "reply_upload" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Paperclip className="h-4 w-4" />
                        )}
                      </button>
                    </Tooltip>
                    <div className="text-xs text-zinc-500">
                      Drag and drop files here, or use the attachment button.
                    </div>
                    {replyMode === "reply_all" ? (
                      <>
                        <div className="relative ml-auto min-w-[220px] flex-1 pt-2 sm:max-w-[280px]">
                          <FloatingFieldLabel label="Send Later" />
                          <input
                            type="datetime-local"
                            value={scheduledReplyAt}
                            onChange={(event) =>
                              setScheduledReplyAt(event.target.value)
                            }
                            className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleScheduleReply()}
                          disabled={
                            busyState === "reply_schedule" ||
                            busyState === "reply_upload" ||
                            !hasRichTextContent(replyContent)
                          }
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
                        >
                          {busyState === "reply_schedule" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MailPlus className="h-4 w-4" />
                          )}
                          <span>Schedule</span>
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                {replyMode === "reply_all" && replyAttachments.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {replyAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                      >
                        <div className="mt-0.5 text-zinc-400">
                          {attachment.isImage ? (
                            <ImageIcon className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-zinc-100">
                            {attachment.name}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {formatReplyAttachmentSize(attachment.sizeBytes)}
                          </div>
                          {attachment.isImage && attachment.previewUrl ? (
                            <Image
                              src={attachment.previewUrl}
                              alt={attachment.name}
                              width={160}
                              height={112}
                              unoptimized
                              className="mt-2 max-h-28 w-auto rounded-lg border border-zinc-800 object-contain"
                            />
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {isInlineAttachmentEligible(attachment) ? (
                            <Tooltip
                              content={
                                attachment.inline
                                  ? "Send as attachment only"
                                  : "Include inline in email"
                              }
                              className="w-auto"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  handleReplyAttachmentInlineToggle(
                                    attachment.id,
                                  )
                                }
                                className={cn(
                                  "inline-flex rounded-md border px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors",
                                  attachment.inline
                                    ? "border-[rgb(var(--theme-primary-rgb))]/45 bg-[rgb(var(--theme-primary-rgb))]/10 text-[rgb(var(--theme-primary-rgb))]"
                                    : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white",
                                )}
                              >
                                Inline
                              </button>
                            </Tooltip>
                          ) : null}
                          <Tooltip
                            content="Remove attachment"
                            className="w-auto"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleReplyAttachmentRemove(attachment.id)
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {replyMode === "reply_all" ? (
                  <div className="mt-3">
                    <div className="relative">
                      <FloatingFieldLabel label="Signature" />
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={signatureSearchQuery}
                          onFocus={() => setIsSignaturePickerOpen(true)}
                          onChange={(event) => {
                            setSignatureSearchQuery(event.target.value);
                            setIsSignaturePickerOpen(true);
                          }}
                          placeholder={
                            selectedSignature
                              ? selectedSignature.name
                              : applicableSignatures.length > 0
                                ? "Type to search signatures..."
                                : "Create a signature in Settings"
                          }
                          disabled={applicableSignatures.length === 0}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-10 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setIsSignaturePickerOpen((current) => !current)
                          }
                          disabled={applicableSignatures.length === 0}
                          className="absolute inset-y-0 right-3 inline-flex items-center text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50"
                          aria-label="Toggle signature search"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              isSignaturePickerOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>
                      {isSignaturePickerOpen &&
                      applicableSignatures.length > 0 ? (
                        <div className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
                          {filteredApplicableSignatures.length > 0 ? (
                            filteredApplicableSignatures.map((signature) => (
                              <button
                                key={signature.id}
                                type="button"
                                onClick={() => {
                                  setSelectedSignatureId(signature.id);
                                  setSignatureSearchQuery(signature.name);
                                  setIsSignaturePickerOpen(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                  selectedSignatureId === signature.id
                                    ? "bg-[rgb(var(--theme-primary-rgb))]/15 text-white"
                                    : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
                                }`}
                              >
                                <div className="truncate font-medium">
                                  {signature.name}
                                </div>
                                <div className="truncate text-xs text-zinc-500">
                                  {signature.content}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-zinc-500">
                              No matching signatures
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
                  Conversation
                </div>
                <div className="space-y-3">
                  {selectedThreadConversationEntries.map((entry: any) => {
                    const entryAuthorEmail =
                      entry.authorEmail?.toLowerCase().trim() || null;
                    const currentUserEmail =
                      currentUser?.email?.toLowerCase().trim() || null;
                    const isCurrentUserEntry = Boolean(
                      currentUserEmail &&
                      entryAuthorEmail &&
                      entryAuthorEmail === currentUserEmail,
                    );

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "rounded-2xl border p-3",
                          isCurrentUserEntry
                            ? "border-zinc-800/80 bg-zinc-900/35"
                            : "border-zinc-800 bg-zinc-900/60",
                        )}
                      >
                        <div
                          className={cn(
                            "flex items-start gap-3",
                            isCurrentUserEntry && "justify-end",
                          )}
                        >
                          <div
                            className={cn(
                              "min-w-0 flex-1",
                              isCurrentUserEntry && "text-right",
                            )}
                          >
                            <div
                              className={getConversationEntryHeaderClassName(
                                isCurrentUserEntry,
                              )}
                            >
                              {isCurrentUserEntry ? (
                                <>
                                  <div className="shrink-0 pt-0.5 text-xs text-zinc-500">
                                    {new Date(entry.createdAt).toLocaleString()}
                                  </div>
                                  <div className="min-w-0 max-w-[65%]">
                                    <div className="truncate text-sm font-medium text-zinc-100">
                                      {getEmailActorName(
                                        entry.authorName,
                                        entry.authorEmail,
                                      )}
                                    </div>
                                    {entry.authorEmail &&
                                    entry.authorEmail !== entry.authorName ? (
                                      <div className="truncate text-xs text-zinc-500">
                                        {entry.authorEmail}
                                      </div>
                                    ) : null}
                                  </div>
                                  <EmailActorAvatar
                                    name={entry.authorName}
                                    email={entry.authorEmail}
                                  />
                                </>
                              ) : (
                                <>
                                  <EmailActorAvatar
                                    name={entry.authorName}
                                    email={entry.authorEmail}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-zinc-100">
                                      {getEmailActorName(
                                        entry.authorName,
                                        entry.authorEmail,
                                      )}
                                    </div>
                                    {entry.authorEmail &&
                                    entry.authorEmail !== entry.authorName ? (
                                      <div className="truncate text-xs text-zinc-500">
                                        {entry.authorEmail}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="shrink-0 pt-0.5 text-xs text-zinc-500">
                                    {new Date(entry.createdAt).toLocaleString()}
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="mt-3">
                              <EmailSignatureContent
                                html={entry.contentHtml}
                                text={entry.content}
                                contentKind={
                                  entry.type === "internal_note"
                                    ? "rich_text"
                                    : "email"
                                }
                                hideSignatures={hideEmailSignatures}
                                renderMode={emailHtmlRenderMode}
                                contentClassName={cn(
                                  "break-words text-sm leading-6 text-zinc-300",
                                  isCurrentUserEntry && "text-right",
                                )}
                                signatureClassName={cn(
                                  "break-words text-sm leading-6 text-zinc-300 opacity-90",
                                  isCurrentUserEntry && "text-right",
                                )}
                              />
                            </div>
                            <EmailThreadAttachments
                              attachments={getDisplayableThreadAttachments(
                                entry,
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-zinc-500">
              Select an email thread to inspect it.
            </div>
          )}
        </div>
      </div>

      {statusMessage ? (
        <div className="text-sm text-zinc-400">{statusMessage}</div>
      ) : null}

      <EmailSpamReviewModal
        open={isSpamReviewOpen}
        onOpenChange={setIsSpamReviewOpen}
        items={inboxItems}
        mailboxes={mailboxes}
        rules={data.emailRules}
        mailboxFilterId={selectedMailboxId}
        onRefresh={onRefresh}
      />

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

      <EmailThreadModal
        open={isThreadModalOpen && Boolean(selectedThreadId)}
        threadId={selectedThreadId}
        projects={data.projects}
        hideEmailSignatures={hideEmailSignatures}
        onRefresh={onRefresh}
        onOpenChange={setIsThreadModalOpen}
      />
    </div>
  );
}
