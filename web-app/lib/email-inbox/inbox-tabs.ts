import type { InboxItem } from "@/lib/types";

// A user-defined inbox tab: a saved filter defined by rules.
export type InboxTabField =
  | "classification"
  | "known_contact"
  | "sender_email"
  | "sender_domain"
  | "subject"
  | "preview"
  | "ai_intent";

export type InboxTabOperator =
  | "matches"
  | "is"
  | "contains"
  | "equals"
  | "starts_with"
  | "ends_with";

export interface InboxTabCondition {
  field: InboxTabField;
  operator: InboxTabOperator;
  value: string;
}

export interface InboxTabRules {
  matchMode: "all" | "any";
  conditions: InboxTabCondition[];
}

export interface EmailInboxTab {
  id: string;
  name: string;
  orderIndex: number;
  rules: InboxTabRules;
  isDefault: boolean;
}

export const INBOX_TAB_FIELD_OPTIONS: Array<{
  value: InboxTabField;
  label: string;
}> = [
  { value: "known_contact", label: "From a known contact" },
  { value: "classification", label: "Classification" },
  { value: "sender_email", label: "Sender email" },
  { value: "sender_domain", label: "Sender domain" },
  { value: "subject", label: "Subject" },
  { value: "preview", label: "Body preview" },
  { value: "ai_intent", label: "AI decides" },
];

export const INBOX_TAB_OPERATOR_OPTIONS: Array<{
  value: InboxTabOperator;
  label: string;
}> = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "is", label: "is" },
  { value: "matches", label: "matches" },
];

function senderParticipant(item: InboxItem) {
  return (item.participants || []).find((p) => p.participantRole === "from");
}

function compare(op: InboxTabOperator, haystack: string, needle: string) {
  const h = (haystack || "").toLowerCase();
  const n = (needle || "").toLowerCase();
  if (!n) return false;
  switch (op) {
    case "equals":
    case "is":
      return h === n;
    case "starts_with":
      return h.startsWith(n);
    case "ends_with":
      return h.endsWith(n);
    case "contains":
    default:
      return h.includes(n);
  }
}

/** Public wrapper around a single condition test — used by the drag-to-tab
 *  flow to detect which existing tab conditions already match a dragged item
 *  (rule overlap). */
export function conditionMatchesItem(
  item: InboxItem,
  cond: InboxTabCondition,
): boolean {
  return matchCondition(item, cond);
}

/** The most specific, stable rule that would file a dragged item under a tab:
 *  the exact sender email when known, else the sender domain, else a subject
 *  contains. Returns null when the item carries no usable signal. */
export function deriveTabConditionForItem(
  item: InboxItem,
): InboxTabCondition | null {
  const sender = senderParticipant(item);
  const email = (sender?.emailAddress || "").trim().toLowerCase();
  if (email && email.includes("@")) {
    return { field: "sender_email", operator: "equals", value: email };
  }
  const domain = email.split("@")[1] || "";
  if (domain) {
    return { field: "sender_domain", operator: "equals", value: domain };
  }
  const subject = (item.subject || "").trim();
  if (subject) {
    return { field: "subject", operator: "contains", value: subject };
  }
  return null;
}

/**
 * The value this email would supply for a given rule field. Used by the
 * drag-to-tab modal so switching the field dropdown refills the value from the
 * email in hand instead of leaving the user to retype it. Returns "" for fields
 * that have no sensible per-email value (`known_contact` is a boolean-ish match
 * and `ai_intent` is a free-text question the user writes).
 */
export function deriveTabConditionValueForField(
  item: InboxItem,
  field: InboxTabField,
): string {
  const sender = senderParticipant(item);
  const email = (sender?.emailAddress || "").trim().toLowerCase();

  switch (field) {
    case "sender_email":
      return email;
    case "sender_domain":
      return email.split("@")[1] || "";
    case "subject":
      return (item.subject || "").trim();
    case "preview":
      return (item.previewText || item.summaryText || "").trim();
    case "classification":
      return (item.classification || "").trim();
    default:
      return "";
  }
}

/**
 * The operator that suits a field's autofilled value: an exact match for the
 * short, canonical fields, and `contains` for free text where an exact match
 * would almost never fire.
 */
export function defaultOperatorForField(
  field: InboxTabField,
): InboxTabOperator {
  switch (field) {
    case "sender_email":
    case "sender_domain":
    case "classification":
      return "equals";
    case "subject":
    case "preview":
      return "contains";
    default:
      return "is";
  }
}

/**
 * Stable cache key for an "AI decides" question. Verdicts are stored per
 * (thread, key) on `email_threads.ai_tab_verdicts_json`, so the key must be
 * derived identically on the client and the server: trimmed, collapsed
 * whitespace, lowercased, capped so a runaway paste can't bloat the JSONB.
 */
export const MAX_AI_INTENT_PROMPT_LENGTH = 200;

export function aiIntentKey(prompt: string): string {
  return prompt
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .slice(0, MAX_AI_INTENT_PROMPT_LENGTH);
}

/**
 * Every (thread, AI question) pair that has no cached verdict yet. The inbox
 * sends these to `/api/email/inbox-tabs/ai-evaluate`; until a verdict comes
 * back the condition simply doesn't match, so mail stays where it is rather
 * than flickering between tabs.
 */
