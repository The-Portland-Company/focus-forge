"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Mic, Square, X, Loader2 } from "lucide-react";
import { useRecorder } from "@/lib/voice/use-recorder";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";

type Phase =
  | "idle"
  | "recording"
  | "transcribing"
  | "extracting"
  | "creating"
  | "done";

interface ExtractedTask {
  name: string;
  description?: string;
  priority?: number;
  due_date?: string;
}

interface ProjectLite {
  id: string;
  name: string;
}

const HIGHLIGHT_DURATION_MS = 30_000;
const UNDO_WINDOW_MS = 5_000;

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(1, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function highlightTaskRows(taskIds: string[]) {
  if (typeof document === "undefined") return;
  taskIds.forEach((id) => {
    const nodes = document.querySelectorAll<HTMLElement>(
      `[data-task-id="${CSS.escape(id)}"]`,
    );
    nodes.forEach((node) => {
      node.style.transition = "background-color 0ms";
      node.style.backgroundColor = "rgba(251, 191, 36, 0.25)";
      node.style.boxShadow = "inset 0 0 0 1px rgba(251, 191, 36, 0.5)";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.style.transition = `background-color ${HIGHLIGHT_DURATION_MS}ms ease-out, box-shadow ${HIGHLIGHT_DURATION_MS}ms ease-out`;
          node.style.backgroundColor = "";
          node.style.boxShadow = "";
        });
      });
      window.setTimeout(() => {
        node.style.transition = "";
      }, HIGHLIGHT_DURATION_MS + 100);
    });
  });
}

