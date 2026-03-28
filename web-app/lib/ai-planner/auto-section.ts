type ExistingSectionInput = {
  id: string;
  name: string;
  description?: string | null;
};

type UnassignedTaskInput = {
  id: string;
  name: string;
  description?: string | null;
};

export type AutoSectionSuggestion = {
  taskId: string;
  targetSectionName: string;
  createSection: boolean;
  reason: string;
};

const MODEL_NAME = "gpt-4.1";
const MAX_TASKS_PER_BATCH = 12;
const MAX_SECTIONS_FOR_CONTEXT = 50;
const MAX_TASK_NAME_CHARS = 160;
const MAX_TASK_DESCRIPTION_CHARS = 280;
const MAX_SECTION_NAME_CHARS = 80;

function getAutoSectionSchema() {
  return {
    name: "auto_section_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        suggestions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              taskId: { type: "string" },
              targetSectionName: { type: "string" },
              createSection: { type: "boolean" },
              reason: { type: "string" },
            },
            required: ["taskId", "targetSectionName", "createSection", "reason"],
          },
        },
      },
      required: ["summary", "suggestions"],
    },
  };
}

function extractTextContent(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          (part as any).type === "text" &&
          "text" in part &&
          typeof (part as any).text === "string"
        ) {
          return (part as any).text;
        }

        return "";
      })
      .join("")
      .trim();

    return text || null;
  }

  return null;
}

function validateSuggestions(
  suggestions: unknown,
  expectedTasks: UnassignedTaskInput[],
): AutoSectionSuggestion[] {
  if (!Array.isArray(suggestions)) {
    throw new Error("OpenAI response missing suggestions");
  }

  const expectedTaskIds = new Set(expectedTasks.map((task) => task.id));
  const seenTaskIds = new Set<string>();
  const parsed = suggestions.map((suggestion) => {
    if (!suggestion || typeof suggestion !== "object") {
      throw new Error("OpenAI returned an invalid task suggestion");
    }

    const taskId = typeof (suggestion as any).taskId === "string" ? (suggestion as any).taskId : "";
    const targetSectionName =
      typeof (suggestion as any).targetSectionName === "string"
        ? (suggestion as any).targetSectionName.trim()
        : "";
    const createSection = Boolean((suggestion as any).createSection);
    const reason = typeof (suggestion as any).reason === "string" ? (suggestion as any).reason : "";

    if (!expectedTaskIds.has(taskId)) {
      throw new Error("OpenAI returned a task suggestion for an unknown task");
    }

    if (seenTaskIds.has(taskId)) {
      throw new Error("OpenAI returned duplicate task suggestions");
    }

    seenTaskIds.add(taskId);

    if (!targetSectionName) {
      throw new Error("OpenAI returned a task suggestion without a target section");
    }

    return {
      taskId,
      targetSectionName,
      createSection,
      reason,
    };
  });

  if (parsed.length !== expectedTasks.length) {
    throw new Error("OpenAI did not evaluate every unassigned task");
  }

  const returnedTaskIds = new Set(parsed.map((suggestion) => suggestion.taskId));
  for (const taskId of expectedTaskIds) {
    if (!returnedTaskIds.has(taskId)) {
      throw new Error("OpenAI skipped one or more unassigned tasks");
    }
  }

  return parsed;
}

function truncateText(value: string | null | undefined, maxChars: number): string {
  const normalized = (value || "").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function chunkTasks(tasks: UnassignedTaskInput[], size: number): UnassignedTaskInput[][] {
  const chunks: UnassignedTaskInput[][] = [];
  for (let index = 0; index < tasks.length; index += size) {
    chunks.push(tasks.slice(index, index + size));
  }
  return chunks;
}

function sanitizeSections(existingSections: ExistingSectionInput[]): ExistingSectionInput[] {
  return existingSections.slice(0, MAX_SECTIONS_FOR_CONTEXT).map((section) => ({
    id: section.id,
    name: truncateText(section.name, MAX_SECTION_NAME_CHARS),
    description: "",
  }));
}

function sanitizeTasks(unassignedTasks: UnassignedTaskInput[]): UnassignedTaskInput[] {
  return unassignedTasks.map((task) => ({
    id: task.id,
    name: truncateText(task.name, MAX_TASK_NAME_CHARS),
    description: truncateText(task.description, MAX_TASK_DESCRIPTION_CHARS),
  }));
}

async function runAutoSectionBatch(input: {
  apiKey: string;
  projectName: string;
  existingSections: ExistingSectionInput[];
  unassignedTasks: UnassignedTaskInput[];
}): Promise<{ summary: string; suggestions: AutoSectionSuggestion[] }> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: getAutoSectionSchema(),
        },
        messages: [
          {
            role: "system",
            content: `You organize unassigned tasks into project sections.
Project: ${input.projectName}

Rules:
- Return JSON only.
- Evaluate every task in this batch.
- Prefer existing sections when they clearly fit.
- Create a new section only when no existing section is a good fit.
- Reuse concise, human project-management section names.
- targetSectionName must be non-empty for every task.
- reason must be one short sentence.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              existingSections: input.existingSections.map((section) => ({
                id: section.id,
                name: section.name,
                description: section.description || "",
              })),
              unassignedTasks: input.unassignedTasks.map((task) => ({
                id: task.id,
                name: task.name,
                description: task.description || "",
              })),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      lastError = `OpenAI request failed (${response.status}): ${await response.text()}`;
      continue;
    }

    const payload = await response.json();
    const content = extractTextContent(payload?.choices?.[0]?.message?.content);

    if (!content) {
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

    try {
      return {
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        suggestions: validateSuggestions(parsed?.suggestions, input.unassignedTasks),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "OpenAI returned invalid suggestions";
      continue;
    }
  }

  throw new Error(lastError || "OpenAI auto-section batch request failed");
}

export async function runAutoSectionModel(input: {
  projectName: string;
  existingSections: ExistingSectionInput[];
  unassignedTasks: UnassignedTaskInput[];
}): Promise<{ summary: string; suggestions: AutoSectionSuggestion[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const sanitizedSections = sanitizeSections(input.existingSections);
  const sanitizedTasks = sanitizeTasks(input.unassignedTasks);
  const taskBatches = chunkTasks(sanitizedTasks, MAX_TASKS_PER_BATCH);
  const summaries: string[] = [];
  const suggestions: AutoSectionSuggestion[] = [];

  for (const batch of taskBatches) {
    const result = await runAutoSectionBatch({
      apiKey,
      projectName: input.projectName,
      existingSections: sanitizedSections,
      unassignedTasks: batch,
    });

    if (result.summary.trim()) {
      summaries.push(result.summary.trim());
    }
    suggestions.push(...result.suggestions);
  }

  return {
    summary:
      summaries[0] ||
      `Organized ${input.unassignedTasks.length} unassigned task${input.unassignedTasks.length === 1 ? "" : "s"} into sections.`,
    suggestions: validateSuggestions(suggestions, sanitizedTasks),
  };
}
