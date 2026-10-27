// Assistant provider preferences, with LOCAL and REMOTE as the two parent
// categories the user chooses between.
//
//  - REMOTE providers run server-side via the chat API (OpenAI → Anthropic →
//    xAI). These are the historical providers.
//  - LOCAL providers run as agent sessions on the user's own Mac, reachable
//    ONLY from inside the desktop shell (window.focusForgeLocalAI). A local
//    session carries the user's MCP servers / skills / plugins, so it can
//    actually execute Focus Forge commands.
//
// The default is LOCAL-first (Claude Code → Codex → Grok), falling back to the
// remote chain, so the assistant keeps working when remote credits run dry —
// which is the failure this feature exists to fix.

export type ProviderCategory = "local" | "remote";

export type ProviderDef = {
  id: string;
  label: string;
  /** Short badge text shown on assistant messages. */
  badge: string;
};

export const LOCAL_PROVIDERS: ProviderDef[] = [
  { id: "local-claude", label: "Claude Code (local)", badge: "Claude · local" },
  { id: "local-codex", label: "ChatGPT · Codex (local)", badge: "Codex · local" },
  { id: "local-grok", label: "Grok (local)", badge: "Grok · local" },
];

export const REMOTE_PROVIDERS: ProviderDef[] = [
  { id: "openai", label: "GPT-4.1 (OpenAI)", badge: "GPT-4.1" },
  { id: "anthropic", label: "Claude Sonnet 4.5", badge: "Claude" },
  { id: "xai", label: "Grok 3 (xAI)", badge: "Grok" },
  // Bartok: the user's own persistent agent brain, reached via its official
  // orchestrator chat endpoint. Remote (runs on Bartok's host), single-turn.
  { id: "bartok", label: "Bartok", badge: "Bartok" },
];

export const PROVIDER_CATALOG: Record<ProviderCategory, ProviderDef[]> = {
  local: LOCAL_PROVIDERS,
  remote: REMOTE_PROVIDERS,
};

export type AssistantProviderPrefs = {
  /** Which parent category answers by default. */
  category: ProviderCategory;
  /** Fallback order within the LOCAL category (provider ids). */
  localOrder: string[];
  /** Fallback order within the REMOTE category (provider ids). */
  remoteOrder: string[];
  /**
   * When the active category's chain is exhausted, also try the other
   * category before giving up. On by default so remote outages degrade to
   * local and vice-versa.
   */
  crossFallback: boolean;
};

export const DEFAULT_PREFS: AssistantProviderPrefs = {
  category: "local",
  localOrder: ["local-claude", "local-codex", "local-grok"],
  remoteOrder: ["openai", "anthropic", "xai", "bartok"],
  crossFallback: true,
};

const STORAGE_KEY = "ffAssistantProviderPrefs";

/** Validate + repair a prefs object so a stale/partial blob never breaks. */
function normalize(raw: Partial<AssistantProviderPrefs> | null | undefined): AssistantProviderPrefs {
  const localIds = LOCAL_PROVIDERS.map((p) => p.id);
  const remoteIds = REMOTE_PROVIDERS.map((p) => p.id);
  const fix = (order: unknown, valid: string[]) => {
    const got = Array.isArray(order) ? (order as string[]).filter((id) => valid.includes(id)) : [];
    // Append any providers missing from the saved order so new ones appear.
    for (const id of valid) if (!got.includes(id)) got.push(id);
    return got;
  };
  return {
    category: raw?.category === "remote" ? "remote" : "local",
    localOrder: fix(raw?.localOrder, localIds),
    remoteOrder: fix(raw?.remoteOrder, remoteIds),
    crossFallback: raw?.crossFallback !== false,
  };
}

export function loadProviderPrefs(): AssistantProviderPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveProviderPrefs(prefs: AssistantProviderPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(prefs)));
    // Let any mounted assistant pick up the change without a reload.
    window.dispatchEvent(new Event("focusforge:provider-prefs-changed"));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/** Human badge for a provider id (local or remote), for message chips. */
export function providerBadge(id?: string | null): string {
  if (!id) return "AI";
  const all = [...LOCAL_PROVIDERS, ...REMOTE_PROVIDERS];
  return all.find((p) => p.id === id)?.badge ?? id;
}

/** True when the desktop shell's local-AI bridge is available in this window. */
export function localBridgeAvailable(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).focusForgeLocalAI?.present);
}
