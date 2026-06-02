import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { generateEmailRuleAssistantDraft } from "@/lib/email-inbox/rule-assistant";
import { listMailboxesForUser } from "@/lib/email-inbox/server";

// POST /api/mobile/email/rules/assistant
// Mobile Bearer-token mirror of /api/email/rules/assistant (POST). Turns a plain
// English prompt into an editable EmailRuleAssistantDraft (name, scope,
// conditions, actions, rationale, assistantMessage).
// Body: { prompt: string, mailboxId?: string }
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json(
        mobileFailure("validation_error", "Enter what you want the rule to do."),
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

    return NextResponse.json(mobileSuccess(draft), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to generate rule draft", error),
      { status: 400 },
    );
  }
}
