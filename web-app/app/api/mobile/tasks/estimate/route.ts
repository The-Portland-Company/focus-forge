import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { estimateTaskMinutesWithModel } from "@/lib/ai-estimator/server";
import { fetchEstimatorModelChains } from "@/lib/ai-estimator/chains";

/**
 * POST /api/mobile/tasks/estimate
 *
 * Mobile-authed AI task-time estimator. Mirrors the web estimator
 * (app/api/tasks/estimate) but uses mobile PAT/Bearer auth and runs through the
 * requesting user's configured estimator model waterfall (fallback chain).
 *
 * Input: { name (required), description?, projectName?, context?, tags?,
 *          priority?, dueInDays?, subtaskCount? }
 * Output: mobileSuccess({ minutes, confidence, rationale, model })
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        mobileFailure("validation_error", "Invalid JSON body"),
        { status: 400 },
      );
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        mobileFailure("validation_error", "Task name is required"),
        { status: 400 },
      );
    }

    const description =
      typeof body?.description === "string" ? body.description : null;
    // `projectName` is what the estimator consumes; accept `context` too.
    const projectName =
      typeof body?.projectName === "string"
        ? body.projectName
        : typeof body?.context === "string"
          ? body.context
          : null;
    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((t: unknown): t is string => typeof t === "string")
      : undefined;
    const priority =
      typeof body?.priority === "number" ? body.priority : null;
    const dueInDays =
      typeof body?.dueInDays === "number" ? body.dueInDays : null;
    const subtaskCount =
      typeof body?.subtaskCount === "number" ? body.subtaskCount : null;

    const userId = auth.user.id;

    // Resolve the user's persisted estimator chain so the mobile endpoint
    // benefits from the configurable 4-model waterfall fallback behavior.
    const modelChains = await fetchEstimatorModelChains(
      getAdminClient(),
      userId,
    );

    const estimate = await estimateTaskMinutesWithModel({
      name,
      description,
      projectName,
      tags,
      priority,
      dueInDays,
      subtaskCount,
      modelChains,
    });

    return NextResponse.json(
      mobileSuccess({
        minutes: estimate.minutes,
        confidence: estimate.confidence,
        rationale: estimate.rationale ?? null,
        model: estimate.model,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to estimate task", error),
      { status: 500 },
    );
  }
}
