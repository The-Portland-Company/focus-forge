import {
  AGENT_TOOLS,
  AGENT_TOOL_DEFS,
  executeTool,
  type AgentToolContext,
} from "@/lib/ai-agent/tools";
import {
  extractImageUrls,
  fetchImageForVision,
  type ImageBlock,
} from "@/lib/ai-agent/image-ingest";

/**
 * Vision-capable Claude model used for the image-describe step. Per the
 * claude-api skill, claude-opus-4-8 and claude-sonnet-4-6 are vision-capable;
 * we use opus for the strongest image understanding.
 */
const VISION_MODEL = "claude-opus-4-8";

export type VisionDescribeResult = {
  /** URLs successfully ingested + described (persist these as references). */
  describedUrls: string[];
  /** URLs that could not be ingested (SSRF-blocked, non-image, fetch fail). */
  failedUrls: string[];
  /** Extracted text/context to feed into the agent, or "" when none. */
  context: string;
  /** True when at least one image URL was present in the message. */
  hadImageUrls: boolean;
};

/**
 * Detect image URL(s) in `messageText`, fetch them SSRF-safely, and run a
 * one-shot vision call against a vision-capable Claude model to turn each image
 * into text/context the existing (text-only) agent flow can use.
 *
 * This is the documented "vision-describe step" choice: rather than threading
 * multimodal image blocks through the entire tool-calling loop (invasive, and
 * the loop spans three providers with different wire formats), we do a focused
 * one-shot vision call up front and feed its output as text. The model that
 * actually views the image is a real vision model receiving a real IMAGE block.
 *
 * Graceful fallback: with no Anthropic key, or when every image fails to
 * ingest, `context` carries an honest message and `failedUrls` is populated —
 * the caller never silently dead-ends.
 */
