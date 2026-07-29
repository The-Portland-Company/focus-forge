import type { InboxItem } from "@/lib/types";

// A user-defined inbox tab: a saved filter defined by rules.
export type InboxTabField =
  | "classification"
  | "known_contact"
  | "sender_email"
  | "sender_domain"
  | "subject"
  | "preview";

export type InboxTabOperator =
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
