"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Pencil, Download, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AIPlaybook } from "./ai-rules-types";

const BANNER =
  "This is the generalized rules.md-style guidance generated from memories. It is stored in the database, not as the canonical server file.";

const PLAYBOOK_TYPE = "email";

export default function AiPlaybookTab() {
  const [playbooks, setPlaybooks] = useState<AIPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-memory/playbooks");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { playbooks?: AIPlaybook[] };
      const list = json.playbooks ?? [];
      setPlaybooks(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load playbook");
      setPlaybooks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () => playbooks.find((p) => p.id === selectedId) ?? playbooks[0] ?? null,
    [playbooks, selectedId],
  );

  const saveEdit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ai-memory/playbooks/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentMarkdown: draft }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditing(false);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai-memory/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbookType: PLAYBOOK_TYPE }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate");
    } finally {
      setBusy(false);
    }
  };

  const exportMd = () => {
    if (!selected) return;
    const blob = new Blob([selected.content_markdown], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "playbook.md";
    a.click();
    URL.revokeObjectURL(url);
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

      <div className="flex flex-wrap items-center gap-3">
        {playbooks.length > 0 && (
          <Select
            value={selected?.id ?? ""}
            onValueChange={(v) => {
              setSelectedId(v);
              setEditing(false);
            }}
          >
            <SelectTrigger className="w-[220px]">
              <History className="mr-1.5 h-4 w-4 text-zinc-500" />
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              {playbooks.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  v{p.version}
                  {p.is_active ? " (active)" : ""} ·{" "}
                  {new Date(p.created_at).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" onClick={regenerate} disabled={busy}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Regenerate
        </Button>
        {selected && !editing && (
          <Button
            variant="outline"
            onClick={() => {
              setDraft(selected.content_markdown);
              setEditing(true);
            }}
          >
            <Pencil className="mr-1.5 h-4 w-4" /> Edit
          </Button>
        )}
        {selected && (
          <Button variant="outline" onClick={exportMd}>
            <Download className="mr-1.5 h-4 w-4" /> Export playbook.md
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-500">Loading…</div>
      ) : !selected ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-500">
          No playbook yet. Click Regenerate to build one from your memories.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="flex flex-wrap items-center gap-4 border-b border-zinc-800 px-4 py-2 text-xs text-zinc-500">
            <span>Version {selected.version}</span>
            <span>{new Date(selected.created_at).toLocaleString()}</span>
            <span>{selected.source_memory_count ?? 0} source memories</span>
            <span>by {selected.created_by || "system"}</span>
          </div>
          {editing ? (
            <div className="space-y-3 p-4">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={20}
                className="font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={saveEdit} disabled={busy}>
                  {busy ? "Saving…" : "Save as new version"}
                </Button>
              </div>
            </div>
          ) : (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-4 text-sm leading-relaxed text-zinc-200">
              {selected.content_markdown}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
