"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Copy,
  Check,
  Loader2,
  Lock,
  Trash2,
  Link as LinkIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format-date";
import {
  ModalMinimizeButton,
  useModalWindow,
} from "@/components/ui/modal-window";

interface ProjectShare {
  id: string;
  project_id: string;
  token: string;
  allow_public: boolean;
  permission: "read" | "write";
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  has_passcode: boolean;
}

interface ProjectShareModalProps {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  dateFormat?: string;
  onClose: () => void;
}

export function ProjectShareModal({
  isOpen,
  projectId,
  projectName,
  dateFormat,
  onClose,
}: ProjectShareModalProps) {
  const modalWindow = useModalWindow({
    title: "Share project",
    onRequestClose: onClose,
  });
  const supabase = useMemo(() => createClient(), []);
  const [shares, setShares] = useState<ProjectShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create-form state
  const [passcode, setPasscode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowPublic, setAllowPublic] = useState(true);
  const [permission, setPermission] = useState<"read" | "write">("read");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = useCallback(
    (token: string) => `${origin}/share/${token}`,
    [origin],
  );

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }, [supabase]);

  const loadShares = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/projects/${projectId}/shares`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to load links");
      setShares(payload.shares || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load links");
    } finally {
      setLoading(false);
    }
  }, [getToken, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    loadShares();
  }, [isOpen, loadShares]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/projects/${projectId}/shares`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          passcode: passcode.trim() || undefined,
          expires_at: expiresAt || undefined,
          allow_public: allowPublic,
          permission,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Failed to create link");
      setShares((prev) => [payload.share, ...prev]);
      setPasscode("");
      setExpiresAt("");
      setAllowPublic(true);
      setPermission("read");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create link");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/projects/${projectId}/shares/${shareId}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to revoke link");
      }
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke link");
    }
  };

  const handleCopy = async (share: ProjectShare) => {
    try {
      await navigator.clipboard.writeText(shareUrl(share.token));
      setCopiedId(share.id);
      setTimeout(() => setCopiedId((cur) => (cur === share.id ? null : cur)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!isOpen) return null;

  if (modalWindow.minimized) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        style={{ ...modalWindow.panelStyle, position: "relative" }} className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl max-h-[90vh] flex flex-col">
        <div
          {...modalWindow.dragHandleProps}
          aria-hidden
          className="absolute inset-x-0 top-0 z-0 h-12 rounded-t-xl"
        />
        <ModalMinimizeButton
          onMinimize={modalWindow.minimize}
          className="absolute right-12 top-4 z-20"
        />
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Share project</h2>
            <p className="text-xs text-zinc-500">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-6 p-5 overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Create a link */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">
              Create a public link
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Passcode (optional)
                </label>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Leave blank for none"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[rgb(var(--theme-primary-rgb))] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Expires (optional)
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-[rgb(var(--theme-primary-rgb))] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Access
              </label>
              <div className="flex gap-2">
                {([
                  { value: "read", label: "Can view", hint: "Read only" },
                  { value: "write", label: "Can edit", hint: "Tick off and add tasks" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPermission(opt.value)}
                    aria-pressed={permission === opt.value}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                      permission === opt.value
                        ? "border-[rgb(var(--theme-primary-rgb))] bg-zinc-800 text-white"
                        : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-[11px] text-zinc-500">
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>
              {permission === "write" && (
                <p className="mt-1.5 text-[11px] text-amber-400/90">
                  Anyone with this link can change tasks without signing in.
                  Consider setting a passcode.
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={allowPublic}
                onChange={(e) => setAllowPublic(e.target.checked)}
                className="accent-[rgb(var(--theme-primary-rgb))]"
              />
              Anyone with the link (and passcode, if set) can view without
              signing in
            </label>
            <div className="flex justify-end">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-1.5 rounded-lg bg-theme-gradient px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LinkIcon className="h-4 w-4" />
                )}
                Create link
              </button>
            </div>
          </div>

          {/* Existing links */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">Active links</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-zinc-500">No active share links yet.</p>
            ) : (
              <ul className="space-y-3">
                {shares.map((share) => (
                  <li
                    key={share.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={shareUrl(share.token)}
                        className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300"
                      />
                      <button
                        onClick={() => handleCopy(share)}
                        className="rounded border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:text-white transition-colors"
                        aria-label="Copy link"
                        title="Copy link"
                      >
                        {copiedId === share.id ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRevoke(share.id)}
                        className="rounded border border-zinc-700 bg-zinc-800 p-1.5 text-red-400 hover:text-red-300 transition-colors"
                        aria-label="Revoke link"
                        title="Revoke link"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                          share.permission === "write"
                            ? "bg-zinc-800 text-emerald-300"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {share.permission === "write" ? "Can edit" : "View only"}
                      </span>
                      {share.has_passcode && (
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-amber-300">
                          <Lock className="h-3 w-3" /> Passcode
                        </span>
                      )}
                      {share.expires_at ? (
                        <span>
                          Expires {formatDate(share.expires_at, dateFormat)}
                        </span>
                      ) : (
                        <span>No expiry</span>
                      )}
                      <span>
                        Created {formatDate(share.created_at, dateFormat)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