export function listUnresolvedAiIntents(
  items: InboxItem[],
  tabs: Array<{ rules: InboxTabRules }>,
): Array<{ threadId: string; prompt: string }> {
  const prompts = new Set<string>();
  for (const tab of tabs) {
    for (const cond of tab.rules?.conditions || []) {
      if (cond.field !== "ai_intent") continue;
      const key = aiIntentKey(cond.value || "");
      if (key) prompts.add(key);
    }
  }
  if (prompts.size === 0) return [];

  const out: Array<{ threadId: string; prompt: string }> = [];
  for (const item of items) {
    for (const prompt of prompts) {
      if (item.aiTabVerdicts?.[prompt] === undefined) {
        out.push({ threadId: item.id, prompt });
      }
    }
  }
  return out;
}

function matchCondition(item: InboxItem, cond: InboxTabCondition): boolean {
  const sender = senderParticipant(item);
  const senderEmail = sender?.emailAddress || "";
  switch (cond.field) {
    case "known_contact":
      return Boolean(sender?.contactId);
    case "classification":
      return (item.classification || "") === (cond.value || "").toLowerCase();
    case "sender_email":
      return compare(cond.operator, senderEmail, cond.value);
    case "sender_domain":
      return compare(
        cond.operator,
        senderEmail.split("@")[1] || "",
        cond.value,
      );
    case "subject":
      return compare(cond.operator, item.subject || "", cond.value);
    case "preview":
      return compare(
        cond.operator,
        `${item.previewText || ""} ${item.summaryText || ""}`,
        cond.value,
      );
    case "ai_intent": {
      // Read-only: matching never calls a model. The verdict was decided once
      // by /api/email/inbox-tabs/ai-evaluate and cached on the thread.
      const key = aiIntentKey(cond.value || "");
      if (!key) return false;
      return item.aiTabVerdicts?.[key] === true;
    }
    default:
      return false;
  }
}

/** True when the item satisfies the tab's rules. Empty rules match nothing. */
export function matchInboxTab(item: InboxItem, rules: InboxTabRules): boolean {
  const conditions = rules?.conditions || [];
  if (conditions.length === 0) return false;
  return rules.matchMode === "all"
    ? conditions.every((c) => matchCondition(item, c))
    : conditions.some((c) => matchCondition(item, c));
}

/**
 * True when a thread belongs in the "All" tab — i.e. it is *unfiled*.
 *
 * A thread is filed either explicitly (dragged onto a tab, `inboxTabId` set) or
 * implicitly (it matches a tab's rules, e.g. a `support@npmjs.com` rule on
 * Transactional). Both count: "All" is the leftovers, not a copy of everything,
 * so filing a sender under a tab removes it from All rather than duplicating it.
 */
export function isUnfiledInboxItem(
  item: InboxItem,
  tabs: Array<{ id: string; rules: InboxTabRules }>,
): boolean {
  if (item.inboxTabId) return false;
  return !tabs.some((tab) => matchInboxTab(item, tab.rules));
}

/**
 * The list a category tab should show.
 *
 * `isSearching` is the important parameter. The "All" pseudo-tab is really
 * "unfiled", so running a search from it used to drop every match that had been
 * filed under Receipts / Newsletters / Transactional / Known Contacts — the
 * query found them, the tab discarded them, and the inbox looked like it had
 * lost mail (a Jul 24 email that was sitting under Receipts the whole time).
 * A search therefore bypasses category filing entirely: you get every match,
 * whichever tab it lives in. Pure helper — unit tested.
 */
export function selectTabFilteredInboxItems<
  T extends { id: string; rules: InboxTabRules },
>(params: {
  items: InboxItem[];
  tabs: T[];
  selectedTabId: string | null;
  isSearching: boolean;
}): InboxItem[] {
  const { items, tabs, selectedTabId, isSearching } = params;
  if (isSearching) return items;

  const tab = tabs.find((candidate) => candidate.id === selectedTabId);
  if (!tab) {
    return items.filter((item) => isUnfiledInboxItem(item, tabs));
  }
  return items.filter((item) =>
    item.inboxTabId
      ? item.inboxTabId === tab.id
      : matchInboxTab(item, tab.rules),
  );
}

// The defaults pre-seeded for every user. "Known Contacts" is first (and the
// UI selects it by default).
export const DEFAULT_INBOX_TABS: Array<{ name: string; rules: InboxTabRules }> = [
  {
    name: "Known Contacts",
    rules: {
      matchMode: "any",
      conditions: [{ field: "known_contact", operator: "is", value: "true" }],
    },
  },
  {
    name: "Transactional",
    rules: {
      matchMode: "any",
      conditions: [
        { field: "classification", operator: "is", value: "transactional" },
      ],
    },
  },
  {
    name: "Receipts",
    rules: {
      matchMode: "any",
      conditions: [
        { field: "subject", operator: "contains", value: "receipt" },
        { field: "subject", operator: "contains", value: "invoice" },
        { field: "subject", operator: "contains", value: "order confirmation" },
        { field: "subject", operator: "contains", value: "payment received" },
      ],
    },
  },
  {
    name: "Newsletters",
    rules: {
      matchMode: "any",
      conditions: [
        { field: "classification", operator: "is", value: "newsletter" },
        { field: "subject", operator: "contains", value: "newsletter" },
        { field: "subject", operator: "contains", value: "digest" },
      ],
    },
  },
  {
    name: "OTPs/2FAs",
    rules: {
      matchMode: "any",
      conditions: [
        { field: "subject", operator: "contains", value: "verification code" },
        { field: "subject", operator: "contains", value: "one-time" },
        { field: "subject", operator: "contains", value: "security code" },
        { field: "subject", operator: "contains", value: "sign-in code" },
        { field: "subject", operator: "contains", value: "2fa" },
        { field: "subject", operator: "contains", value: "otp" },
      ],
    },
  },
];
