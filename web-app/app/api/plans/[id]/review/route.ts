import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveChain } from "@/lib/ai/model-chains";
import { runStructuredWaterfall } from "@/lib/ai/structured-waterfall";

const SYSTEM_PROMPT = `You are a senior planning reviewer for the Focus Forge project manager.
You are given a plan written in Markdown. Review it and return concise, actionable feedback.
Assess: clarity of the objective, whether steps are concrete and ordered, missing risks or
dependencies, measurable success criteria, and anything ambiguous. Be specific and reference
the plan's own wording. Respond in Markdown with short sections (e.g. "Strengths", "Gaps",
"Suggestions"). Do not rewrite the whole plan unless a section is clearly broken.`;

// POST /api/plans/[id]/review — run the AI provider waterfall over the plan's
// markdown and return review notes. Does NOT modify the plan.
export async function POST(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: plan, error } = await supabase
      .from("plans")
      .select("id,name,content_markdown")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const content = String((plan as any).content_markdown || "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "This plan has no content to review yet." },
        { status: 400 },
      );
    }

    const chain = resolveChain("assistant");

    try {
      const result = await runStructuredWaterfall(chain, {
        systemPrompt: SYSTEM_PROMPT,
        userMessage: `Plan title: ${(plan as any).name}\n\n---\n\n${content}`,
        temperature: 0.3,
      });

      return NextResponse.json({
        review: result.text,
        provider: result.provider,
        model: result.model,
        fallbacks: result.fallbacks,
      });
    } catch (aiError) {
      const msg = aiError instanceof Error ? aiError.message : String(aiError);
      if (msg.includes("No AI provider configured")) {
        return NextResponse.json(
          {
            error:
              "AI review is not configured: set DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, or XAI_API_KEY on the server.",
          },
          { status: 503 },
        );
      }
      const exhausted = /quota|credit|spending limit|balance/i.test(msg);
      return NextResponse.json(
        {
          error: exhausted
            ? "All AI providers are out of credit/quota. Fund one of the accounts to use AI review."
            : "AI review failed. Please try again.",
          detail: msg.slice(0, 500),
        },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error("Failed to review plan:", error);
    return NextResponse.json({ error: "Failed to review plan" }, { status: 500 });
  }
}
