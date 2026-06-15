/**
 * Shared email date/time formatter for the inbox and related email views.
 *
 * Renders timestamps in the exact form: "Jan. 1st, 2026 2:01 PM".
 *  - Abbreviated month with a trailing period, except "May" which has none.
 *  - Ordinal day suffix (1st, 2nd, 3rd, 4th … 11th/12th/13th, 21st, 31st).
 *  - 4-digit year, then 12-hour time (no leading zero on the hour),
 *    2-digit minutes, and an uppercase AM/PM marker.
 */

const MONTH_ABBREVIATIONS = [
  "Jan.",
  "Feb.",
  "Mar.",
  "Apr.",
  // "May" is already short enough that it carries no trailing period.
  "May",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sep.",
  "Oct.",
  "Nov.",
  "Dec.",
] as const;

export function getOrdinalDaySuffix(day: number): string {
  const remainderHundred = day % 100;

  // 11th, 12th, 13th are special cases that always take "th".
  if (remainderHundred >= 11 && remainderHundred <= 13) {
    return "th";
  }

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function formatEmailTimestamp(iso?: string | null): string {
  if (!iso) return "";

  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";

  const month = MONTH_ABBREVIATIONS[date.getMonth()];
  const day = date.getDate();
  const ordinal = `${day}${getOrdinalDaySuffix(day)}`;
  const year = date.getFullYear();

  const hours24 = date.getHours();
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month} ${ordinal}, ${year} ${hours12}:${minutes} ${meridiem}`;
}

/**
 * Compact, human-friendly relative-date label for an email timestamp, used by
 * the Conversation Timeline rail: "Today", "Yesterday", "X Days Ago",
 * "1 Week Ago", "X Weeks Ago", "1 Month Ago" … falling back to "X Years Ago".
 * Comparison is by calendar day (local time), not raw elapsed hours.
 */
export function formatRelativeEmailDate(iso?: string | null): string {
  if (!iso) return "";

  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / dayMs);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} Days Ago`;

  const weeks = Math.floor(diffDays / 7);
  if (weeks < 5) return weeks === 1 ? "1 Week Ago" : `${weeks} Weeks Ago`;

  const months = Math.floor(diffDays / 30);
  if (months < 12) return months <= 1 ? "1 Month Ago" : `${months} Months Ago`;

  const years = Math.floor(diffDays / 365);
  return years <= 1 ? "1 Year Ago" : `${years} Years Ago`;
}
