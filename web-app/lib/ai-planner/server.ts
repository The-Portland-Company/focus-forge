import { PlannerMode, PlannerModelOutput } from "@/lib/ai-planner/types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MODEL_NAME = "gpt-4.1";

function getSystemPrompt(mode: PlannerMode, projectName: string): string {
  const base = `You are an AI project planning assistant for a task management app.
Project: ${projectName}

Rules:
- Ask clarifying questions first when requirements are incomplete.
- Be concrete, implementation-oriented, and realistic.
- Think deeply about web development scope, architecture, sequencing, and delivery risks.
- Output JSON only matching the provided schema.
- Never include markdown code fences.
- Keep assistantMessage concise but clear.
- missingInfo should contain concrete missing data points.
- readiness must be one of: needs_clarification, draft_ready, ready_for_execution.`;

  if (mode === "clarify") {
    return `${base}
Mode: clarify
Focus on identifying missing requirements and asking sharp follow-up questions.`;
  }

  if (mode === "draft_plan") {
    return `${base}
Mode: draft_plan
Return a robust plan draft with:
- objectives
- scope (in/out)
- architecture decisions
- milestones with acceptance criteria
- risks with mitigations`;
  }

  return `${base}
Mode: finalize_tasks
Return an executable task blueprint organized into lists with tasks and subtasks.
Include dependencies and estimates on each task where known.`;
}

function getResponseSchema() {
  return {
    name: "ai_project_planner_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        assistantMessage: { type: "string" },
        readiness: {
          type: "string",
          enum: ["needs_clarification", "draft_ready", "ready_for_execution"],
        },
        missingInfo: {
          type: "array",
          items: { type: "string" },
        },
        planDraft: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                overview: { type: "string" },
                objectives: { type: "array", items: { type: "string" } },
                scope: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    in: { type: "array", items: { type: "string" } },
                    out: { type: "array", items: { type: "string" } },
                  },
                  required: ["in", "out"],
                },
                architecture: { type: "array", items: { type: "string" } },
                milestones: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      outcome: { type: "string" },
                      acceptanceCriteria: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                    required: ["name", "outcome", "acceptanceCriteria"],
                  },
                },
                risks: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      risk: { type: "string" },
                      mitigation: { type: "string" },
                    },
                    required: ["risk", "mitigation"],
                  },
                },
              },
              required: [
                "title",
                "overview",
                "objectives",
                "scope",
                "architecture",
                "milestones",
                "risks",
              ],
            },
          ],
        },
        taskBlueprint: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: { type: "string" },
                lists: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      description: { type: "string" },
                      tasks: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            name: { type: "string" },
                            description: { type: "string" },
                            priority: {
                              type: "integer",
                              enum: [1, 2, 3, 4],
                            },
                            dependencies: {
                              type: "array",
                              items: { type: "string" },
                            },
                            estimate: { type: "string" },
                            subtasks: {
                              type: "array",
                              items: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                  name: { type: "string" },
                                  description: { type: "string" },
                                },
                                required: ["name"],
                              },
                            },
                          },
                          required: ["name"],
                        },
                      },
                    },
                    required: ["name", "tasks"],
                  },
                },
              },
              required: ["lists"],
            },
          ],
        },
      },
      required: [
        "assistantMessage",
        "readiness",
        "missingInfo",
        "planDraft",
        "taskBlueprint",
      ],
    },
  };
}

export async function runPlannerModel(input: {
  mode: PlannerMode;
  projectName: string;
  conversation: ChatMessage[];
}): Promise<PlannerModelOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: getResponseSchema(),
        },
        messages: [
          {
            role: "system",
            content: getSystemPrompt(input.mode, input.projectName),
          },
          ...input.conversation.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError = `OpenAI request failed (${response.status}): ${errorText}`;
      continue;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      lastError = "OpenAI response missing JSON content";
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = "OpenAI returned invalid JSON";
      continue;
    }

    if (!parsed?.assistantMessage || !Array.isArray(parsed?.missingInfo)) {
      lastError = "Planner response failed schema validation";
      continue;
    }

    return {
      assistantMessage: parsed.assistantMessage,
      readiness: parsed.readiness,
      missingInfo: parsed.missingInfo,
      planDraft: parsed.planDraft ?? undefined,
      taskBlueprint: parsed.taskBlueprint ?? undefined,
    };
  }

  throw new Error(lastError || "Planner model request failed");
}
