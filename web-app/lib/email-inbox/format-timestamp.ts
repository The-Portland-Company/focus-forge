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
