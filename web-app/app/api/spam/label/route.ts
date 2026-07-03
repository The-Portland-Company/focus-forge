import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { recordSpamLabel } from "@/lib/spam/server";

// POST /api/spam/label
// Records a training label for the private k-NN spam classifier. Backs the
// confirm/correct affordance in the Spam Training tab. (Spam/Not-spam thread
// actions already record labels via /actions; this is the direct path.)
// Body: { text: string, label: "spam" | "not_spam", threadId?, mailboxId?,
//         organizationId?, note? }
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const text = String(body.text || "").trim();
    const label = body.label === "not_spam" ? "not_spam" : body.label === "spam" ? "spam" : null;
    if (!text || !label) {
      return NextResponse.json(
        { error: "text and label ('spam' | 'not_spam') are required" },
        { status: 400 },
      );
    }

    const result = await recordSpamLabel({
      userId: auth.user.id,
      organizationId: body.organizationId ?? null,
      mailboxId: body.mailboxId ?? null,
      threadId: body.threadId ?? null,
      text,
      label,
      note: body.note ?? null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to record spam label",
      },
      { status: 400 },
    );
  }
}
