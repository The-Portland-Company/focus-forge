import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  applyThreadAction,
  getThreadDetailForUser,
} from "@/lib/email-inbox/server";
import { writeAuditLog } from "@/lib/audit/log";
import { logEmailAction } from "@/lib/email-inbox/action-log";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const params = await props.params;
    void logEmailAction({
      userId: auth.user.id,
      threadId: params.id,
      action: String(body.action ?? "unknown"),
      phase: "requested",
    });
    const result = await applyThreadAction({
      userId: auth.user.id,
      threadId: params.id,
      action: body.action,
      snoozedUntil: body.snoozedUntil ?? null,
      projectId: body.projectId ?? null,
      classification: body.classification ?? null,
    });
    // Audit destructive thread deletes (best-effort, after the action ran).
    if (body.action === "delete" || body.action === "always_delete_sender") {
      const { data: threadRow } = (await (auth.supabase as any)
        .from("email_threads")
        .select("subject,mailbox_id")
        .eq("id", params.id)
        .maybeSingle()) as {
        data: { subject: string | null; mailbox_id: string | null } | null;
      };
      let organizationId: string | null = null;
      if (threadRow?.mailbox_id) {
        const { data: mailboxRow } = (await (auth.supabase as any)
          .from("mailboxes")
          .select("organization_id")
          .eq("id", threadRow.mailbox_id)
          .maybeSingle()) as {
          data: { organization_id: string | null } | null;
        };
        organizationId = mailboxRow?.organization_id ?? null;
      }
      if (organizationId) {
        await writeAuditLog(auth.supabase, {
          organizationId,
          actorUserId: auth.user.id,
          action: "thread.delete",
          entityType: "thread",
          entityId: params.id,
          metadata: {
            subject: threadRow?.subject ?? null,
            via: body.action,
          },
        });
      }
    }

    if (body.action === "reprocess") {
      const detail = await getThreadDetailForUser(auth.user.id, params.id);
      return NextResponse.json(detail);
    }
    return NextResponse.json(result);
  } catch (error) {
    void logEmailAction({
      userId: auth.user.id,
      threadId: (await props.params).id,
      action: "unknown",
      phase: "error",
      detail: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to apply action",
      },
      { status: 400 },
    );
  }
}
