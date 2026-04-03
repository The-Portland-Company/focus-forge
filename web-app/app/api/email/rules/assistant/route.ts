import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { generateEmailRuleAssistantDraft } from "@/lib/email-inbox/rule-assistant";
import { listMailboxesForUser } from "@/lib/email-inbox/server";

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

    const draft = await generateEmailRuleAssistantDraft({
      prompt,
      mailboxes: await listMailboxesForUser(auth.user.id),
      mailboxId:
        typeof body?.mailboxId === "string" && body.mailboxId.trim()
          ? body.mailboxId
          : null,
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
