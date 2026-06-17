"use client";

// Domino Effect — Phase 5 stake editor (embedded in the task modal).
// Lets the user list / add / edit the stakes attached to a task, manage the
// stake → stake edges between them, and capture stakes from natural language
// via /api/domino/extract (confirm-then-persist). Cycle (409) errors from the
// edges endpoint are surfaced gracefully. All requests reuse the app's plain
// fetch pattern.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bomb,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Link2,
  AlertCircle,
  Gift,
  AlertTriangle,
} from "lucide-react";

type StakeKind = "consequence" | "reward";
type ResolutionType = "defuses_once" | "eliminates";

interface StakeRow {
  id: string;
  name: string | null;
  kind: StakeKind;
  monetary_value?: number | null;
  severity?: string | null;
  trigger_at?: string | null;
  status?: string | null;
}

interface LinkRow {
  task_id: string;
  stake_id: string;
  resolution_type: ResolutionType;
}

interface EdgeRow {
  parent_stake_id: string;
  child_stake_id: string;
}

// --- AI extraction proposal shapes (mirror lib/domino/ai.ts) ---------------
interface ProposalStake {
  kind: StakeKind;
  name: string;
  monetary_value?: number | null;
  severity?: string | null;
  trigger_at?: string | null;
}
interface ProposalEdge {
  parentIndex: number;
  childIndex: number;
}
interface ProposalLink {
  stakeIndex: number;
  resolution_type: ResolutionType;
}
interface ExtractionProposal {
  stakes: ProposalStake[];
  edges: ProposalEdge[];
  links: ProposalLink[];
  confidence?: number;
  reason?: string;
}

interface StakeEditorProps {
  taskId: string;
  organizationId?: string | null;
}

function formatStakeValue(stake: StakeRow): string {
  if (typeof stake.monetary_value === "number" && stake.monetary_value > 0) {
    return `$${Math.round(stake.monetary_value)}`;
  }
  if (stake.severity) return stake.severity;
  return "—";
}

