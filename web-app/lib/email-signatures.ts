import type { EmailSignature } from "@/lib/types";

const EMAIL_SIGNATURES_STORAGE_KEY = "focus-forge.email-signatures";

function getStorageKey(userId: string) {
  return `${EMAIL_SIGNATURES_STORAGE_KEY}:${userId}`;
}

export function loadEmailSignatures(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") return [] as EmailSignature[];

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EmailSignature[]) : [];
  } catch {
    return [];
  }
}

export function saveEmailSignatures(
  userId: string | null | undefined,
  signatures: EmailSignature[],
) {
  if (!userId || typeof window === "undefined") return;

  window.localStorage.setItem(
    getStorageKey(userId),
    JSON.stringify(signatures),
  );
}

export function upsertEmailSignature(
  signatures: EmailSignature[],
  nextSignature: EmailSignature,
) {
  const nextSignatures = signatures.map((signature) =>
    signature.id === nextSignature.id ? nextSignature : signature,
  );

  if (!nextSignatures.some((signature) => signature.id === nextSignature.id)) {
    nextSignatures.unshift(nextSignature);
  }

  if (nextSignature.isDefault) {
    return nextSignatures.map((signature) =>
      signature.id === nextSignature.id
        ? signature
        : { ...signature, isDefault: false },
    );
  }

  return nextSignatures;
}

export function deleteEmailSignature(
  signatures: EmailSignature[],
  signatureId: string,
) {
  const remaining = signatures.filter((signature) => signature.id !== signatureId);
  if (remaining.length > 0 && !remaining.some((signature) => signature.isDefault)) {
    remaining[0] = { ...remaining[0], isDefault: true };
  }
  return remaining;
}

export function getApplicableEmailSignatures(
  signatures: EmailSignature[],
  mailboxId: string | null | undefined,
) {
  return signatures.filter((signature) => {
    if (signature.mailboxScope === "all") return true;
    if (!mailboxId) return false;
    return signature.mailboxIds.includes(mailboxId);
  });
}

export function getDefaultEmailSignature(
  signatures: EmailSignature[],
  mailboxId: string | null | undefined,
) {
  const applicable = getApplicableEmailSignatures(signatures, mailboxId);
  return (
    applicable.find((signature) => signature.isDefault) ||
    applicable[0] ||
    null
  );
}

export function createEmptyEmailSignature(
  userId: string,
  overrides?: Partial<EmailSignature>,
): EmailSignature {
  const timestamp = new Date().toISOString();
  return {
    id:
      overrides?.id ||
      `signature-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`,
    userId,
    name: overrides?.name || "",
    content: overrides?.content || "",
    mailboxScope: overrides?.mailboxScope || "all",
    mailboxIds: overrides?.mailboxIds || [],
    isDefault: overrides?.isDefault ?? false,
    createdAt: overrides?.createdAt || timestamp,
    updatedAt: overrides?.updatedAt || timestamp,
  };
}
