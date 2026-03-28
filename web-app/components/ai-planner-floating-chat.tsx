"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  Send,
  Sparkles,
  CheckCircle2,
  X,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import type { PlannerMode, PlanDraft, TaskBlueprint } from "@/lib/ai-planner/types";

type PlannerMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

type PlannerArtifact = {
  id: string;
  type: "plan" | "task_blueprint";
  payload_json: Record<string, unknown>;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
};

type CreationReport = {
  created: {
    sections: number;
    tasks: number;
    subtasks: number;
  };
  failures: Array<{ stage: string; path: string; reason: string }>;
  createdEntityIds: {
    sections: string[];
    tasks: string[];
    subtasks: string[];
  };
};

interface AiPlannerFloatingChatProps {
  projectId: string;
  projectName: string;
  onCreated?: () => Promise<void> | void;
}

const SESSION_STORAGE_PREFIX = "aiPlannerSession";

export function AiPlannerFloatingChat({
  projectId,
  projectName,
  onCreated,
}: AiPlannerFloatingChatProps) {
  const { showError, showSuccess } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlannerMessage[]>([]);
  const [artifacts, setArtifacts] = useState<PlannerArtifact[]>([]);
  const [mode, setMode] = useState<PlannerMode>("clarify");
  const [readiness, setReadiness] = useState<string>("needs_clarification");
  const [missingInfo, setMissingInfo] = useState<string[]>([]);
  const [creationReport, setCreationReport] = useState<CreationReport | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const storageKey = `${SESSION_STORAGE_PREFIX}:${projectId}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const existingSessionId = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;

    if (!existingSessionId) return;

    setLoadingSession(true);
    fetch(`/api/ai-planner/session/${existingSessionId}`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load planner session");
        }
        return response.json();
      })
      .then((data) => {
        const loadedMessages: PlannerMessage[] = (data?.messages || [])
          .filter((msg: any) => msg.role === "user" || msg.role === "assistant")
          .map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: String(msg.content_text || ""),
            createdAt: msg.created_at,
          }));

        setSessionId(existingSessionId);
        setMessages(loadedMessages);
        setArtifacts(data?.artifacts || []);
      })
      .catch(() => {
        localStorage.removeItem(storageKey);
      })
      .finally(() => {
        setLoadingSession(false);
      });
  }, [isOpen, storageKey]);

  const latestPlan = useMemo(
    () => artifacts.find((artifact) => artifact.type === "plan") || null,
    [artifacts],
  );

  const latestTaskBlueprint = useMemo(
    () => artifacts.find((artifact) => artifact.type === "task_blueprint") || null,
    [artifacts],
  );

  const canApprove = Boolean(latestTaskBlueprint && !approving);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || sending) return;

    const localMessageId = `local-${Date.now()}`;
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: localMessageId, role: "user", content: message },
    ]);

    try {
      const response = await fetch("/api/ai-planner/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          projectId,
          message,
          mode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Planner chat failed");
      }

      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(storageKey, data.sessionId);
      }

      setReadiness(data.readiness || "needs_clarification");
      setMissingInfo(Array.isArray(data.missingInfo) ? data.missingInfo : []);

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: String(data.assistantMessage || ""),
        },
      ]);

      if (data.planArtifact || data.taskBlueprintArtifact) {
        setArtifacts((prev) => {
          const next = [...prev];
          if (data.planArtifact) {
            next.unshift(data.planArtifact);
          }
          if (data.taskBlueprintArtifact) {
            next.unshift(data.taskBlueprintArtifact);
          }
          return next;
        });
      }
    } catch (error: any) {
      showError("Planner request failed", error?.message || "Unknown error");
    } finally {
      setSending(false);
    }
  };

  const handleApprove = async () => {
    if (!sessionId || !latestTaskBlueprint?.id || approving) return;

    try {
      setApproving(true);
      const response = await fetch("/api/ai-planner/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          projectId,
          artifactId: latestTaskBlueprint.id,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to create tasks from plan");
      }

      setCreationReport(data as CreationReport);
      showSuccess(
        "Tasks created",
        `Sections: ${data.created.sections}, tasks: ${data.created.tasks}, subtasks: ${data.created.subtasks}`,
      );

      if (onCreated) {
        await onCreated();
      }
    } catch (error: any) {
      showError("Approval failed", error?.message || "Unknown error");
    } finally {
      setApproving(false);
    }
  };

  const planDraft = latestPlan?.payload_json as PlanDraft | undefined;
  const taskBlueprint = latestTaskBlueprint?.payload_json as TaskBlueprint | undefined;

  return (
    <>
      <button
        aria-label="Open AI planner"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-50 rounded-full border border-zinc-700 bg-zinc-900 p-3 text-zinc-100 shadow-lg transition hover:border-zinc-500 hover:bg-zinc-800"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[78vh] w-[min(94vw,460px)] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">AI Project Planner</p>
              <p className="text-xs text-zinc-400">{projectName}</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Close AI planner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Mode</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                onClick={() => setMode("clarify")}
                className={`rounded px-2 py-1.5 ${mode === "clarify" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
              >
                Clarify
              </button>
              <button
                onClick={() => setMode("draft_plan")}
                className={`rounded px-2 py-1.5 ${mode === "draft_plan" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
              >
                Draft Plan
              </button>
              <button
                onClick={() => setMode("finalize_tasks")}
                className={`rounded px-2 py-1.5 ${mode === "finalize_tasks" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
              >
                Finalize
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loadingSession ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading session...
              </div>
            ) : (
              <>
                {messages.length === 0 && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
                    Ask for project planning help. Start with context, goals, and constraints.
                  </div>
                )}

                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-zinc-100 text-zinc-950"
                            : "bg-zinc-800 text-zinc-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {sending && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                )}

                {missingInfo.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-300">
                      Missing info
                    </p>
                    <ul className="space-y-1 text-xs text-amber-100">
                      {missingInfo.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {planDraft && (
                  <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                      <Bot className="h-4 w-4" />
                      Plan Draft
                    </div>
                    <p className="text-xs text-zinc-300">{planDraft.overview}</p>
                    <div className="mt-2 text-xs text-zinc-400">
                      Objectives: {planDraft.objectives?.length || 0} • Milestones: {planDraft.milestones?.length || 0}
                    </div>
                  </div>
                )}

                {taskBlueprint && (
                  <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-200">
                      <CheckCircle2 className="h-4 w-4" />
                      Task Blueprint Ready
                    </div>
                    <p className="text-xs text-emerald-100">
                      Lists: {taskBlueprint.lists?.length || 0}
                    </p>
                  </div>
                )}

                {creationReport && (
                  <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-200">
                    <p className="mb-1 font-semibold">Creation Summary</p>
                    <p>
                      Sections: {creationReport.created.sections} • Tasks: {creationReport.created.tasks} • Subtasks: {creationReport.created.subtasks}
                    </p>
                    {creationReport.failures.length > 0 && (
                      <div className="mt-2 space-y-1 text-red-300">
                        {creationReport.failures.map((failure, idx) => (
                          <p key={`${failure.path}-${idx}`}>
                            {failure.stage}: {failure.path} ({failure.reason})
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="border-t border-zinc-800 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                Readiness: {readiness.replaceAll("_", " ")}
              </span>
              <button
                onClick={handleApprove}
                disabled={!canApprove}
                className="rounded bg-emerald-500 px-2.5 py-1 text-xs font-medium text-emerald-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
              >
                {approving ? "Creating..." : "Approve & Create Tasks"}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Describe the project or answer questions..."
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 placeholder:text-zinc-500 focus:border-zinc-500"
                disabled={sending || approving}
              />
              <button
                onClick={handleSend}
                disabled={sending || approving || !input.trim()}
                className="rounded-xl border border-zinc-700 bg-zinc-100 px-3 text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                aria-label="Send planner message"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