export function StakeEditor({ taskId, organizationId }: StakeEditorProps) {
  const [stakes, setStakes] = useState<StakeRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [edges, setEdges] = useState<EdgeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-stake form
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<StakeKind>("consequence");
  const [newValue, setNewValue] = useState("");
  const [newResolution, setNewResolution] =
    useState<ResolutionType>("defuses_once");

  // Edge form
  const [edgeParent, setEdgeParent] = useState("");
  const [edgeChild, setEdgeChild] = useState("");

  // NL capture
  const [nlText, setNlText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [proposal, setProposal] = useState<ExtractionProposal | null>(null);

  const stakeById = useMemo(() => {
    const m = new Map<string, StakeRow>();
    for (const s of stakes) m.set(s.id, s);
    return m;
  }, [stakes]);

  // Stakes linked to this task (the editor focuses on the task's own stakes).
  const linkedStakeIds = useMemo(
    () => new Set(links.map((l) => l.stake_id)),
    [links],
  );
  const linkedStakes = useMemo(
    () => stakes.filter((s) => linkedStakeIds.has(s.id)),
    [stakes, linkedStakeIds],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgQ = organizationId
        ? `?organizationId=${encodeURIComponent(organizationId)}`
        : "";
      const [stakesRes, linksRes] = await Promise.all([
        fetch(`/api/stakes${orgQ}`),
        fetch(`/api/tasks/${taskId}/stakes`),
      ]);
      if (stakesRes.ok) setStakes((await stakesRes.json()) as StakeRow[]);
      if (linksRes.ok) setLinks((await linksRes.json()) as LinkRow[]);

      // Edges come from the board endpoint (org-scoped), mapped to snake_case.
      const boardRes = await fetch(
        `/api/domino/board${orgQ}`,
      );
      if (boardRes.ok) {
        const board = await boardRes.json();
        const e: EdgeRow[] = (board?.edges ?? []).map((x: any) => ({
          parent_stake_id: x.parentStakeId,
          child_stake_id: x.childStakeId,
        }));
        setEdges(e);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stakes");
    } finally {
      setLoading(false);
    }
  }, [taskId, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Create a stake + link it to the task.
  const handleAddStake = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const value = newValue.trim() ? Number(newValue.trim()) : null;
      const createRes = await fetch("/api/stakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId ?? undefined,
          name,
          kind: newKind,
          monetary_value:
            value != null && Number.isFinite(value) && value >= 0
              ? value
              : null,
        }),
      });
      if (!createRes.ok) {
        const p = await createRes.json().catch(() => ({}));
        throw new Error(p?.error || "Failed to create stake");
      }
      const created = (await createRes.json()) as StakeRow;
      await linkStake(created.id, newResolution);
      setNewName("");
      setNewValue("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add stake");
    } finally {
      setBusy(false);
    }
  };

  const linkStake = async (stakeId: string, resolution: ResolutionType) => {
    const res = await fetch(`/api/tasks/${taskId}/stakes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stake_id: stakeId, resolution_type: resolution }),
    });
    if (!res.ok) {
      const p = await res.json().catch(() => ({}));
      throw new Error(p?.error || "Failed to link stake");
    }
  };

  const handleUnlink = async (stakeId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/stakes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stake_id: stakeId }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || "Failed to unlink stake");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setBusy(false);
    }
  };

  const handleChangeResolution = async (
    stakeId: string,
    resolution: ResolutionType,
  ) => {
    setError(null);
    try {
      // Re-link upserts resolution_type (POST onConflict updates the row).
      await linkStake(stakeId, resolution);
      setLinks((prev) =>
        prev.map((l) =>
          l.stake_id === stakeId ? { ...l, resolution_type: resolution } : l,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleAddEdge = async () => {
    if (!edgeParent || !edgeChild || edgeParent === edgeChild || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stakes/edges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_stake_id: edgeParent,
          child_stake_id: edgeChild,
        }),
      });
      if (res.status === 409) {
        setError(
          "That link would create a cycle in the domino chain — not added.",
        );
        return;
      }
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || "Failed to add edge");
      }
      setEdgeParent("");
      setEdgeChild("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add edge");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEdge = async (parent: string, child: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stakes/edges", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_stake_id: parent,
          child_stake_id: child,
        }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || "Failed to remove edge");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove edge");
    } finally {
      setBusy(false);
    }
  };

  // --- NL capture -----------------------------------------------------------
  const handleExtract = async () => {
    const text = nlText.trim();
    if (!text || extracting) return;
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch("/api/domino/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, organization_id: organizationId ?? undefined }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || "Failed to extract stakes");
      }
      setProposal((await res.json()) as ExtractionProposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract stakes");
    } finally {
      setExtracting(false);
    }
  };

  // Confirm-then-persist: create each proposed stake, link the proposed ones to
  // this task, then create the proposed edges (mapping proposal indices to the
  // freshly-created stake ids). Cycle (409) edges are skipped with a notice.
  const handleConfirmProposal = async () => {
    if (!proposal || busy) return;
    setBusy(true);
    setError(null);
    try {
      const createdIds: string[] = [];
      for (const s of proposal.stakes) {
        const res = await fetch("/api/stakes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organization_id: organizationId ?? undefined,
            name: s.name,
            kind: s.kind,
            monetary_value:
              typeof s.monetary_value === "number" ? s.monetary_value : null,
            severity: s.severity ?? null,
            trigger_at: s.trigger_at ?? null,
          }),
        });
        if (!res.ok) {
          const p = await res.json().catch(() => ({}));
          throw new Error(p?.error || "Failed to create proposed stake");
        }
        const created = (await res.json()) as StakeRow;
        createdIds.push(created.id);
      }

      for (const l of proposal.links) {
        const stakeId = createdIds[l.stakeIndex];
        if (stakeId) await linkStake(stakeId, l.resolution_type);
      }

      let cycleSkipped = false;
      for (const e of proposal.edges) {
        const parent = createdIds[e.parentIndex];
        const child = createdIds[e.childIndex];
        if (!parent || !child || parent === child) continue;
        const res = await fetch("/api/stakes/edges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parent_stake_id: parent,
            child_stake_id: child,
          }),
        });
        if (res.status === 409) cycleSkipped = true;
      }

      setProposal(null);
      setNlText("");
      await load();
      if (cycleSkipped) {
        setError("One or more proposed links were skipped (would form a cycle).");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save proposal");
    } finally {
      setBusy(false);
    }
  };

  const linkedEdges = edges.filter(
    (e) => linkedStakeIds.has(e.parent_stake_id) || linkedStakeIds.has(e.child_stake_id),
  );

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
        <Bomb className="h-3.5 w-3.5" />
        Stakes
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      </label>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Linked stakes */}
      {linkedStakes.length > 0 ? (
        <ul className="space-y-1.5">
          {linkedStakes.map((stake) => {
            const link = links.find((l) => l.stake_id === stake.id);
            const isReward = stake.kind === "reward";
            return (
              <li
                key={stake.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2"
              >
                {isReward ? (
                  <Gift className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                )}
                <span className="text-sm text-zinc-100">
                  {stake.name || "Untitled"}
                </span>
                <span className="text-xs text-zinc-500">
                  {formatStakeValue(stake)}
                </span>
                <select
                  value={link?.resolution_type ?? "defuses_once"}
                  onChange={(e) =>
                    void handleChangeResolution(
                      stake.id,
                      e.target.value as ResolutionType,
                    )
                  }
                  className="ml-auto rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus-theme"
                >
                  <option value="defuses_once">Defuses once</option>
                  <option value="eliminates">Eliminates</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleUnlink(stake.id)}
                  className="text-zinc-500 hover:text-red-400"
                  aria-label="Remove stake from task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">No stakes linked to this task yet.</p>
      )}

      {/* Add stake */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New stake (e.g. $40/wk laundromat)"
          className="min-w-[160px] flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-white placeholder-zinc-500 focus-theme"
        />
        <select
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as StakeKind)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus-theme"
        >
          <option value="consequence">Consequence</option>
          <option value="reward">Reward</option>
        </select>
        <input
          type="number"
          min="0"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="$"
          className="w-20 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white placeholder-zinc-500 focus-theme"
        />
        <select
          value={newResolution}
          onChange={(e) => setNewResolution(e.target.value as ResolutionType)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus-theme"
        >
          <option value="defuses_once">Defuses once</option>
          <option value="eliminates">Eliminates</option>
        </select>
        <button
          type="button"
          onClick={() => void handleAddStake()}
          disabled={busy || !newName.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-theme-gradient px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {/* Edges between this task's stakes */}
      {linkedStakes.length >= 2 || linkedEdges.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Link2 className="h-3.5 w-3.5" /> Chain links
          </div>
          {linkedEdges.map((e) => (
            <div
              key={`${e.parent_stake_id}-${e.child_stake_id}`}
              className="flex items-center gap-2 text-xs text-zinc-300"
            >
              <span>{stakeById.get(e.parent_stake_id)?.name || "?"}</span>
              <span className="text-zinc-500">→</span>
              <span>{stakeById.get(e.child_stake_id)?.name || "?"}</span>
              <button
                type="button"
                onClick={() => void handleDeleteEdge(e.parent_stake_id, e.child_stake_id)}
                className="text-zinc-500 hover:text-red-400"
                aria-label="Remove chain link"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={edgeParent}
              onChange={(e) => setEdgeParent(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus-theme"
            >
              <option value="">Parent…</option>
              {linkedStakes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || "Untitled"}
                </option>
              ))}
            </select>
            <span className="text-zinc-500">→</span>
            <select
              value={edgeChild}
              onChange={(e) => setEdgeChild(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus-theme"
            >
              <option value="">Child…</option>
              {linkedStakes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || "Untitled"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleAddEdge()}
              disabled={busy || !edgeParent || !edgeChild || edgeParent === edgeChild}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> Link
            </button>
          </div>
        </div>
      ) : null}

      {/* NL capture */}
      <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
          <Sparkles className="h-3.5 w-3.5 text-theme-primary" /> Capture from a
          sentence
        </div>
        <textarea
          value={nlText}
          onChange={(e) => setNlText(e.target.value)}
          rows={2}
          placeholder="e.g. If I don't do laundry by Friday I can't drive Uber and lose $40/wk"
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white placeholder-zinc-500 focus-theme"
        />
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void handleExtract()}
            disabled={extracting || !nlText.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-theme-gradient px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {extracting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Extract
          </button>
        </div>

        {proposal ? (
          <div className="space-y-2 rounded-md border border-theme-primary/30 bg-theme-primary/5 p-2">
            <div className="text-xs text-zinc-300">
              Proposed {proposal.stakes.length} stake
              {proposal.stakes.length === 1 ? "" : "s"}
              {typeof proposal.confidence === "number"
                ? ` · ${Math.round(proposal.confidence * 100)}% confident`
                : ""}
              {proposal.reason ? ` — ${proposal.reason}` : ""}
            </div>
            <ul className="space-y-1">
              {proposal.stakes.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-zinc-200">
                  {s.kind === "reward" ? (
                    <Gift className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                  )}
                  <span>{s.name}</span>
                  {typeof s.monetary_value === "number" ? (
                    <span className="text-zinc-500">${s.monetary_value}</span>
                  ) : s.severity ? (
                    <span className="text-zinc-500">{s.severity}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleConfirmProposal()}
                disabled={busy || proposal.stakes.length === 0}
                className="inline-flex items-center gap-1 rounded-md bg-theme-gradient px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Confirm &amp; save
              </button>
              <button
                type="button"
                onClick={() => setProposal(null)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500"
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
