"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Archive, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AIMemory, MEMORY_SOURCE_BADGES } from "./ai-rules-types";

const BANNER =
  "These memories are retrieved and injected into future AI prompts. They behave like ChatGPT-style memory, but are stored in your app database.";

function SourceBadge({ source }: { source: string }) {
  const meta =
    MEMORY_SOURCE_BADGES[source] || {
      label: source,
      className: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

function flattenOutcome(outcome: Record<string, unknown> | null): string {
  if (!outcome) return "—";
  try {
    return Object.entries(outcome)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ");
  } catch {
    return "—";
  }
}

type FormState = {
  id?: string;
  memoryType: string;
  inputText: string;
  outcome: string;
  normalizedSummary: string;
};

const EMPTY_FORM: FormState = {
  memoryType: "",
  inputText: "",
  outcome: "",
  normalizedSummary: "",
};

export default function AiMemoryTab() {
  const [memories, setMemories] = useState<AIMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editor, setEditor] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-memory/memories");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { memories?: AIMemory[] };
      setMemories(json.memories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load memories");
      setMemories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const types = useMemo(() => {
    const set = new Set<string>();
    memories.forEach((m) => m.memory_type && set.add(m.memory_type));
    return Array.from(set).sort();
  }, [memories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memories.filter((m) => {
      if (typeFilter !== "all" && m.memory_type !== typeFilter) return false;
      if (!q) return true;
      return [m.normalized_summary, m.input_text, m.memory_type]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [memories, search, typeFilter]);

  const submit = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      let outcome: unknown = null;
      if (editor.outcome.trim()) {
        try {
          outcome = JSON.parse(editor.outcome);
        } catch {
          outcome = { note: editor.outcome };
        }
      }
      const body = {
        memoryType: editor.memoryType,
        inputText: editor.inputText,
        outcome,
        normalizedSummary: editor.normalizedSummary,
      };
      const res = await fetch(
        editor.id
          ? `/api/ai-memory/memories/${editor.id}`
          : "/api/ai-memory/memories",
        {
          method: editor.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save memory");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (m: AIMemory) => {
    try {
      const res = await fetch(`/api/ai-memory/memories/${m.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive");
    }
  };

  const remove = async (m: AIMemory) => {
    try {
      const res = await fetch(`/api/ai-memory/memories/${m.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        {BANNER}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories…"
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setEditor({ ...EMPTY_FORM })}>
          <Plus className="mr-1.5 h-4 w-4" /> Add memory
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-500">
          No data yet
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Summary</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Input</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Conf.</th>
                <th className="px-3 py-2">Weight</th>
                <th className="px-3 py-2">Uses</th>
                <th className="px-3 py-2">Last used</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-zinc-800/60 align-top hover:bg-zinc-900/30"
                >
                  <td className="max-w-[260px] px-3 py-2 text-zinc-200">
                    {m.normalized_summary}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-300">
                      {m.memory_type}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-zinc-400">
                    {m.input_text || "—"}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-zinc-400">
                    {flattenOutcome(m.outcome_json)}
                  </td>
                  <td className="px-3 py-2">
                    <SourceBadge source={m.source_type} />
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {m.confidence ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{m.weight ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">
                    {m.source_count ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {m.last_used_at
                      ? new Date(m.last_used_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{m.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setEditor({
                            id: m.id,
                            memoryType: m.memory_type,
                            inputText: m.input_text || "",
                            outcome: m.outcome_json
                              ? JSON.stringify(m.outcome_json, null, 2)
                              : "",
                            normalizedSummary: m.normalized_summary,
                          })
                        }
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => archive(m)}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(m)}
                        className="rounded p-1 text-red-400 hover:bg-red-500/10"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-100">
                {editor.id ? "Edit memory" : "Add memory"}
              </h3>
              <button
                onClick={() => setEditor(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Memory type
                </label>
                <Input
                  value={editor.memoryType}
                  onChange={(e) =>
                    setEditor({ ...editor, memoryType: e.target.value })
                  }
                  placeholder="e.g. routing_preference"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Normalized summary
                </label>
                <Input
                  value={editor.normalizedSummary}
                  onChange={(e) =>
                    setEditor({ ...editor, normalizedSummary: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Input text
                </label>
                <Textarea
                  value={editor.inputText}
                  onChange={(e) =>
                    setEditor({ ...editor, inputText: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  Outcome (JSON or text)
                </label>
                <Textarea
                  value={editor.outcome}
                  onChange={(e) =>
                    setEditor({ ...editor, outcome: e.target.value })
                  }
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
