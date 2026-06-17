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

const ACTION_NUDGE =
  "You described an action but did not call any tool this turn, so nothing actually happened. " +
  "If the user has already confirmed (e.g. replied 'yes'), call the appropriate tool(s) NOW to perform it, " +
  "then confirm the real result. If you still need confirmation or more info, ask a direct question instead. " +
  "Do not reply with another preamble.";

const ACTION_PROMISE_RE =
  /\b(?:i['’]?ll|i\s+will|now\s+i['’]?ll|let me|i['’]?m\s+going\s+to|going\s+to|proceeding\s+to|go\s+ahead\s+and)\b[^.?!]{0,60}\b(?:delete|remove|create|add|update|complete|mark|archive|move|set|snooze|convert)\b/i;

/**
 * True when the model's tool-less reply reads as an *unfulfilled promise* to
 * act ("Now I'll delete all 24 tasks:") rather than a finished answer or a
 * question. Used to give the model one more round to actually call the tool
 * instead of returning the dangling promise to the user.
 */
function looksLikeUnfulfilledActionPromise(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (t.endsWith("?")) return false; // a question, not a promise
  if (/[:：]\s*$/.test(t)) return true; // "here's what I'll do:" then nothing
  return ACTION_PROMISE_RE.test(t);
}

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
      let nudged = false;

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
          const content = String(msg.content || "").trim();
          if (!nudged && looksLikeUnfulfilledActionPromise(content)) {
            // Model announced an action but called no tool — give it one more
            // round to actually execute instead of returning a dead promise.
            nudged = true;
            messages.push({ role: "assistant", content: content || null });
            messages.push({ role: "user", content: ACTION_NUDGE });
            continue;
          }
          return {
            assistantMessage: content || "(no response)",
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
      let nudged = false;

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
          const text = textBlocks.join("\n").trim();
          if (!nudged && looksLikeUnfulfilledActionPromise(text)) {
            // Model announced an action but called no tool — give it one more
            // round to actually execute instead of returning a dead promise.
            nudged = true;
            messages.push({ role: "assistant", content: text });
            messages.push({ role: "user", content: ACTION_NUDGE });
            continue;
          }
          return {
            assistantMessage: text || "(no response)",
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

// ---- Structured (JSON) completion across the same provider chain ----
//
// The daily planner needs a one-shot, tool-less completion that returns strict
// JSON — not the multi-round tool-calling loop the agent uses. We reuse the very
// same OpenAI→Anthropic→xAI ordering and the same quota/outage fall-through
// semantics, but request structured output per provider:
//   - OpenAI / xAI (OpenAI-compatible): response_format json_schema when a
//     schema is supplied, else json_object.
//   - Anthropic: no json_schema wire support, so we lean on the prompt to demand
//     strict JSON and let the caller extract/parse defensively.
// The model tier matches the agent chain (gpt-4.1 / claude-sonnet-4-5 / grok-3).

type StructuredInput = {
  systemPrompt: string;
  userMessage: string;
  /** OpenAI-style json_schema ({ name, strict, schema }). Optional. */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
};

export type StructuredRunResult = { text: string; provider: string };

interface StructuredProvider {
  name: string;
  isConfigured(): boolean;
  run(input: StructuredInput): Promise<StructuredRunResult>;
}

function makeOpenAICompatibleStructuredProvider(opts: {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: () => string | undefined;
  /** Whether this endpoint supports response_format json_schema. */
  supportsJsonSchema: boolean;
}): StructuredProvider {
  return {
    name: opts.name,
    isConfigured: () => Boolean(opts.apiKey()),
    async run({ systemPrompt, userMessage, jsonSchema, temperature }) {
      const apiKey = opts.apiKey();
      if (!apiKey) throw new Error(`${opts.name}: not configured`);

      const responseFormat =
        jsonSchema && opts.supportsJsonSchema
          ? { type: "json_schema", json_schema: jsonSchema }
          : { type: "json_object" };

      const response = await fetch(opts.baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          temperature: temperature ?? 0.2,
          response_format: responseFormat,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${opts.name} request failed (${response.status}): ${text.slice(0, 400)}`);
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error(`${opts.name}: response missing content`);
      }
      return { text: content, provider: opts.name };
    },
  };
}

function makeAnthropicStructuredProvider(opts: {
  model: string;
  apiKey: () => string | undefined;
}): StructuredProvider {
  return {
    name: "anthropic",
    isConfigured: () => Boolean(opts.apiKey()),
    async run({ systemPrompt, userMessage, temperature }) {
      const apiKey = opts.apiKey();
      if (!apiKey) throw new Error("anthropic: not configured");

      // Anthropic has no json_schema response_format; demand strict JSON in the
      // system prompt and prefill the assistant turn with "{" to force a JSON
      // object start. The caller parses defensively.
      const system =
        systemPrompt +
        "\n\nReturn ONLY a single valid JSON object that matches the requested schema. " +
        "No prose, no markdown, no code fences.";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: 4096,
          temperature: temperature ?? 0.2,
          system,
          messages: [
            { role: "user", content: userMessage },
            { role: "assistant", content: "{" },
          ],
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`anthropic request failed (${response.status}): ${text.slice(0, 400)}`);
      }
      const payload = await response.json();
      const blocks: any[] = Array.isArray(payload?.content) ? payload.content : [];
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!text) throw new Error("anthropic: response missing content");
      // We prefilled "{", so the model continues from there — re-prepend it.
      return { text: "{" + text, provider: "anthropic" };
    },
  };
}

function getStructuredProviderChain(): StructuredProvider[] {
  return [
    makeOpenAICompatibleStructuredProvider({
      name: "openai",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4.1",
      apiKey: () => process.env.OPENAI_API_KEY,
      supportsJsonSchema: true,
    }),
    makeAnthropicStructuredProvider({
      model: "claude-sonnet-4-5",
      apiKey: () => process.env.ANTHROPIC_API_KEY,
    }),
    makeOpenAICompatibleStructuredProvider({
      name: "xai",
      baseUrl: "https://api.x.ai/v1/chat/completions",
      model: "grok-3",
      apiKey: () => process.env.XAI_API_KEY,
      // xAI is OpenAI-compatible but does not reliably support json_schema; use
      // json_object mode and rely on the prompt + defensive parsing.
      supportsJsonSchema: false,
    }),
  ];
}

export async function runStructuredWithFallback(
  input: StructuredInput,
): Promise<StructuredRunResult> {
  const providers = getStructuredProviderChain().filter((p) => p.isConfigured());
  if (providers.length === 0) {
    throw new Error(
      "No AI provider configured (set OPENAI_API_KEY, ANTHROPIC_API_KEY, or XAI_API_KEY)",
    );
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      return await provider.run(input);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name}: ${msg}`);
      // Fall through to the next provider for any failure (quota/outage/etc).
    }
  }

  // Keep provider + quota wording so daily-plan-card's billingProvider
  // detection still fires on the surfaced error.
  throw new Error(`All AI providers failed. ${errors.join(" | ")}`);
}

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