export async function describeImagesInMessage(
  messageText: string,
  opts?: { apiKey?: () => string | undefined; fetchImpl?: typeof fetch },
): Promise<VisionDescribeResult> {
  const urls = extractImageUrls(messageText);
  if (urls.length === 0) {
    return { describedUrls: [], failedUrls: [], context: "", hadImageUrls: false };
  }

  const apiKey = (opts?.apiKey ?? (() => process.env.ANTHROPIC_API_KEY))();
  if (!apiKey) {
    return {
      describedUrls: [],
      failedUrls: urls,
      hadImageUrls: true,
      context:
        "[Image ingestion unavailable: no vision model configured. I can't view the image(s) " +
        "you linked. Paste the task name/text instead and I'll help.]",
    };
  }

  const blocks: ImageBlock[] = [];
  const describedUrls: string[] = [];
  const failedUrls: string[] = [];
  for (const url of urls) {
    const r = await fetchImageForVision(url, {
      fetchImpl: opts?.fetchImpl as any,
    });
    if (r.ok) {
      blocks.push(r.block);
      describedUrls.push(url);
    } else {
      failedUrls.push(url);
    }
  }

  if (blocks.length === 0) {
    return {
      describedUrls: [],
      failedUrls,
      hadImageUrls: true,
      context:
        "[I couldn't view the image(s) you linked (they may be private, unreachable, or not an image). " +
        "Paste the task name/text instead and I'll help.]",
    };
  }

  // One-shot vision call. Build a multimodal user turn with the images + a
  // describe instruction, and send to a vision-capable Claude model.
  const userContent: any[] = [
    ...blocks,
    {
      type: "text",
      text:
        "Describe what is shown in the image(s) above in concise detail. " +
        "If they contain a task, note, screenshot of a UI, or any text, transcribe the " +
        "relevant text and structure verbatim so it can be acted on. Output plain text only.",
    },
  ];

  try {
    const doFetch = (opts?.fetchImpl ?? fetch) as typeof fetch;
    const response = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 1200,
        system:
          "You are a vision assistant. Describe images accurately and transcribe any visible text.",
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!response.ok) {
      return {
        describedUrls: [],
        failedUrls: urls,
        hadImageUrls: true,
        context:
          "[I couldn't view the image(s) right now (vision request failed). " +
          "Paste the task name/text instead and I'll help.]",
      };
    }
    const payload = await response.json();
    const text = (Array.isArray(payload?.content) ? payload.content : [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    if (!text) {
      return {
        describedUrls: [],
        failedUrls: urls,
        hadImageUrls: true,
        context:
          "[I couldn't extract anything useful from the image(s). Paste the task name/text instead.]",
      };
    }
    return {
      describedUrls,
      failedUrls,
      hadImageUrls: true,
      context: `[Contents of the image(s) the user linked, as seen by a vision model:\n${text}\n]`,
    };
  } catch {
    return {
      describedUrls: [],
      failedUrls: urls,
      hadImageUrls: true,
      context:
        "[I couldn't view the image(s) right now (vision request errored). " +
        "Paste the task name/text instead and I'll help.]",
    };
  }
}

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

/**
 * How many times the EXACT same tool call (name + serialized args) may actually
 * run within a single turn before we stop re-executing it. The 1st and 2nd
 * identical calls run; the 3rd+ are short-circuited with a note telling the
 * model not to repeat it. This breaks loops where the model keeps re-issuing the
 * same (often failing) call and never converges to a final answer.
 */
export const MAX_IDENTICAL_TOOL_CALLS = 2;

/** Stable signature for a tool call, used to detect exact repeats within a turn. */
export function toolCallSignature(name: string, args: unknown): string {
  let serialized: string;
  try {
    serialized = stableStringify(args);
  } catch {
    serialized = String(args);
  }
  return `${name}::${serialized}`;
}

/** JSON.stringify with sorted object keys so arg order doesn't change the signature. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Tracks how many times each tool-call signature has been requested this turn
 * and decides whether a given call should actually execute or be capped.
 */
export class RepeatedCallGuard {
  private counts = new Map<string, number>();

  /**
   * Record a requested call. Returns whether it should run, and (when capped) a
   * note to feed back as the tool result so the model stops repeating it.
   */
  consider(name: string, args: unknown): { shouldRun: boolean; cappedNote?: string } {
    const sig = toolCallSignature(name, args);
    const prior = this.counts.get(sig) ?? 0;
    this.counts.set(sig, prior + 1);
    if (prior >= MAX_IDENTICAL_TOOL_CALLS) {
      return {
        shouldRun: false,
        cappedNote:
          `This exact call to ${name} was already made ${prior} time(s) this turn and is being ` +
          "skipped to avoid a loop. Do not repeat it — answer the user with the information you " +
          "already have, or state the concrete limitation you hit.",
      };
    }
    return { shouldRun: true };
  }

  /** True if any signature was requested past the cap (i.e. a loop was broken). */
  hitCap(): boolean {
    for (const count of this.counts.values()) {
      if (count > MAX_IDENTICAL_TOOL_CALLS) return true;
    }
    return false;
  }
}

/**
 * Build the non-generic fallback message used only when the final-summary call
 * also fails. Names what was attempted (tools run) and the concrete limitation,
 * instead of the old generic "tell me what you want" dead-end.
 */
export function buildExhaustionFallback(toolsUsed: string[], cappedLoop: boolean): string {
  const unique = Array.from(new Set(toolsUsed));
  const limitation = cappedLoop
    ? "I kept repeating the same lookup without new information"
    : "I ran out of steps before finishing";
  if (unique.length === 0) {
    return `I couldn't complete that — ${limitation}. Could you restate it more specifically, or break it into smaller steps?`;
  }
  return (
    `I worked on this using ${unique.join(", ")}, but ${limitation}, so I can't give a clean ` +
    "final answer. Tell me which specific part to focus on and I'll take it from there."
  );
}

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
      const guard = new RepeatedCallGuard();

      // One tool-less completion through this same provider, used to synthesize a
      // useful final answer when the tool loop exhausts instead of dead-ending.
      const requestFinalSummary = async (): Promise<string> => {
        const summaryMessages = [
          ...messages,
          {
            role: "user",
            content:
              "Stop calling tools. Using only the tool results gathered above, write the final " +
              "answer for the user now: summarize what you found and state any concrete limitation " +
              "(e.g. what you couldn't do and why). Do not promise further actions.",
          },
        ];
        const resp = await fetch(opts.baseUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: opts.model, temperature: 0.3, messages: summaryMessages }),
        });
        if (!resp.ok) throw new Error(`${opts.name} final-summary failed (${resp.status})`);
        const data = await resp.json();
        return String(data?.choices?.[0]?.message?.content || "").trim();
      };

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
          const decision = guard.consider(fnName, args);
          if (!decision.shouldRun) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ ok: false, error: decision.cappedNote }),
            });
            continue;
          }
          const result = await executeTool(toolContext, fnName, args);
          toolsUsed.push(fnName);
          if (result.ok && MUTATING_TOOLS.has(fnName)) mutated = true;
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
        }
      }

      return {
        assistantMessage: await finishExhausted(requestFinalSummary, toolsUsed, guard.hitCap()),
        toolsUsed,
        mutated,
        provider: opts.name,
      };
    },
  };
}

/**
 * Loop-exhaustion finisher shared by both runners: ask the model for one final
 * tool-less summary of what it gathered; if that fails or is empty, fall back to
 * a specific (non-generic) message naming what was attempted and the limitation.
 */
async function finishExhausted(
  requestFinalSummary: () => Promise<string>,
  toolsUsed: string[],
  cappedLoop: boolean,
): Promise<string> {
  try {
    const summary = await requestFinalSummary();
    if (summary) return summary;
  } catch {
    // fall through to the specific non-generic fallback below
  }
  return buildExhaustionFallback(toolsUsed, cappedLoop);
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
      const guard = new RepeatedCallGuard();

      const requestFinalSummary = async (): Promise<string> => {
        const summaryMessages = [
          ...messages,
          {
            role: "user",
            content:
              "Stop calling tools. Using only the tool results gathered above, write the final " +
              "answer for the user now: summarize what you found and state any concrete limitation " +
              "(e.g. what you couldn't do and why). Do not promise further actions.",
          },
        ];
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
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
            messages: summaryMessages,
          }),
        });
        if (!resp.ok) throw new Error(`anthropic final-summary failed (${resp.status})`);
        const data = await resp.json();
        const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
        return blocks
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
      };

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
          const decision = guard.consider(use.name, use.input || {});
          if (!decision.shouldRun) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify({ ok: false, error: decision.cappedNote }),
            });
            continue;
          }
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
        assistantMessage: await finishExhausted(requestFinalSummary, toolsUsed, guard.hitCap()),
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
