import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { sendEmailMessage } from "@/lib/email";

// Developer/admin address that bug reports are emailed to. Override via the
// BUG_REPORT_EMAIL env var; otherwise fall back to the project owner.
const BUG_REPORT_EMAIL =
  process.env.BUG_REPORT_EMAIL || "spencerdhill@protonmail.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  let body: {
    error?: unknown;
    threadId?: unknown;
    action?: unknown;
    context?: unknown;
    userAgent?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const errorMessage =
    typeof body.error === "string" && body.error.trim()
      ? body.error.trim()
      : "(no error message provided)";
  const threadId =
    typeof body.threadId === "string" ? body.threadId : "(unknown)";
  const action = typeof body.action === "string" ? body.action : "(unknown)";
  const context =
    typeof body.context === "string" && body.context.trim()
      ? body.context.trim()
      : "Email deletion failure";
  const userAgent =
    typeof body.userAgent === "string" && body.userAgent.trim()
      ? body.userAgent.trim()
      : request.headers.get("user-agent") || "(unknown)";

  const userId = auth.user.id;
  const userEmail = auth.user.email || "(unknown)";
  // Timestamp is generated server-side so it is authoritative and consistent.
  const timestamp = new Date().toISOString();

  const fields: Array<[string, string]> = [
    ["Context", context],
    ["Error", errorMessage],
    ["Thread ID", threadId],
    ["Action", action],
    ["User ID", userId],
    ["User email", userEmail],
    ["Timestamp (UTC)", timestamp],
    ["User agent", userAgent],
  ];

  const text = [
    "A Focus: Forge user hit an error and submitted a bug report from the email inbox.",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e4e4e7; background: #18181b; padding: 24px;">
      <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #ffffff;">Email inbox bug report</h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #a1a1aa;">
        A user hit an error and submitted a bug report from the email inbox.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        ${fields
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding: 6px 12px 6px 0; color: #71717a; vertical-align: top; white-space: nowrap;">${escapeHtml(
              label,
            )}</td>
            <td style="padding: 6px 0; color: #e4e4e7; word-break: break-word;">${escapeHtml(
              value,
            )}</td>
          </tr>`,
          )
          .join("")}
      </table>
    </div>
  `;

  try {
    await sendEmailMessage({
      to: BUG_REPORT_EMAIL,
      subject: `[Focus: Forge] Email delete failed — ${errorMessage.slice(0, 80)}`,
      html,
      text,
    });
  } catch (error) {
    console.error("Failed to send bug report email:", error);
    return NextResponse.json(
      { error: "Failed to send bug report" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
