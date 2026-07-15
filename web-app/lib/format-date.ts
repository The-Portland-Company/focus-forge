/**
 * Universal, dependency-free date formatting used across the app so every
 * date badge honors the user's chosen `date_format` preference.
 *
 * Supported token strings (see DATE_FORMAT_OPTIONS):
 *   MM/DD/YYYY  ->  07/15/2026
 *   DD/MM/YYYY  ->  15/07/2026
 *   YYYY-MM-DD  ->  2026-07-15
 *   MMM D, YYYY ->  Jul 15, 2026
 *   D MMM YYYY  ->  15 Jul 2026
 */

export const DATE_FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (07/15/2026)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (15/07/2026)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-07-15)" },
  { value: "MMM D, YYYY", label: "MMM D, YYYY (Jul 15, 2026)" },
  { value: "D MMM YYYY", label: "D MMM YYYY (15 Jul 2026)" },
];

export const DEFAULT_DATE_FORMAT = "MM/DD/YYYY";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Parse a value into a local-time Date. Date-only strings (YYYY-MM-DD) are
 * parsed as local dates (not UTC) to avoid off-by-one day shifts.
 */
function toDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const str = String(value).trim();
  if (!str) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(str);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function formatDate(
  value: string | Date | null | undefined,
  format: string = DEFAULT_DATE_FORMAT,
): string {
  if (value === null || value === undefined || value === "") return "";
  const date = toDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const monthNum = date.getMonth() + 1;
  const dayNum = date.getDate();
  const mm = String(monthNum).padStart(2, "0");
  const dd = String(dayNum).padStart(2, "0");
  const mmm = MONTHS_SHORT[date.getMonth()];

  switch (format) {
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${mm}-${dd}`;
    case "MMM D, YYYY":
      return `${mmm} ${dayNum}, ${year}`;
    case "D MMM YYYY":
      return `${dayNum} ${mmm} ${year}`;
    case "MM/DD/YYYY":
    default:
      return `${mm}/${dd}/${year}`;
  }
}
