import {
  runStructuredWaterfall,
  type ModelSpec,
} from "@/lib/ai/structured-waterfall";

export type ReorgCandidateProject = {
  id: string;
  name: string;
  description?: string | null;
  organizationName?: string | null;
};

export type ReorgTaskInput = {
  id: string;
  name: string;
  description?: string | null;
};

export type ReorgProposalItem = {
  taskId: string;
  name: string;
  currentProjectId: string;
  suggestedProjectId: string | null;
  suggestedProjectName: string | null;
  reason: string;
  confidence: number;
};

/**
 * Defensively extract a JSON object from a model's raw text. Mirrors the tactic
 * in lib/email-inbox/ai.ts: only OpenAI honours strict json_schema, so the
 * DeepSeek/xAI/Anthropic legs can wrap the object in prose or code fences.
 */
function parseReorgJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to the brace-slice
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  throw new Error("Task reorg model returned invalid JSON");
}

function getReorgSchema() {
  return {
    name: "focus_forge_task_reorg",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        assignments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              taskId: { type: "string" },
              suggestedProjectId: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              reason: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["taskId", "suggestedProjectId", "reason", "confidence"],
          },
        },
      },
      required: ["assignments"],
    },
  };
}

/**
 * Ask the AI waterfall to route each task to the best-fit candidate project.
 * Returns a dry-run proposal — no task is moved here. A suggestion is dropped
 * (suggestedProjectId=null) when the model leaves it, names an unknown project,
 * or names the task's current project.
 */
export async function classifyTasksForReorg(input: {
  tasks: ReorgTaskInput[];
  candidateProjects: ReorgCandidateProject[];
  currentProjectId: string;
  currentProjectName?: string | null;
  chain: ModelSpec[];
}): Promise<ReorgProposalItem[]> {
  const { tasks, candidateProjects, currentProjectId, chain } = input;

  const byId = new Map(candidateProjects.map((p) => [p.id, p]));

  if (tasks.length === 0) {
    return [];
  }
  if (chain.length === 0) {
    throw new Error("No AI provider configured for task reorganization");
  }

  const schema = getReorgSchema();
  const systemPrompt = `You reorganize tasks in Focus: Forge by routing each task to the single best-fit project.
The tasks currently all live in the project named "${input.currentProjectName || currentProjectId}" but many were mis-filed there.
For EACH task, choose the candidateProject whose name/description best matches what the task is actually about, and return its id in suggestedProjectId.
If the task genuinely belongs in its current project, or no candidate is a clearly better fit, return suggestedProjectId: null (leave it where it is).
Only ever return a suggestedProjectId that appears in the candidateProjects list. Never invent an id.
confidence is 0..1: how sure you are the task belongs in the suggested project.
Weigh the task's real subject over incidental keyword overlap — e.g. an infrastructure/billing/notification task about Supabase, Cloudflare, Google Ads, or a SaaS bill does NOT belong in a physical "RV" or property project just because a short word coincidentally matched.

Return ONLY a single JSON object matching this schema (no prose, no code fences):
${JSON.stringify(schema.schema)}`;

  const userMessage = JSON.stringify({
    currentProjectId,
    currentProjectName: input.currentProjectName || null,
    candidateProjects: candidateProjects.map((p) => ({
      id: p.id,
      name: p.name,
      organization: p.organizationName || null,
      description: (p.description || "").slice(0, 200) || null,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      description: (t.description || "").slice(0, 400) || null,
    })),
  });

  const result = await runStructuredWaterfall(chain, {
    systemPrompt,
    userMessage,
    jsonSchema: schema,
    temperature: 0.1,
  });

  const parsed = parseReorgJson(result.text);
  const assignments: any[] = Array.isArray(parsed?.assignments)
    ? parsed.assignments
    : [];
  const assignmentByTask = new Map<string, any>(
    assignments
      .filter((a) => a && typeof a.taskId === "string")
      .map((a) => [a.taskId, a]),
  );

  return tasks.map((task) => {
    const a = assignmentByTask.get(task.id);
    const rawId =
      a && typeof a.suggestedProjectId === "string"
        ? a.suggestedProjectId
        : null;
    // Only honour a suggestion that names a real candidate and actually moves
    // the task somewhere new.
    const suggested =
      rawId && rawId !== currentProjectId && byId.has(rawId) ? rawId : null;
    return {
      taskId: task.id,
      name: task.name,
      currentProjectId,
      suggestedProjectId: suggested,
      suggestedProjectName: suggested ? byId.get(suggested)!.name : null,
      reason: a && typeof a.reason === "string" ? a.reason : "",
      confidence:
        a && Number.isFinite(Number(a.confidence)) ? Number(a.confidence) : 0,
    };
  });
}
