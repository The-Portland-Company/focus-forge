import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { estimateTaskMinutesWithModel } from "@/lib/ai-estimator/server";
import { fetchEstimatorModelChains } from "@/lib/ai-estimator/chains";
import { isRecoverableProviderError } from "@/lib/ai/structured-waterfall";
import { modelLabel } from "@/lib/ai/model-chains";

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

    // When earlier models in the chain were skipped (e.g. out of credits),
    // tell the client which model actually produced the estimate and why we
    // fell back, so the UI can surface it (e.g. "GPT-4.1 (OpenAI) is out of
    // credits — analyzed with Claude Opus 4.8 (Anthropic) instead.").
    const usedLabel = modelLabel(estimate.model);
    const billingFallback = estimate.fallbacks.find((f) => f.billing);
    let notice: string | null = null;
    if (billingFallback) {
      notice =
        `${modelLabel(billingFallback.model)} is out of credits — ` +
        `analyzed with ${usedLabel} instead.`;
    } else if (estimate.fallbacks.length > 0) {
      notice =
        `${modelLabel(estimate.fallbacks[0].model)} was unavailable — ` +
        `analyzed with ${usedLabel} instead.`;
    }

    return NextResponse.json(
      mobileSuccess({
        minutes: estimate.minutes,
        confidence: estimate.confidence,
        rationale: estimate.rationale ?? null,
        model: estimate.model,
        modelLabel: usedLabel,
        notice,
      }),
      { status: 200 },
    );
  } catch (error) {
    // Surface the REAL underlying error server-side. A raw Error object passed
    // as `details` serializes to `{}` (Error fields are non-enumerable), which
    // is why this endpoint previously returned an opaque `details:{}` 500 and
    // hid the actual cause (e.g. a missing/failing provider key).
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("[mobile/tasks/estimate] estimate failed:", message, error);

    // No usable AI provider configured for this user's model chain → 503 with a
    // specific, client-friendly message instead of a generic internal_error.
    if (
      message.includes("No AI provider configured") ||
      message.startsWith("All AI models in the chain failed")
    ) {
      const billing = isRecoverableProviderError(message);
      return NextResponse.json(
        mobileFailure(
          billing ? "estimator_unavailable" : "estimator_not_configured",
          billing
            ? "The AI estimator is temporarily unavailable (provider quota or billing). Please try again later or enter an estimate manually."
            : "The AI estimator is not configured. An AI provider API key (OpenAI, Anthropic, or xAI) must be set on the server.",
          { reason: message },
        ),
        { status: 503 },
      );
    }

    return NextResponse.json(
      mobileFailure("internal_error", "Failed to estimate task", {
        reason: message,
      }),
      { status: 500 },
    );
  }
}
