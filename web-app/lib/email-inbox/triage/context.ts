import type { EmailRuleContext } from "@/lib/email-inbox/rules";

type AddressLike = { email?: string | null; name?: string | null };

/**
 * Build the deterministic rule-evaluation context from a freshly-parsed
 * provider message (the shape ingest sees), WITHOUT a DB round-trip. The
 * server-side `buildRuleContext` handles the persisted email_messages row shape;
 * this is its ingest-time sibling so Stage 0 can run before the message is even
 * stored.
 */
export function buildRuleContextForMessage(
  mailbox: { email_address?: string | null } | { emailAddress?: string | null },
  message: {
    subject?: string | null;
    bodyText?: string | null;
    body_text?: string | null;
    from?: AddressLike[] | null;
    to?: AddressLike[] | null;
    cc?: AddressLike[] | null;
  },
): EmailRuleContext {
  const senderEmail = String(message.from?.[0]?.email || "")
    .trim()
    .toLowerCase();
  const senderDomain = senderEmail.includes("@")
    ? senderEmail.split("@")[1]
    : "";

  const participants = [
    ...(message.from || []),
    ...(message.to || []),
    ...(message.cc || []),
  ]
    .map((participant) => String(participant?.email || "").toLowerCase())
    .filter(Boolean);

  const mailboxEmail =
    (mailbox as { email_address?: string | null }).email_address ??
    (mailbox as { emailAddress?: string | null }).emailAddress ??
    "";

  return {
    senderEmail,
    senderDomain,
    subject: String(message.subject || ""),
    body: String(message.bodyText ?? message.body_text ?? ""),
    mailbox: String(mailboxEmail || ""),
    participants,
  };
}
