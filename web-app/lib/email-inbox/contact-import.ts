import { parse as parseCsvSync } from "csv-parse/sync";
import type { ContactInput } from "./contacts";

/**
 * Minimal vCard (.vcf) parser covering the fields we care about for contact import:
 * FN (formatted name), N (structured name), EMAIL, TEL. Handles vCard 2.1/3.0/4.0,
 * folded lines (continuation lines starting with a space/tab), and TYPE params.
 * Produces one ContactInput per EMAIL found (a card with multiple emails yields multiple).
 */
export function parseVCards(text: string): ContactInput[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const lines = unfolded.split("\n");
  const contacts: ContactInput[] = [];

  let inCard = false;
  let fn: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let emails: string[] = [];
  let phone: string | null = null;

  const flush = () => {
    for (const email of emails) {
      contacts.push({
        email,
        displayName: fn,
        firstName,
        lastName,
        phone,
        source: "apple",
      });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (upper === "BEGIN:VCARD") {
      inCard = true;
      fn = null;
      firstName = null;
      lastName = null;
      emails = [];
      phone = null;
      continue;
    }
    if (upper === "END:VCARD") {
      if (inCard) flush();
      inCard = false;
      continue;
    }
    if (!inCard) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).trim();
    const keyName = rawKey.split(";")[0].toUpperCase();

    if (keyName === "FN") {
      fn = decodeVCardValue(value) || fn;
    } else if (keyName === "N") {
      // N: Last;First;Middle;Prefix;Suffix
      const parts = decodeVCardValue(value).split(";");
      lastName = (parts[0] || "").trim() || null;
      firstName = (parts[1] || "").trim() || null;
    } else if (keyName === "EMAIL") {
      const email = decodeVCardValue(value).trim().toLowerCase();
      if (email && email.includes("@")) emails.push(email);
    } else if (keyName === "TEL" && !phone) {
      phone = decodeVCardValue(value).trim() || null;
    }
  }

  return contacts;
}

function decodeVCardValue(value: string): string {
  // Handle common quoted-printable and escaped separators lightly.
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

const EMAIL_HEADER_HINTS = ["e-mail", "email", "mail"];
const FIRST_HEADER_HINTS = ["first name", "given name", "first"];
const LAST_HEADER_HINTS = ["last name", "family name", "surname", "last"];
const NAME_HEADER_HINTS = ["name", "display name", "full name"];
const PHONE_HEADER_HINTS = ["phone", "tel", "mobile"];

function matchHeader(headers: string[], hints: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const hint of hints) {
    const idx = lower.findIndex((h) => h === hint);
    if (idx !== -1) return idx;
  }
  for (const hint of hints) {
    const idx = lower.findIndex((h) => h.includes(hint));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parse a CSV export of contacts (Google Contacts CSV, Outlook CSV, or generic).
 * Detects the email/name/phone columns from the header row by fuzzy matching, so it
 * tolerates Google's many "E-mail 1 - Value" style columns.
 */
export function parseContactsCsv(text: string): ContactInput[] {
  const records: string[][] = parseCsvSync(text, {
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });
  if (records.length === 0) return [];

  const headers = records[0];
  const emailIdx = matchHeader(headers, EMAIL_HEADER_HINTS);
  if (emailIdx === -1) return [];
  const firstIdx = matchHeader(headers, FIRST_HEADER_HINTS);
  const lastIdx = matchHeader(headers, LAST_HEADER_HINTS);
  const nameIdx = matchHeader(headers, NAME_HEADER_HINTS);
  const phoneIdx = matchHeader(headers, PHONE_HEADER_HINTS);

  const contacts: ContactInput[] = [];
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const emailRaw = (row[emailIdx] || "").trim();
    if (!emailRaw) continue;
    // Google exports can pack multiple emails in one cell separated by " ::: "
    const emailParts = emailRaw
      .split(/\s*:::\s*|\s*;\s*/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));
    if (emailParts.length === 0) continue;

    const firstName = firstIdx !== -1 ? (row[firstIdx] || "").trim() || null : null;
    const lastName = lastIdx !== -1 ? (row[lastIdx] || "").trim() || null : null;
    const displayName = nameIdx !== -1 ? (row[nameIdx] || "").trim() || null : null;
    const phone = phoneIdx !== -1 ? (row[phoneIdx] || "").trim() || null : null;

    for (const email of emailParts) {
      contacts.push({ email, firstName, lastName, displayName, phone, source: "import" });
    }
  }
  return contacts;
}

/** Dispatch by filename/content: vCard if it looks like one, else CSV. */
export function parseContactsFile(filename: string, content: string): ContactInput[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".vcf") || /BEGIN:VCARD/i.test(content.slice(0, 200))) {
    return parseVCards(content);
  }
  return parseContactsCsv(content);
}
