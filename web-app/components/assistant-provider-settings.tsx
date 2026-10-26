"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Laptop, Cloud } from "lucide-react";
import {
  loadProviderPrefs,
  saveProviderPrefs,
  localBridgeAvailable,
  LOCAL_PROVIDERS,
  REMOTE_PROVIDERS,
  type AssistantProviderPrefs,
  type ProviderCategory,
  type ProviderDef,
} from "@/lib/ai-agent/provider-prefs";

/**
 * Settings UI for the assistant's provider choice, with LOCAL and REMOTE as the
 * two parent categories. The user picks which category answers by default and
 * orders the fallback chain inside each.
 *
 * LOCAL runs agent sessions (Claude Code / Codex / Grok) on this Mac through the
 * desktop shell, so those providers can actually execute Focus Forge commands.
 * It only works inside the desktop app — in a plain browser the category is
 * shown but flagged as unavailable here.
 */
export function AssistantProviderSettings() {
  const [prefs, setPrefs] = useState<AssistantProviderPrefs>(() => loadProviderPrefs());
  const [bridge, setBridge] = useState(false);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setPrefs(loadProviderPrefs());
    const present = localBridgeAvailable();
    setBridge(present);
    // Ask the bridge which local CLIs are actually installed, to flag any gaps.
    const b = (window as any).focusForgeLocalAI;
    if (present && typeof b?.listProviders === "function") {
      b.listProviders()
        .then((r: any) => {
          if (r?.ok && Array.isArray(r.providers)) {
            const map: Record<string, boolean> = {};
            for (const p of r.providers) map[p.id] = !!p.available;
            setInstalled(map);
          }
        })
        .catch(() => {});
    }
  }, []);

  const update = (next: AssistantProviderPrefs) => {
    setPrefs(next);
    saveProviderPrefs(next);
  };

  const setCategory = (category: ProviderCategory) => update({ ...prefs, category });

  const move = (which: "localOrder" | "remoteOrder", id: string, dir: -1 | 1) => {
    const order = [...prefs[which]];
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update({ ...prefs, [which]: order });
  };

  const orderedDefs = (defs: ProviderDef[], order: string[]) =>
    order.map((id) => defs.find((d) => d.id === id)).filter(Boolean) as ProviderDef[];

  const CategoryCard = ({
    category,
    title,
    subtitle,
    icon,
    defs,
    orderKey,
    unavailable,
  }: {
    category: ProviderCategory;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    defs: ProviderDef[];
    orderKey: "localOrder" | "remoteOrder";
    unavailable?: string | null;
  }) => {
    const active = prefs.category === category;
    const order = orderedDefs(defs, prefs[orderKey]);
    return (
      <div
        className={`rounded-lg border p-4 transition-colors ${
          active ? "border-theme bg-zinc-900" : "border-zinc-800 bg-zinc-900/50"
        }`}
      >
        <button
          type="button"
          onClick={() => setCategory(category)}
          className="flex w-full items-start gap-3 text-left"
        >
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              active ? "bg-theme text-zinc-950" : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {icon}
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{title}</span>
              {active && (
                <span className="inline-flex items-center gap-1 rounded-full bg-theme/20 px-2 py-0.5 text-[11px] text-theme">
                  <Check className="h-3 w-3" /> Default
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-xs text-zinc-400">{subtitle}</span>
          </span>
        </button>

        {unavailable && (
          <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {unavailable}
          </p>
        )}

        <ol className="mt-3 space-y-1.5">
          {order.map((def, idx) => {
            const missing = orderKey === "localOrder" && bridge && installed[def.id] === false;
            return (
              <li
                key={def.id}
                className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2"
              >
                <span className="w-5 text-center text-xs text-zinc-500">{idx + 1}</span>
                <span className="flex-1 text-sm text-zinc-200">
                  {def.label}
                  {missing && <span className="ml-2 text-xs text-amber-400">not installed</span>}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(orderKey, def.id, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
                    aria-label={`Move ${def.label} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(orderKey, def.id, 1)}
                    disabled={idx === order.length - 1}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
                    aria-label={`Move ${def.label} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  };

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-medium">Assistant provider</h3>
        <p className="text-sm text-zinc-400">
          Choose whether the assistant answers from a <strong>Local</strong> AI
          session on this Mac or a <strong>Remote</strong> cloud provider, and the
          order each falls back in. Local sessions run your own Claude Code / Codex
          / Grok with your Focus Forge tools, so they keep working when cloud
          credits run out.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CategoryCard
          category="local"
          title="Local"
          subtitle="Runs on this Mac via the desktop app"
          icon={<Laptop className="h-5 w-5" />}
          defs={LOCAL_PROVIDERS}
          orderKey="localOrder"
          unavailable={
            bridge
              ? null
              : "Available in the Focus Forge desktop app. In a browser, Remote is used instead."
          }
        />
        <CategoryCard
          category="remote"
          title="Remote"
          subtitle="Cloud providers called by the server"
          icon={<Cloud className="h-5 w-5" />}
          defs={REMOTE_PROVIDERS}
          orderKey="remoteOrder"
        />
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={prefs.crossFallback}
          onChange={(e) => update({ ...prefs, crossFallback: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
        />
        If the chosen category fails, fall back to the other one
      </label>
    </div>
  );
}
