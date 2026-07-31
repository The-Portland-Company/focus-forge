import type { EmailReplyAddress } from "@/lib/types";

/**
 * Helpers shared by the Drafts folder and the composer deep-link, so a stored
 * draft round-trips back into the composer's plain-text recipient fields and
 * `datetime-local` schedule input unchanged.
 */

export function formatComposerRecipients(
  addresses: EmailReplyAddress[] | null | undefined,
): string {
  if (!addresses || addresses.length === 0) return "";
  return addresses
    .map((address) => {
      const name = address.name?.trim();
      return name ? `${name} <${address.email}>` : address.email;
    })
    .filter(Boolean)
    .join(", ");
}

/** ISO timestamp → "YYYY-MM-DDTHH:mm" in local time (empty when unset). */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
