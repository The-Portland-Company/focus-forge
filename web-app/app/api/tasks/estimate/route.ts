import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { estimateTaskMinutes } from "@/lib/ai-estimator/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { retrieveRelevantAIMemory } from "@/lib/ai-memory/retrieval";
import { getLatestActivePlaybook } from "@/lib/ai-memory/playbook";
import {
  buildAIMemoryPromptBlock,
  buildPlaybookPromptBlock,
} from "@/lib/ai-memory/prompt";
import { recordDecisionTrace } from "@/lib/ai-memory/trace";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "Task name is required" },
      { status: 400 },
    );
  }

  const description =
    typeof body?.description === "string" ? body.description : null;

  // Retrieve AI-memory precedents + playbook (best-effort).
  const userId = auth.user.id;
  const memoryInputText = `${name}\n${description ?? ""}`.slice(0, 4000);
  let memoryBlock = "";
  let playbookBlock = "";
  let selectedMemoryIds: string[] = [];
  let selectedPlaybookId: string | null = null;
  try {
    const admin = getAdminClient();
    const [memories, playbook] = await Promise.all([
      retrieveRelevantAIMemory(admin, {
        userId,
        inputText: memoryInputText,
        memoryTypes: ["estimate_judgment"],
      }),
      getLatestActivePlaybook(admin, {
        userId,
        playbookType: "priority_estimation",
      }),
    ]);
    memoryBlock = buildAIMemoryPromptBlock(memories);
    playbookBlock = buildPlaybookPromptBlock(playbook);
    selectedMemoryIds = memories.map((m) => m.id);
    selectedPlaybookId = playbook?.id ?? null;
  } catch (e) {
    console.error("AI-memory retrieval (estimate) failed:", e);
  }

  try {
    const result = await estimateTaskMinutes({
      name,
      description,
      memoryBlock,
      playbookBlock,
    });

    try {
      await recordDecisionTrace(getAdminClient(), {
        userId,
        sourceType: "task",
        aiCallType: "estimate_generation",
        inputText: memoryInputText,
        selectedMemoryIds,
        selectedPlaybookId,
        matchedRuleIds: [],
        promptContextSummary: `${selectedMemoryIds.length} memories`,
        aiOutput: result as unknown as Record<string, unknown>,
        finalOutput: result as unknown as Record<string, unknown>,
        overriddenByRule: false,
        modelProvider: "openai",
        modelName: "gpt-4.1",
      });
    } catch (e) {
      console.error("recordDecisionTrace (estimate) failed:", e);
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to estimate task",
      },
      { status: 500 },
    );
  }
}
