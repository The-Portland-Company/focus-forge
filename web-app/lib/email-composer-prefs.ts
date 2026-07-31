"use client";

// Persists composer defaults per user in localStorage:
//  - the last mailbox ("inbox") chosen, restored as the default next time the
//    composer opens, and
//  - the signature chosen for each mailbox, restored when that mailbox is
//    selected again.

const DEFAULT_MAILBOX_KEY = "focus-forge.composer.default-mailbox";
const MAILBOX_SIGNATURE_KEY = "focus-forge.composer.mailbox-signature";
const CLOSE_ACTION_KEY = "focus-forge.composer.close-action";

/**
 * What happens to an unsent composer when it is closed (X button, click
 * outside, Escape):
 *  - "ask"     — prompt every time (default)
 *  - "draft"   — always save it as an outbound draft
 *  - "discard" — always throw it away
 */
export type ComposerCloseAction = "ask" | "draft" | "discard";

export const COMPOSER_CLOSE_ACTION_OPTIONS: {
  value: ComposerCloseAction;
  label: string;
  description: string;
}[] = [
  {
    value: "ask",
    label: "Ask every time",
    description: "Closing an unsent email asks whether to save it as a draft.",
  },
  {
    value: "draft",
    label: "Always save as draft",
    description: "Closing an unsent email saves it as a draft without asking.",
  },
  {
    value: "discard",
    label: "Always discard",
    description: "Closing an unsent email throws it away without asking.",
  },
];

export function normalizeComposerCloseAction(
  value: string | null | undefined,
): ComposerCloseAction {
  return value === "draft" || value === "discard" ? value : "ask";
}

export function loadComposerCloseAction(
  userId: string | null | undefined,
): ComposerCloseAction {
  if (!userId || typeof window === "undefined") return "ask";
  try {
    return normalizeComposerCloseAction(
      window.localStorage.getItem(userKey(CLOSE_ACTION_KEY, userId)),
    );
  } catch {
    return "ask";
  }
}

export function saveComposerCloseAction(
  userId: string | null | undefined,
  action: ComposerCloseAction,
) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(userKey(CLOSE_ACTION_KEY, userId), action);
  } catch {
    // ignore quota / privacy-mode failures
  }
}

function userKey(base: string, userId: string) {
  return `${base}:${userId}`;
}

export function loadDefaultMailboxId(
  userId: string | null | undefined,
): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(userKey(DEFAULT_MAILBOX_KEY, userId));
  } catch {
    return null;
  }
}

export function saveDefaultMailboxId(
  userId: string | null | undefined,
  mailboxId: string | null,
) {
  if (!userId || typeof window === "undefined") return;
  try {
    if (mailboxId) {
      window.localStorage.setItem(userKey(DEFAULT_MAILBOX_KEY, userId), mailboxId);
    } else {
      window.localStorage.removeItem(userKey(DEFAULT_MAILBOX_KEY, userId));
    }
  } catch {
    // ignore quota / privacy-mode failures
  }
}

function readSignatureMap(
  userId: string,
): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(
      userKey(MAILBOX_SIGNATURE_KEY, userId),
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function loadMailboxSignatureId(
  userId: string | null | undefined,
  mailboxId: string | null | undefined,
): string | null {
  if (!userId || !mailboxId || typeof window === "undefined") return null;
  const map = readSignatureMap(userId);
  return map[mailboxId] ?? null;
}

export function saveMailboxSignatureId(
  userId: string | null | undefined,
  mailboxId: string | null | undefined,
  signatureId: string | null,
) {
  if (!userId || !mailboxId || typeof window === "undefined") return;
  try {
    const map = readSignatureMap(userId);
    if (signatureId) {
      map[mailboxId] = signatureId;
    } else {
      delete map[mailboxId];
    }
    window.localStorage.setItem(
      userKey(MAILBOX_SIGNATURE_KEY, userId),
      JSON.stringify(map),
    );
  } catch {
    // ignore
  }
}
