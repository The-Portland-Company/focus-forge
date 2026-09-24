/**
 * Task-level LLM assignment (tasks.llm_provider / llm_model / llm_effort).
 * Which provider, model and reasoning effort an AI agent should use when it
 * picks up a task. All optional; null = "unassigned, use the agent's default".
 */
export const LLM_EFFORT_LEVELS = ["low", "medium", "high", "max"] as const;
export type LlmEffort = (typeof LLM_EFFORT_LEVELS)[number];

export const LLM_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google (Gemini)" },
  { id: "xai", label: "xAI (Grok)" },
  { id: "typesafe", label: "TypeSafe (Jev)" },
  { id: "other", label: "Other" },
] as const;
export type LlmProviderId = (typeof LLM_PROVIDERS)[number]["id"];

/** Suggested models per provider. Free text is always allowed on top. */
export const LLM_MODEL_SUGGESTIONS: Record<string, { id: string; label: string }[]> = {
  anthropic: [
    { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
    { id: "o3", label: "o3" },
  ],
  google: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  xai: [{ id: "grok-4", label: "Grok 4" }],
  typesafe: [{ id: "jev-latest", label: "Jev (latest)" }],
  other: [],
};

export const isLlmEffort = (value: unknown): value is LlmEffort =>
  typeof value === "string" && (LLM_EFFORT_LEVELS as readonly string[]).includes(value);

/** Trim + lowercase + null-if-empty. Throws on an invalid effort level. */
export const normalizeLlmAssignment = (input: {
  llm_provider?: unknown;
  llm_model?: unknown;
  llm_effort?: unknown;
}) => {
  const clean = (v: unknown, lower: boolean) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return lower ? s.toLowerCase() : s;
  };
  const llm_effort = clean(input.llm_effort, true);
  if (llm_effort !== undefined && llm_effort !== null && !isLlmEffort(llm_effort)) {
    throw new Error(
      `Invalid llm_effort "${String(input.llm_effort)}". Expected one of: ${LLM_EFFORT_LEVELS.join(", ")}`,
    );
  }
  return {
    llm_provider: clean(input.llm_provider, true),
    llm_model: clean(input.llm_model, false),
    llm_effort,
  };
};