export function VoiceTaskButton() {
  const { user } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();
  const recorder = useRecorder();
  const pathname = usePathname();

  const [phase, setPhase] = useState<Phase>("idle");
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [projects, setProjects] = useState<ProjectLite[]>([]);

  const currentProjectId = useMemo(() => {
    if (!pathname) return null;
    const m = pathname.match(/\/projects-([^/?#]+)/);
    return m ? m[1] : null;
  }, [pathname]);

  useEffect(() => {
    if (!user || !open) return;
    let cancelled = false;
    fetch("/api/projects", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        const list: ProjectLite[] = Array.isArray(data)
          ? data
              .filter(
                (p: unknown): p is { id: string; name: string } =>
                  !!p &&
                  typeof (p as { id?: unknown }).id === "string" &&
                  typeof (p as { name?: unknown }).name === "string",
              )
              .map((p) => ({ id: p.id, name: p.name }))
          : [];
        setProjects(list);
      })
      .catch(() => {
        // best-effort
      });
    return () => {
      cancelled = true;
    };
  }, [user, open]);

  const reset = useCallback(() => {
    setPhase("idle");
    setTranscript("");
    setOpen(false);
  }, []);

  const handleStart = useCallback(async () => {
    setOpen(true);
    setPhase("recording");
    setTranscript("");
    try {
      await recorder.start();
    } catch (err) {
      setPhase("idle");
      setOpen(false);
      showError(
        "Microphone unavailable",
        err instanceof Error ? err.message : "Could not start recording.",
      );
    }
  }, [recorder, showError]);

  const handleStop = useCallback(async () => {
    setPhase("transcribing");
    const blob = await recorder.stop();
    if (!blob) {
      showError("No audio captured", "Please try again.");
      reset();
      return;
    }

    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      const transcribeResp = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!transcribeResp.ok) {
        const err = await transcribeResp.json().catch(() => ({}));
        throw new Error(err.error || "Transcription failed");
      }
      const { text } = (await transcribeResp.json()) as { text: string };
      const trimmed = (text || "").trim();
      setTranscript(trimmed);

      if (!trimmed) {
        showError("Empty transcript", "Nothing was detected. Please retry.");
        reset();
        return;
      }

      setPhase("extracting");
      const extractResp = await fetch("/api/voice/tasks-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          transcript: trimmed,
          currentProjectId,
          projects,
        }),
      });
      if (!extractResp.ok) {
        const err = await extractResp.json().catch(() => ({}));
        throw new Error(err.error || "Extraction failed");
      }
      const extracted = (await extractResp.json()) as {
        projectId: string | null;
        tasks: ExtractedTask[];
      };

      if (!extracted.tasks?.length) {
        showInfo(
          "No tasks detected",
          trimmed.length > 100 ? trimmed.slice(0, 100) + "…" : trimmed,
        );
        reset();
        return;
      }

      const projectId = extracted.projectId || currentProjectId;
      if (!projectId) {
        showError(
          "No project selected",
          "Open a project or name one in your message.",
        );
        reset();
        return;
      }

      setPhase("creating");
      const created: { id: string; name: string }[] = [];
      for (const t of extracted.tasks) {
        const r = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: t.name,
            description: t.description,
            priority: t.priority,
            due_date: t.due_date,
            project_id: projectId,
            projectId,
          }),
        });
        if (r.ok) {
          const task = await r.json();
          if (task?.id) created.push({ id: task.id, name: task.name });
        }
      }

      setPhase("done");
      setOpen(false);

      if (!created.length) {
        showError("No tasks created", "Server rejected the requests.");
        return;
      }

      // Trigger view to refresh; the existing pages refetch on focus/route, so
      // dispatch a custom event other components can listen to if desired.
      window.dispatchEvent(
        new CustomEvent("voice-tasks:created", {
          detail: { taskIds: created.map((c) => c.id), projectId },
        }),
      );

      // Highlight rows after a short delay so they have rendered.
      const tryHighlight = (attempt: number) => {
        const ids = created.map((c) => c.id);
        const found = ids.some((id) =>
          document.querySelector(`[data-task-id="${CSS.escape(id)}"]`),
        );
        if (found || attempt >= 10) {
          highlightTaskRows(ids);
        } else {
          window.setTimeout(() => tryHighlight(attempt + 1), 400);
        }
      };
      window.setTimeout(() => tryHighlight(0), 250);

      const projectName =
        projects.find((p) => p.id === projectId)?.name || "project";
      const undoTimer = window.setTimeout(() => {
        // window passed
      }, UNDO_WINDOW_MS);
      let undone = false;
      const onUndo = async () => {
        if (undone) return;
        undone = true;
        window.clearTimeout(undoTimer);
        await Promise.allSettled(
          created.map((c) =>
            fetch(`/api/tasks/${c.id}`, {
              method: "DELETE",
              credentials: "include",
            }),
          ),
        );
        showInfo("Tasks removed", `Reverted ${created.length} task(s).`);
        window.dispatchEvent(
          new CustomEvent("voice-tasks:reverted", {
            detail: { taskIds: created.map((c) => c.id) },
          }),
        );
      };

      // Show a custom toast with an Undo button by composing a regular toast
      // plus a temporary fixed Undo affordance. Toast system here is text-only,
      // so render a lightweight DOM element for Undo.
      showSuccess(
        `Created ${created.length} task${created.length === 1 ? "" : "s"}`,
        `In ${projectName}. ${created
          .slice(0, 3)
          .map((c) => `“${c.name}”`)
          .join(", ")}${created.length > 3 ? "…" : ""}`,
      );
      renderUndoBanner(created.length, UNDO_WINDOW_MS, onUndo);

      window.setTimeout(() => setPhase("idle"), 600);
    } catch (err) {
      showError(
        "Voice task failed",
        err instanceof Error ? err.message : "Unknown error",
      );
      reset();
    }
  }, [
    currentProjectId,
    projects,
    recorder,
    reset,
    showError,
    showInfo,
    showSuccess,
  ]);

  const handleCancel = useCallback(() => {
    recorder.cancel();
    reset();
  }, [recorder, reset]);

  if (!user) return null;

  const isBusy =
    phase === "transcribing" ||
    phase === "extracting" ||
    phase === "creating";

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          type="button"
          onClick={handleStart}
          aria-label="Voice tasks"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg transition hover:scale-105 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          <Mic className="h-6 w-6" />
        </button>
      )}

      {/* Recording / processing panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Voice tasks recorder"
          className="fixed bottom-6 right-6 z-40 w-80 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-zinc-100 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              {phase === "recording" && "Listening…"}
              {phase === "transcribing" && "Transcribing…"}
              {phase === "extracting" && "Reading tasks…"}
              {phase === "creating" && "Creating tasks…"}
              {phase === "done" && "Done"}
            </div>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isBusy}
              className="rounded p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {phase === "recording" && (
            <>
              <div className="mt-3 flex h-12 items-end gap-1">
                {Array.from({ length: 20 }).map((_, i) => {
                  const seed = (Math.sin(Date.now() / 120 + i) + 1) / 2;
                  const h = Math.max(
                    4,
                    Math.min(48, recorder.level * 48 * (0.4 + seed)),
                  );
                  return (
                    <div
                      key={i}
                      className="w-2 flex-1 rounded bg-amber-400"
                      style={{ height: `${h}px` }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 text-center text-xs tabular-nums text-zinc-400">
                {formatTime(recorder.elapsedMs)} / 2:00
              </div>
              <button
                type="button"
                onClick={handleStop}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-black hover:bg-amber-400"
              >
                <Square className="h-4 w-4" />
                Stop & create tasks
              </button>
            </>
          )}

          {isBusy && (
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {phase === "transcribing" && "Sending to Whisper…"}
                {phase === "extracting" && "Asking model for tasks…"}
                {phase === "creating" && "Saving to FocusForge…"}
              </span>
            </div>
          )}

          {transcript && (phase === "extracting" || phase === "creating") && (
            <div className="mt-3 max-h-24 overflow-y-auto rounded bg-zinc-800 p-2 text-xs text-zinc-300">
              {transcript}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function renderUndoBanner(
  count: number,
  windowMs: number,
  onUndo: () => void,
) {
  if (typeof document === "undefined") return;
  const id = "voice-tasks-undo-banner";
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = id;
  banner.style.cssText = [
    "position:fixed",
    "bottom:96px",
    "right:24px",
    "z-index:60",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "padding:10px 14px",
    "border-radius:12px",
    "background:#18181b",
    "color:#fafafa",
    "border:1px solid #3f3f46",
    "box-shadow:0 10px 25px rgba(0,0,0,0.4)",
    "font:500 13px/1.2 system-ui, -apple-system, Segoe UI, sans-serif",
  ].join(";");

  const label = document.createElement("span");
  label.textContent = `Created ${count} task${count === 1 ? "" : "s"}`;
  banner.appendChild(label);

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.textContent = "Undo";
  undoBtn.style.cssText = [
    "background:#f59e0b",
    "color:#000",
    "border:none",
    "padding:6px 10px",
    "border-radius:8px",
    "cursor:pointer",
    "font-weight:600",
  ].join(";");
  undoBtn.addEventListener("click", () => {
    onUndo();
    banner.remove();
  });
  banner.appendChild(undoBtn);

  document.body.appendChild(banner);
  window.setTimeout(() => banner.remove(), windowMs);
}
