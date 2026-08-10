import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  continueSpamTraining,
  loadSpamThreadContext,
  saveSpamPolicyFromTraining,
} from "@/lib/spam/assessment-server";
import type { SpamTrainerTurn } from "@/lib/spam/trainer";

/** Accept only well-formed turns; a malformed transcript must not reach a model. */
function parseTurns(value: unknown): SpamTrainerTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const turn = entry as { role?: unknown; content?: unknown };
      const content =
        typeof turn?.content === "string" ? turn.content.trim() : "";
      if (!content) return null;
      return {
        role: turn.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content,
      };
    })
    .filter((turn): turn is SpamTrainerTurn => turn !== null)
    .slice(-24);
}

// POST /api/email/threads/[id]/spam-assessment/train
// Body: { turns: [{role, content}], finalize?: boolean }
//   finalize false/absent → one assistant reply in the conversation
//   finalize true          → condense the conversation into a saved policy
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const { id } = await props.params;
  const body = await request.json().catch(() => ({}));
  const turns = parseTurns(body?.turns);

  if (turns.length === 0) {
    return NextResponse.json(
      { error: "At least one message is required" },
      { status: 400 },
    );
  }

  try {
    const context = await loadSpamThreadContext(id);
    if (!context) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    if (body?.finalize === true) {
      const saved = await saveSpamPolicyFromTraining({
        userId: auth.user.id,
        context,
        turns,
      });
      if (!saved) {
        return NextResponse.json(
          { error: "The model did not produce a usable rule." },
          { status: 502 },
        );
      }
      return NextResponse.json({ policy: saved.policy, id: saved.id });
    }

    const reply = await continueSpamTraining({ context, turns });
    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to reach the model",
      },
      { status: 500 },
    );
  }
}
