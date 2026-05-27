import {
  AGENT_TOOLS,
  AGENT_TOOL_DEFS,
  executeTool,
  type AgentToolContext,
} from "@/lib/ai-agent/tools";

/**
 * Multi-provider agent runners with a fallback chain.
 *
 * Order: OpenAI (primary) → Anthropic Claude → xAI Grok.
 * Each runner executes its own tool-calling loop because the wire formats
 * differ. xAI is OpenAI-compatible, so it shares the OpenAI runner with a
 * different base URL / model / key. Anthropic uses the Messages API.
 *
 * A runner throws on failure; runAgentWithFallback catches and moves to the
 * next configured provider. Errors that are clearly the model account's fault
 * (quota/credit/auth) are treated as "try the next provider".
 */

const MAX_TOOL_ROUNDS = 6;
const MUTATING_TOOLS = new Set(["create_task", "update_task", "complete_task", "delete_task"]);

export type ProviderRunResult = {
  assistantMessage: string;
  toolsUsed: string[];
  mutated: boolean;
  provider: string;
};

type RunInput = {
  systemPrompt: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  toolContext: AgentToolContext;
};

export interface AgentProvider {
  name: string;
  isConfigured(): boolean;
  run(input: RunInput): Promise<ProviderRunResult>;
}

// ---- OpenAI-compatible runner (OpenAI + xAI/Grok) ----

function makeOpenAICompatibleProvider(opts: {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: () => string | undefined;
}): AgentProvider {
  return {
    name: opts.name,
    isConfigured: () => Boolean(opts.apiKey()),
    async run({ systemPrompt, conversation, toolContext }) {
      const apiKey = opts.apiKey();
      if (!apiKey) throw new Error(`${opts.name}: not configured`);

      const messages: any[] = [
        { role: "system", content: systemPrompt },
        ...conversation.map((m) => ({ role: m.role, content: m.content })),
      ];
      const toolsUsed: string[] = [];
      let mutated = false;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await fetch(opts.baseUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: opts.model, temperature: 0.3, tools: AGENT_TOOLS, messages }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${opts.name} request failed (${response.status}): ${text.slice(0, 400)}`);
        }
        const payload = await response.json();
        const msg = payload?.choices?.[0]?.message;
        if (!msg) throw new Error(`${opts.name}: response missing message`);

        const toolCalls = msg.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          return {
            assistantMessage: String(msg.content || "").trim() || "(no response)",
            toolsUsed,
            mutated,
            provider: opts.name,
          };
        }

        messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
        for (const call of toolCalls) {
          const fnName = call?.function?.name;
          let args: Record<string, any> = {};
          try {
            args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            args = {};
          }
          const result = await executeTool(toolContext, fnName, args);
          toolsUsed.push(fnName);
          if (result.ok && MUTATING_TOOLS.has(fnName)) mutated = true;
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
        }
      }

      return {
        assistantMessage:
          "I took several steps but didn't reach a clean stopping point. Tell me specifically what you'd like next.",
        toolsUsed,
        mutated,
        provider: opts.name,
      };
    },
  };
}

// ---- Anthropic runner ----

function makeAnthropicProvider(opts: { model: string; apiKey: () => string | undefined }): AgentProvider {
  const anthropicTools = AGENT_TOOL_DEFS.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.parameters,
  }));

  return {
    name: "anthropic",
    isConfigured: () => Boolean(opts.apiKey()),
    async run({ systemPrompt, conversation, toolContext }) {
      const apiKey = opts.apiKey();
      if (!apiKey) throw new Error("anthropic: not configured");

      const messages: any[] = conversation.map((m) => ({ role: m.role, content: m.content }));
      const toolsUsed: string[] = [];
      let mutated = false;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: 1500,
            temperature: 0.3,
            system: systemPrompt,
            tools: anthropicTools,
            messages,
          }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`anthropic request failed (${response.status}): ${text.slice(0, 400)}`);
        }
        const payload = await response.json();
        const content: any[] = Array.isArray(payload?.content) ? payload.content : [];
        const textBlocks = content.filter((b) => b.type === "text").map((b) => b.text);
        const toolUses = content.filter((b) => b.type === "tool_use");

        if (payload?.stop_reason !== "tool_use" || toolUses.length === 0) {
          return {
            assistantMessage: textBlocks.join("\n").trim() || "(no response)",
            toolsUsed,
            mutated,
            provider: "anthropic",
          };
        }

        messages.push({ role: "assistant", content });
        const toolResults: any[] = [];
        for (const use of toolUses) {
          const result = await executeTool(toolContext, use.name, use.input || {});
          toolsUsed.push(use.name);
          if (result.ok && MUTATING_TOOLS.has(use.name)) mutated = true;
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(result).slice(0, 8000),
          });
        }
        messages.push({ role: "user", content: toolResults });
      }

      return {
        assistantMessage:
          "I took several steps but didn't reach a clean stopping point. Tell me specifically what you'd like next.",
        toolsUsed,
        mutated,
        provider: "anthropic",
      };
    },
  };
}

// ---- Provider chain ----

export function getProviderChain(): AgentProvider[] {
  return [
    makeOpenAICompatibleProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4.1",
      apiKey: () => process.env.OPENAI_API_KEY,
    }),
    makeAnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: () => process.env.ANTHROPIC_API_KEY,
    }),
    makeOpenAICompatibleProvider({
      name: "xai",
      baseUrl: "https://api.x.ai/v1/chat/completions",
      model: "grok-3",
      apiKey: () => process.env.XAI_API_KEY,
    }),
  ];
}

export const PROVIDER_OPTIONS = [
  { id: "auto", label: "Auto (fallback)" },
  { id: "openai", label: "GPT-4.1 (OpenAI)" },
  { id: "anthropic", label: "Claude Sonnet 4.5" },
  { id: "xai", label: "Grok 3 (xAI)" },
] as const;

export type ProviderPreference = (typeof PROVIDER_OPTIONS)[number]["id"];

export async function runAgentWithFallback(
  input: RunInput,
  preferred?: ProviderPreference,
): Promise<ProviderRunResult> {
  let providers = getProviderChain().filter((p) => p.isConfigured());
  if (providers.length === 0) {
    throw new Error("No AI provider configured (set OPENAI_API_KEY, ANTHROPIC_API_KEY, or XAI_API_KEY)");
  }

  // If the user picked a specific provider, try it first; the rest stay as
  // fallbacks so a chosen-but-exhausted provider still degrades gracefully.
  if (preferred && preferred !== "auto") {
    const chosen = providers.find((p) => p.name === preferred);
    if (chosen) {
      providers = [chosen, ...providers.filter((p) => p.name !== preferred)];
    }
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      return await provider.run(input);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name}: ${msg}`);
      // Fall through to the next provider for any failure.
    }
  }

  throw new Error(`All AI providers failed. ${errors.join(" | ")}`);
}
