import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { generateEmailRuleAssistantDraft } from "@/lib/email-inbox/rule-assistant";
import {
  listMailboxesForUser,
  listRulesForUser,
} from "@/lib/email-inbox/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const prompt =
      typeof body?.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json(
        { error: "Enter what you want the rule to do." },
        { status: 400 },
      );
    }

    const [mailboxes, existing] = await Promise.all([
      listMailboxesForUser(auth.user.id),
      listRulesForUser(auth.user.id),
    ]);
    const draft = await generateEmailRuleAssistantDraft({
      prompt,
      mailboxes,
      mailboxId:
        typeof body?.mailboxId === "string" && body.mailboxId.trim()
          ? body.mailboxId
          : null,
      // Show the model the user's active rules (compact) so it can suggest a
      // merge into an existing value family instead of a duplicate.
      existingRules: existing
        .filter((r) => r.isActive)
        .slice(0, 150)
        .map((r) => ({
          id: r.id,
          name: r.name,
          groupKey: r.groupKey ?? null,
          matchMode: r.matchMode,
          conditions: r.conditions,
          actions: r.actions.map((a) => ({ type: a.type })),
        })),
    });

    return NextResponse.json(draft);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate rule draft",
      },
      { status: 400 },
    );
  }
}
