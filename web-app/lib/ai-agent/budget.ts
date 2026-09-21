/**
 * Per-session ceilings for the AI agent: token/cost accounting, max tool-chain
 * depth, and a retry cap — the budget half of OWASP AI Agent Security Cheat
 * Sheet §5 (resource exhaustion / runaway agent loops) and §8 (excessive
 * agency: bound how much an agent can do unsupervised).
 *
 * This sits alongside `RepeatedCallGuard` in providers.ts (which caps *exact
 * repeat* tool calls within a turn) rather than duplicating it: SessionBudget
 * caps *volume and depth* — total tokens, total cost, how deep a tool-call
 * chain may nest, and how many retries a single step gets — regardless of
 * whether calls repeat. A caller typically drives both: RepeatedCallGuard
 * per tool-call signature, SessionBudget for the whole session.
 *
 * Not wired into any call site yet (out of scope for this change) — see the
 * adoption notes in the PR/report for where providers.ts, tools.ts and the
 * mobile/mcp routes should construct and check a SessionBudget.
 */

/** Ceilings for a single agent session (one conversation turn or run). */
export interface BudgetLimits {
  /** Max total tokens (input + output) accounted across the session. */
  maxTokens: number;
  /** Max total cost in USD accounted across the session. */
  maxCostUsd: number;
  /** Max nesting depth of a tool-call chain (a tool call that triggers another). */
  maxToolChainDepth: number;
  /** Max retries allowed for a single step before the budget refuses more. */
  maxRetries: number;
}

/** Conservative defaults; callers should override per route/provider as needed. */
export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  maxTokens: 200_000,
  maxCostUsd: 5,
  maxToolChainDepth: 6,
  maxRetries: 3,
};

export type BudgetCeiling = "tokens" | "cost" | "tool_chain_depth" | "retries";

export interface BudgetDecision {
  allowed: boolean;
  /** Which ceiling caused the denial, when allowed is false. */
  exceeded?: BudgetCeiling;
  /** Human-readable note, safe to surface to the caller or feed back to the model. */
  reason?: string;
}

export interface BudgetSnapshot {
  tokens: number;
  costUsd: number;
  toolChainDepth: number;
  retries: number;
  tripped: BudgetCeiling | null;
}

/**
 * Tracks token/cost/depth/retry usage for one agent session and enforces a
 * hard stop the moment any ceiling is crossed. Once tripped, the budget stays
 * tripped for the rest of the session (fail closed) — it never resets itself
 * mid-turn, even if a later call would individually fit under the ceiling.
 */
export class SessionBudget {
  private readonly limits: BudgetLimits;
  private tokens = 0;
  private costUsd = 0;
  private toolChainDepth = 0;
  private retries = 0;
  private tripped: BudgetCeiling | null = null;

  constructor(limits: Partial<BudgetLimits> = {}) {
    this.limits = { ...DEFAULT_BUDGET_LIMITS, ...limits };
  }

  /** Current usage, for logging/telemetry or surfacing to the caller. */
  snapshot(): BudgetSnapshot {
    return {
      tokens: this.tokens,
      costUsd: this.costUsd,
      toolChainDepth: this.toolChainDepth,
      retries: this.retries,
      tripped: this.tripped,
    };
  }

  /** True once any ceiling has been crossed; the session should stop entirely. */
  isTripped(): boolean {
    return this.tripped !== null;
  }

  /**
   * Record token usage from a completed LLM call and check the token/cost
   * ceilings. Call this after every provider response, before starting the
   * next tool round.
   */
  recordUsage(input: { tokens: number; costUsd: number }): BudgetDecision {
    if (this.tripped) return this.deniedResult();

    this.tokens += Math.max(0, input.tokens);
    this.costUsd += Math.max(0, input.costUsd);

    if (this.tokens > this.limits.maxTokens) {
      return this.trip("tokens", `Session token ceiling exceeded (${this.tokens}/${this.limits.maxTokens}).`);
    }
    if (this.costUsd > this.limits.maxCostUsd) {
      return this.trip(
        "cost",
        `Session cost ceiling exceeded ($${this.costUsd.toFixed(4)}/$${this.limits.maxCostUsd}).`,
      );
    }
    return { allowed: true };
  }

  /**
   * Check whether entering one more level of a tool-call chain (a tool call
   * that itself triggers another tool call, e.g. an agent-calls-agent chain)
   * is still within the depth ceiling. Call before executing a nested call;
   * on `allowed`, call `exitToolChain()` when that nested call returns.
   */
  enterToolChain(): BudgetDecision {
    if (this.tripped) return this.deniedResult();

    if (this.toolChainDepth + 1 > this.limits.maxToolChainDepth) {
      return this.trip(
        "tool_chain_depth",
        `Tool-chain depth ceiling exceeded (${this.toolChainDepth + 1}/${this.limits.maxToolChainDepth}).`,
      );
    }
    this.toolChainDepth += 1;
    return { allowed: true };
  }

  /** Unwind one level of tool-chain depth after a nested call returns. */
  exitToolChain(): void {
    this.toolChainDepth = Math.max(0, this.toolChainDepth - 1);
  }

  /**
   * Check whether one more retry of a failed step is allowed. Call before
   * retrying (not before the first attempt).
   */
  recordRetry(): BudgetDecision {
    if (this.tripped) return this.deniedResult();

    this.retries += 1;
    if (this.retries > this.limits.maxRetries) {
      return this.trip("retries", `Retry ceiling exceeded (${this.retries}/${this.limits.maxRetries}).`);
    }
    return { allowed: true };
  }

  private trip(ceiling: BudgetCeiling, reason: string): BudgetDecision {
    this.tripped = ceiling;
    return { allowed: false, exceeded: ceiling, reason };
  }

  /** Fail closed: once tripped, every subsequent check is denied without re-evaluating. */
  private deniedResult(): BudgetDecision {
    return {
      allowed: false,
      exceeded: this.tripped!,
      reason: `Session budget already exceeded (${this.tripped}); no further calls are permitted.`,
    };
  }
}
