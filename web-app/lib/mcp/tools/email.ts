// MCP tool definitions for email — read and triage only.
//
// These wrap the existing server-side email-inbox logic (the same functions
// the app/api/email/** and app/api/mobile/email/** routes call) so an MCP
// client can list mailboxes, read/search threads, and triage them (mark
// read, archive, spam, snooze, move to project). Sending/replying/drafting
// mail is intentionally NOT exposed here — that is a separate, more tightly
// gated capability.
import {
  listMailboxesForUser,
  listInboxItemsForUser,
  getThreadDetailForUser,
  applyThreadAction,
  assignProjectToThread,
} from "@/lib/email-inbox/server";
import type { McpTool, McpToolResult } from "@/lib/mcp/server/types";

export type { McpTool };

// Wraps a handler's plain return value as the MCP tools/call result shape
// (spec 2026-07-28): JSON-serialized text content plus the raw value as
// structuredContent for clients that read it directly.
const toResult = (value: unknown): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value ?? null) }],
  structuredContent: value,
});

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const MAILBOX_ID_SCHEMA = {
  type: "string",
  description:
    "Restrict to a specific mailbox id. Omit to use all mailboxes the user can access.",
};

export const EMAIL_MCP_TOOLS: McpTool[] = [
  {
    name: "list_mailboxes",
    title: "List mailboxes",
    description:
      "List the email mailboxes (inboxes) the current user can access, with provider, display name, and member info.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (_args, ctx) => {
      return toResult(await listMailboxesForUser(ctx.userId));
    },
  },
  {
    name: "list_threads",
    title: "List email threads",
    description:
      "List email threads from Focus Forge's synced inbox, optionally filtered by status, mailbox, or project. Returns Forge's classified/organized view (not a live IMAP read) — use search_threads for a text query across all mail.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Filter by thread status, e.g. 'active', 'archived', 'deleted', 'quarantined'.",
        },
        mailboxId: MAILBOX_ID_SCHEMA,
        projectId: {
          type: "string",
          description: "Restrict to threads linked to this project id.",
        },
      },
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      return toResult(
        await listInboxItemsForUser(ctx.userId, {
          status: optionalString(args?.status),
          mailboxId: optionalString(args?.mailboxId),
          projectId: optionalString(args?.projectId),
        }),
      );
    },
  },
  {
    name: "search_threads",
    title: "Search email threads",
    description:
      "Full-text search across the user's synced email threads (subject, sender, body) across their whole mailbox set, not just recent mail.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search text — matched against subject, sender, and body.",
        },
        mailboxId: MAILBOX_ID_SCHEMA,
        projectId: {
          type: "string",
          description: "Restrict results to threads linked to this project id.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const query = String(args?.query ?? "").trim();
      if (!query) {
        throw new Error("query is required");
      }
      return toResult(
        await listInboxItemsForUser(ctx.userId, {
          search: query,
          mailboxId: optionalString(args?.mailboxId),
          projectId: optionalString(args?.projectId),
        }),
      );
    },
  },
  {
    name: "get_thread",
    title: "Get email thread",
    description:
      "Get the full detail of a single email thread, including its messages, for the current user.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: {
          type: "string",
          description: "The email thread id.",
        },
      },
      required: ["threadId"],
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const threadId = String(args?.threadId ?? "");
      if (!threadId) {
        throw new Error("threadId is required");
      }
      return toResult(await getThreadDetailForUser(ctx.userId, threadId));
    },
  },
  {
    name: "mark_read",
    title: "Mark thread read",
    description:
      "Mark an email thread as read, both in Forge and on the mail provider.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The email thread id." },
      },
      required: ["threadId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      return toResult(
        await applyThreadAction({
          userId: ctx.userId,
          threadId: String(args?.threadId ?? ""),
          action: "mark_read",
        }),
      );
    },
  },
  {
    name: "archive_thread",
    title: "Archive thread",
    description:
      "Archive an email thread, both in Forge and on the mail provider.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The email thread id." },
      },
      required: ["threadId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      return toResult(
        await applyThreadAction({
          userId: ctx.userId,
          threadId: String(args?.threadId ?? ""),
          action: "archive",
        }),
      );
    },
  },
  {
    name: "mark_spam",
    title: "Mark thread as spam",
    description:
      "Mark an email thread as spam, both in Forge and on the mail provider.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The email thread id." },
      },
      required: ["threadId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      return toResult(
        await applyThreadAction({
          userId: ctx.userId,
          threadId: String(args?.threadId ?? ""),
          action: "spam",
        }),
      );
    },
  },
  {
    name: "snooze_thread",
    title: "Snooze thread",
    description:
      "Snooze an email thread until a given time; it reappears in the inbox at that time.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The email thread id." },
        snoozedUntil: {
          type: "string",
          description: "ISO 8601 timestamp to snooze the thread until.",
        },
      },
      required: ["threadId", "snoozedUntil"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const snoozedUntil = args?.snoozedUntil
        ? String(args.snoozedUntil)
        : null;
      if (!snoozedUntil) {
        throw new Error("snoozedUntil is required");
      }
      return toResult(
        await applyThreadAction({
          userId: ctx.userId,
          threadId: String(args?.threadId ?? ""),
          action: "snooze",
          snoozedUntil,
        }),
      );
    },
  },
  {
    name: "move_thread_to_project",
    title: "Move thread to project",
    description: "Assign an email thread to a Focus Forge project.",
    inputSchema: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "The email thread id." },
        projectId: {
          type: "string",
          description: "The project id to assign the thread to.",
        },
      },
      required: ["threadId", "projectId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const threadId = String(args?.threadId ?? "");
      const projectId = String(args?.projectId ?? "");
      if (!threadId || !projectId) {
        throw new Error("threadId and projectId are required");
      }
      return toResult(
        await assignProjectToThread(ctx.userId, threadId, projectId),
      );
    },
  },
];
