/**
 * Compact "x ago" formatter for mailbox last-sync timestamps, e.g. "4m ago".
 * Returns "never" when no (or an invalid) timestamp is supplied so callers can
 * render a defensive label for never-synced / disconnected mailboxes.
 *
 * Buckets: <1m → "just now", <60m → "Nm ago", <24h → "Nh ago", else "Nd ago".
 */
export function formatRelativeSync(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "never";
  const ms = Date.now() - t;
  // Future timestamps (clock skew) read as "just now" rather than negative.
  if (ms < 60000) return "just now";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
