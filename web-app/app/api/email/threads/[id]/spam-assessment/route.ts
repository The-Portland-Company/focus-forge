import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  loadSpamThreadContext,
  runThreadSpamAssessment,
} from "@/lib/spam/assessment-server";

// GET /api/email/threads/[id]/spam-assessment
// Returns the cached assessment, or null when none has been produced. Never
// calls a model — the whole point is that analysis runs only when asked for.
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const { id } = await props.params;
  const context = await loadSpamThreadContext(id);
  if (!context) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ assessment: context.cachedAssessment });
}

// POST /api/email/threads/[id]/spam-assessment
// Runs the assessment and caches it. Body: { force?: boolean } — force re-runs
// after a training conversation so the user sees a fresh verdict rather than
// the one they just argued against.
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const { id } = await props.params;
  const body = await request.json().catch(() => ({}));

  try {
    const context = await loadSpamThreadContext(id);
    if (!context) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const assessment = await runThreadSpamAssessment({
      userId: auth.user.id,
      context,
      force: body?.force === true,
    });

    if (!assessment) {
      return NextResponse.json(
        { error: "The model did not return a usable assessment." },
        { status: 502 },
      );
    }

    return NextResponse.json({ assessment });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to assess the email",
      },
      { status: 500 },
    );
  }
}
