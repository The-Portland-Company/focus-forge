import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { listInboxItemsForUser } from "@/lib/email-inbox/server";
import type { InboxItem, InboxParticipant } from "@/lib/types";

// Folder -> InboxItem.status / origin mapping mirroring email-inbox-view.tsx.
// The web client fetches all items for the user's mailboxes and filters
// client-side; we mirror that here so the mobile client can request a single
// folder/classification/sort/search slice without over-fetching.
function matchesFolder(item: InboxItem, folder: string): boolean {
  switch (folder) {
    case "inbox":
      return (
        (item.status === "active" || item.status === "needs_project") &&
        item.origin !== "outbound"
      );
    case "quarantine":
      return item.status === "quarantine";
    case "trash":
    case "deleted":
      return item.status === "deleted";
    case "archived":
    case "archive":
      return item.status === "archived";
    case "spam":
      return item.status === "spam";
    case "sent":
      return item.origin === "outbound";
    case "resolved":
      return item.status === "resolved";
    case "all":
    case "":
    default:
      return true;
  }
}

function participantHaystack(participants?: InboxParticipant[]): string {
  if (!participants || participants.length === 0) return "";
  return participants
    .map((p) => `${p.displayName || ""} ${p.emailAddress || ""}`)
    .join(" ");
}

// Basic full-text search (feature #19): sender, subject, preview, mailbox.
// NOTE(inbox-agent): Advanced search syntax (feature #20 — from:, to:, subject:,
// body:, project:, mailbox:, is:, has:, received:, before:, after:, id:, etc.)
// is intentionally NOT implemented here; layer it in the inbox feature when wired.
function matchesSearch(item: InboxItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.subject,
    item.normalizedSubject,
    item.summaryText,
    item.previewText,
    item.actionTitle,
    item.mailboxName,
    item.mailboxEmailAddress,
    participantHaystack(item.participants),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function sortItems(items: InboxItem[], sort: string): InboxItem[] {
  const sorted = [...items];
  const timeOf = (item: InboxItem) =>
    new Date(item.latestMessageAt || item.createdAt).getTime();
  switch (sort) {
    case "oldest":
    case "date_asc":
      return sorted.sort((a, b) => timeOf(a) - timeOf(b));
    case "sender":
      return sorted.sort((a, b) => {
        const fromOf = (item: InboxItem) =>
          (
            item.participants?.find((p) => p.participantRole === "from")
              ?.emailAddress || ""
          ).toLowerCase();
        return fromOf(a).localeCompare(fromOf(b));
      });
    case "subject":
      return sorted.sort((a, b) =>
        (a.subject || "").toLowerCase().localeCompare((b.subject || "").toLowerCase()),
      );
    case "confidence":
      return sorted.sort(
        (a, b) => (b.actionConfidence ?? 0) - (a.actionConfidence ?? 0),
      );
    case "date":
    case "newest":
    case "":
    default:
      return sorted.sort((a, b) => timeOf(b) - timeOf(a));
  }
}

// GET /api/mobile/email/inbox
// Mobile Bearer-token mirror of /api/email/inbox (GET) + presentation-layer
// folder/classification/sort/search filtering the web does client-side.
// Query params: folder, status, mailboxId, projectId, classification, search, sort.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const sp = request.nextUrl.searchParams;
    const folder = sp.get("folder") || "";
    const status = sp.get("status") || undefined;
    const mailboxId = sp.get("mailboxId") || undefined;
    const projectId = sp.get("projectId") || undefined;
    const classification = sp.get("classification") || "";
    const search = sp.get("search") || "";
    const sort = sp.get("sort") || "date";

    // Reuse the exact same business logic the web route uses.
    const allItems = (await listInboxItemsForUser(auth.user.id, {
      status,
      mailboxId,
      projectId,
    })) as InboxItem[];

    let items = allItems;
    if (folder) {
      items = items.filter((item) => matchesFolder(item, folder));
    }
    if (classification && classification !== "all") {
      items = items.filter((item) => item.classification === classification);
    }
    if (search) {
      items = items.filter((item) => matchesSearch(item, search));
    }
    items = sortItems(items, sort);

    return NextResponse.json(
      mobileSuccess(items, {
        count: items.length,
        total: allItems.length,
        folder: folder || "all",
        classification: classification || "all",
        sort,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to load inbox", error),
      { status: 500 },
    );
  }
}
