"use client";

import { useEffect, useState } from "react";
import { X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AIDecisionTraceSummary,
  AIDecisionTraceDetail,
} from "./ai-rules-types";

const BANNER =
  "Every AI decision is traced. Open a row to see exactly which rules, playbook, and memories shaped the outcome.";

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "orange" | "blue" | "zinc";
}) {
  const tones: Record<string, string> = {
    green: "bg-green-500/15 text-green-300 border-green-500/30",
    orange: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    zinc: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function flatten(o: Record<string, unknown> | null): string {
  if (!o) return "—";
  try {
    return JSON.stringify(o, null, 2);
  } catch {
    return "—";
  }
}

function summarizeOutcome(o: Record<string, unknown> | null): string {
  if (!o) return "—";
  try {
    return Object.entries(o)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ");
  } catch {
    return "—";
  }
}

export default function AiDecisionHistoryTab() {
  const [traces, setTraces] = useState<AIDecisionTraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AIDecisionTraceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-memory/traces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { traces?: AIDecisionTraceSummary[] };
      setTraces(json.traces ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
      setTraces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openWhy = async (id: string) => {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/ai-memory/traces/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        trace?: AIDecisionTraceDetail;
      } & Partial<AIDecisionTraceDetail>;
      setDetail((json.trace as AIDecisionTraceDetail) ?? (json as AIDecisionTraceDetail));
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Failed to load trace");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        {BANNER}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-500">Loading…</div>
      ) : traces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-500">
          No data yet
        </div>
      ) : (
        <div className="space-y-2">
          {traces.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="zinc">{t.ai_call_type || "ai"}</Badge>
                  <Badge tone="blue">{t.source_type || "—"}</Badge>
                  {t.approved && <Badge tone="green">Approved</Badge>}
                  {t.corrected && <Badge tone="orange">Corrected</Badge>}
                  {t.overridden_by_rule && (
                    <Badge tone="orange">Overridden by rule</Badge>
                  )}
                  <span className="text-xs text-zinc-500">
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="truncate text-sm text-zinc-300">
                  {t.input_text || "—"}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  Outcome: {summarizeOutcome(t.final_output_json)}
                </p>
              </div>
              <button
                onClick={() => openWhy(t.id)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                <HelpCircle className="h-4 w-4" /> Why?
              </button>
            </div>
          ))}
        </div>
      )}

      {(detail || detailLoading || detailError) && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => {
            setDetail(null);
            setDetailError(null);
            setDetailLoading(false);
          }}
        >
          <div
            className="h-full w-full max-w-xl overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-100">
                Why this decision?
              </h3>
              <button
                onClick={() => {
                  setDetail(null);
                  setDetailError(null);
                  setDetailLoading(false);
                }}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-12 text-center text-sm text-zinc-500">
                Loading…
              </div>
            ) : detailError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                {detailError}
              </div>
            ) : detail ? (
              <div className="space-y-5 text-sm">
                <Section title="Matched deterministic rules">
                  {detail.matched_rules && detail.matched_rules.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5 text-zinc-300">
                      {detail.matched_rules.map((r) => (
                        <li key={r.id}>{r.name}</li>
                      ))}
                    </ul>
                  ) : detail.matched_rule_ids &&
                    detail.matched_rule_ids.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                      {detail.matched_rule_ids.map((id) => (
                        <li key={id}>{id}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-zinc-500">None</p>
                  )}
                </Section>

                <Section title="Playbook version used">
                  <p className="text-zinc-300">
                    {detail.playbook_version ?? "—"}
                  </p>
                </Section>

                <Section title="Injected memories">
                  {detail.injected_memories &&
                  detail.injected_memories.length > 0 ? (
                    <ul className="space-y-1 text-zinc-300">
                      {detail.injected_memories.map((m) => (
                        <li
                          key={m.id}
                          className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1"
                        >
                          {m.normalized_summary}
                        </li>
                      ))}
                    </ul>
                  ) : detail.selected_memory_ids &&
                    detail.selected_memory_ids.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                      {detail.selected_memory_ids.map((id) => (
                        <li key={id}>{id}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-zinc-500">None</p>
                  )}
                </Section>

                <Section title="Prompt context summary">
                  <p className="whitespace-pre-wrap text-zinc-300">
                    {detail.prompt_context_summary || "—"}
                  </p>
                </Section>

                <Section title="AI output vs final output">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 text-xs text-zinc-500">AI output</p>
                      <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-900/50 p-2 text-xs text-zinc-300">
                        {flatten(detail.ai_output_json)}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-zinc-500">Final output</p>
                      <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-900/50 p-2 text-xs text-zinc-300">
                        {flatten(detail.final_output_json)}
                      </pre>
                    </div>
                  </div>
                </Section>

                {detail.overridden_by_rule && (
                  <Section title="Override reason">
                    <p className="text-zinc-300">
                      {detail.override_reason || "—"}
                    </p>
                  </Section>
                )}

                {detail.correction && (
                  <Section title="Later correction">
                    <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-900/50 p-2 text-xs text-zinc-300">
                      {flatten(detail.correction)}
                    </pre>
                  </Section>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h4>
      {children}
    </div>
  );
}
