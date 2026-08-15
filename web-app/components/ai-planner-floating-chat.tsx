"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertCircle, ExternalLink, Loader2, Mic, Send, Sparkles, Square, SquarePen, X } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import {
  AI_CREDIT_ALERT_TITLE,
  isAiCreditError,
  useAiCreditAlert,
} from "@/hooks/use-ai-credit-alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRecorder } from "@/lib/voice/use-recorder";
import { STT_PROVIDER_OPTIONS, type SttProviderPreference } from "@/lib/voice/stt";

type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string | null;
  origin?: "voice" | "text";
};

const PROVIDER_META: Record<string, { name: string; bg: string }> = {
  openai: { name: "GPT-4.1", bg: "#0f0f0f" },
  anthropic: { name: "Claude", bg: "#CC785C" },
  xai: { name: "Grok", bg: "#0f0f0f" },
};

function providerMeta(provider?: string | null) {
  return (provider && PROVIDER_META[provider]) || { name: "AI", bg: "#3f3f46" };
}

function ProviderLogo({ provider }: { provider?: string | null }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none" } as const;
  if (provider === "anthropic") {
    return (
      <svg {...common} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
        <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1" />
      </svg>
    );
  }
  if (provider === "xai") {
    return (
      <svg {...common} fill="#fff" aria-hidden>
        <path d="M4 3h4l4 5.5L16 3h4l-6.2 8.4L20 21h-4l-4.2-5.8L7.5 21H3.5l6.5-8.8z" />
      </svg>
    );
  }
  if (provider === "openai") {
    return (
      <svg {...common} fill="#fff" aria-hidden>
        <path d="M21.3 9.9a5 5 0 0 0-.4-4.1 5.05 5.05 0 0 0-5.45-2.4A5.07 5.07 0 0 0 4.6 4.4a5 5 0 0 0-3.35 2.42 5.05 5.05 0 0 0 .62 5.93 5 5 0 0 0 .43 4.11 5.06 5.06 0 0 0 5.45 2.42A5 5 0 0 0 11.5 21a5.06 5.06 0 0 0 4.82-3.5 5 5 0 0 0 3.34-2.42 5.06 5.06 0 0 0-.62-5.92zM11.5 19.6a3.74 3.74 0 0 1-2.4-.87l.12-.07 4-2.3a.66.66 0 0 0 .33-.57v-5.62l1.68.98v4.66a3.76 3.76 0 0 1-3.75 3.75zm-8.06-3.44a3.73 3.73 0 0 1-.45-2.51l.12.07 4 2.3a.64.64 0 0 0 .65 0l4.87-2.8v1.94l-4.06 2.35a3.75 3.75 0 0 1-5.12-1.35zM2.4 7.7a3.74 3.74 0 0 1 1.97-1.65v4.74a.64.64 0 0 0 .32.56l4.85 2.8-1.68.97-4.03-2.32A3.76 3.76 0 0 1 2.4 7.7zm13.83 3.22-4.87-2.82 1.68-.97 4.03 2.32a3.75 3.75 0 0 1-.57 6.76v-4.73a.66.66 0 0 0-.34-.56zm1.67-2.52-.12-.07-3.98-2.32a.65.65 0 0 0-.66 0L9.04 6.95V5l4.03-2.33a3.75 3.75 0 0 1 5.57 3.89zM8.13 11.85l-1.68-.97V6.22a3.75 3.75 0 0 1 6.15-2.88l-.12.07-4 2.3a.66.66 0 0 0-.33.57zm.91-1.97 2.17-1.25 2.17 1.25v2.5l-2.17 1.25-2.17-1.25z" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="#fff" aria-hidden>
      <path d="M12 3l1.6 4.8L18 9l-4.4 1.2L12 15l-1.6-4.8L6 9l4.4-1.2z" />
    </svg>
  );
}

interface AiPlannerFloatingChatProps {
  /** Optional: present on a project page; omitted when mounted globally. */
  projectId?: string;
  projectName?: string;
  /** View identifier for page context (e.g. "project-<id>"). */
  view?: string;
  /** Number of tasks currently visible on screen, for page-aware answers. */
  visibleTaskCount?: number;
  /** Called after the agent mutates data so the page can refresh. */
  onCreated?: () => Promise<void> | void;
  /** Render full-window (popped-out) instead of a floating panel + FAB. */
  embedded?: boolean;
}

const SESSION_STORAGE_PREFIX = "aiAgentSession";
const MODEL_STORAGE_KEY = "aiAgentModel";
const STT_STORAGE_KEY = "aiVoiceProvider";

const MODEL_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "openai", label: "GPT-4.1" },
  { id: "anthropic", label: "Claude 4.5" },
  { id: "xai", label: "Grok 3" },
] as const;

type ModelChoice = (typeof MODEL_OPTIONS)[number]["id"];

const SUGGESTIONS = [
  "What tasks do you see on this page?",
  "What are my priorities today?",
  "Any new tasks from my inbox?",
  "Help me clean up my inbox",
];

export function AiPlannerFloatingChat({
  projectId: projectIdProp,
  projectName: projectNameProp,
  view: viewProp,
  visibleTaskCount,
  onCreated,
  embedded = false,
}: AiPlannerFloatingChatProps) {
  const { showError } = useToast();
  const { showAiCreditAlert, openLlmProviderSettings } = useAiCreditAlert();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const recorder = useRecorder();

  // Derive the current project: from props, the URL (/project-<id>) when mounted
  // globally, or query params when popped out (embedded window on /assistant).
  const { projectId, view } = useMemo(() => {
    if (projectIdProp) return { projectId: projectIdProp, view: viewProp || `project-${projectIdProp}` };
    if (embedded) {
      const qp = searchParams?.get("projectId") || undefined;
      return { projectId: qp, view: searchParams?.get("view") || (qp ? `project-${qp}` : undefined) };
    }
    const m = pathname?.match(/\/project-([^/?#]+)/);
    return { projectId: m?.[1], view: viewProp || (pathname ? pathname.replace(/^\//, "") : undefined) };
  }, [projectIdProp, viewProp, pathname, embedded, searchParams]);
  const projectName = projectNameProp || searchParams?.get("projectName") || undefined;

  const [isOpen, setIsOpen] = useState(embedded);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  // The out-of-credit failure also renders in-thread (same alert as the bell
  // panel), because that is where the user is looking when the send fails.
  const [creditError, setCreditError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelChoice>("auto");
  const [sttProvider, setSttProvider] = useState<SttProviderPreference>("auto");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // When set, the next send starts a fresh server-side session instead of
  // resuming the latest one for this scope.
  const newConversationRef = useRef(false);

  const recording = recorder.state === "recording";
  const storageKey = `${SESSION_STORAGE_PREFIX}:${projectId || "global"}`;

  const startNewConversation = () => {
    if (sending) return;
    newConversationRef.current = true;
    setSessionId(null);
    setMessages([]);
    setInput("");
    if (typeof window !== "undefined") localStorage.removeItem(storageKey);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(MODEL_STORAGE_KEY) as ModelChoice | null;
    if (saved && MODEL_OPTIONS.some((m) => m.id === saved)) setModel(saved);
    const savedStt = localStorage.getItem(STT_STORAGE_KEY) as SttProviderPreference | null;
    if (savedStt && STT_PROVIDER_OPTIONS.some((o) => o.id === savedStt)) setSttProvider(savedStt);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const existing = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (!existing) return;

    setLoadingSession(true);
    fetch(`/api/ai-planner/session/${existing}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data) => {
        const loaded: AgentMessage[] = (data?.messages || [])
          .filter((m: any) => m.role === "user" || m.role === "assistant")
          .map((m: any) => ({
            id: m.id,
            role: m.role,
            content: String(m.content_text || ""),
            provider: m.content_json?.provider ?? null,
          }))
          .filter((m: AgentMessage) => m.content.trim().length > 0);
        setSessionId(existing);
        setMessages(loaded);
      })
      .catch(() => localStorage.removeItem(storageKey))
      .finally(() => setLoadingSession(false));
  }, [isOpen, storageKey]);

  const send = async (text: string, origin: "voice" | "text" = "text") => {
    const message = text.trim();
    if (!message || sending) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: message, origin },
    ]);
    setCreditError(null);

    try {
      const response = await fetch("/api/ai-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          ...(projectId ? { projectId } : {}),
          ...(newConversationRef.current ? { newConversation: true } : {}),
          message,
          provider: model,
          pageContext: {
            view,
            visibleTaskCount: typeof visibleTaskCount === "number" ? visibleTaskCount : undefined,
            // The Today view computes "today" in the browser's local timezone.
            // Send it so the server-side agent resolves the same calendar date
            // (the API host is typically UTC, which otherwise drifts a day).
            timezone:
              (() => {
                try {
                  return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
                } catch {
                  return undefined;
                }
              })(),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Agent request failed");

      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(storageKey, data.sessionId);
      }
      // The fresh session has been created server-side; subsequent messages
      // continue it rather than starting yet another new one.
      newConversationRef.current = false;
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: String(data.assistantMessage || ""),
          provider: data.provider ?? null,
        },
      ]);

      // Refresh the page after any data-changing action. Trust the server's
      // `mutated` flag and, as a fallback, the set of tools that actually ran.
      // The fallback uses the same create_/update_/delete_/complete_ naming
      // convention as the server so org/project mutations (create_project,
      // delete_organization, …) refresh the left-nav tree too — not just tasks.
      // Dispatch a global event so any mounted view (and the voice feature)
      // refreshes via one shared mechanism.
      const NON_PREFIXED_MUTATING_TOOLS = new Set([
        "add_task_to_today",
        "set_task_estimate",
        "inbox_action",
      ]);
      const toolMutates = (t: string) =>
        /^(create|update|delete|complete)_/.test(t) ||
        NON_PREFIXED_MUTATING_TOOLS.has(t);
      const didMutate =
        Boolean(data.mutated) ||
        (Array.isArray(data.toolsUsed) && data.toolsUsed.some(toolMutates));
      if (didMutate) {
        if (onCreated) await onCreated();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("focusforge:data-changed"));
        }
      }
    } catch (error: any) {
      const message = error?.message || "Unknown error";
      if (isAiCreditError(message)) {
        setCreditError(message);
        showAiCreditAlert(message);
      } else {
        showError("Assistant request failed", message);
      }
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    if (recording || transcribing || sending) return;
    try {
      await recorder.start();
    } catch (err) {
      showError(
        "Microphone unavailable",
        err instanceof Error ? err.message : "Could not start recording.",
      );
    }
  };

  // Stop recording, transcribe via Whisper, then auto-send the transcript to
  // the agent as a voice-origin message in this same conversation.
  const stopAndSend = async () => {
    setTranscribing(true);
    try {
      const blob = await recorder.stop();
      if (!blob) {
        showError("No audio captured", "Please try again.");
        return;
      }
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      if (sttProvider !== "auto") fd.append("provider", sttProvider);
      const resp = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || "Transcription failed");
      const text = String(data.text || "").trim();
      if (!text) {
        showError("Empty transcript", "Nothing was detected. Please retry.");
        return;
      }
      await send(text, "voice");
    } catch (err: any) {
      showError("Voice failed", err?.message || "Could not transcribe audio.");
    } finally {
      setTranscribing(false);
    }
  };

  const cancelRecording = () => {
    recorder.cancel();
  };

  const openPopout = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (projectName) params.set("projectName", projectName);
    if (view) params.set("view", view);
    const qs = params.toString();
    const url = `/assistant${qs ? `?${qs}` : ""}`;
    const popup = window.open(
      url,
      "focusforge-assistant",
      "width=460,height=760,menubar=no,toolbar=no,location=no,status=no",
    );
    // Guard for popup-blocked: fall back to opening in a new tab, and if that's
    // also blocked, leave the floating widget open and surface a toast.
    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      const tab = window.open(url, "_blank");
      if (!tab) {
        showError(
          "Pop-out blocked",
          "Allow pop-ups for this site to open the assistant in a separate window.",
        );
        return;
      }
    }
    setIsOpen(false);
  };

  // On the dedicated popout route, only the embedded instance renders.
  if (!embedded && pathname === "/assistant") return null;

  return (
    <>
      {!embedded && (
        <button
          type="button"
          aria-label="Open AI assistant"
          title="Open AI assistant"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] z-50 rounded-full border border-zinc-700 bg-zinc-900 p-3 text-zinc-100 shadow-lg transition hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 ring-theme"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      {isOpen && (
        <div
          className={
            embedded
              ? "fixed inset-0 z-50 flex h-screen w-screen flex-col bg-zinc-950"
              : "fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] z-50 flex h-[78vh] w-[min(94vw,460px)] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
          }
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Focus Forge Assistant</p>
              <p className="text-xs text-zinc-400">{projectName || "All projects"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startNewConversation}
                disabled={sending || (messages.length === 0 && !sessionId)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 ring-theme disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="New conversation"
                title="New conversation"
              >
                <SquarePen className="h-4 w-4" />
              </button>
              {!embedded && (
                <button
                  type="button"
                  onClick={openPopout}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 ring-theme"
                  aria-label="Pop out assistant"
                  title="Open in a separate window"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => (embedded ? window.close() : setIsOpen(false))}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 ring-theme"
                aria-label={embedded ? "Close window" : "Close assistant"}
                title={embedded ? "Close window" : "Close assistant"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loadingSession ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading conversation...
              </div>
            ) : (
              <>
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
                      Ask about your tasks or tell me what to do — by typing or tapping the mic to
                      speak. I can answer questions and create, edit, complete, or delete tasks for you.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          type="button"
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 ring-theme"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="flex w-10 flex-shrink-0 flex-col items-center gap-1 pt-0.5">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-white/10"
                            style={{ backgroundColor: providerMeta(msg.provider).bg }}
                          >
                            <ProviderLogo provider={msg.provider} />
                          </span>
                          <span className="text-xs sm:text-[9px] leading-none text-zinc-500">
                            {providerMeta(msg.provider).name}
                          </span>
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          msg.role === "user" ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-100"
                        }`}
                      >
                        {msg.role === "user" && msg.origin === "voice" && (
                          <span className="mb-1 flex items-center gap-1 text-xs sm:text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            <Mic className="h-3 w-3" />
                            Voice
                          </span>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {creditError && (
                  <button
                    type="button"
                    onClick={openLlmProviderSettings}
                    className="mt-3 flex w-full items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/60 px-3 py-2.5 text-left transition-colors hover:border-rose-400/60 hover:bg-rose-950/80"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-zinc-100">
                        {AI_CREDIT_ALERT_TITLE}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-zinc-300/90">
                        {creditError}
                      </span>
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-200">
                        <ExternalLink className="h-3 w-3" />
                        Open AI connections
                      </span>
                    </span>
                  </button>
                )}

                {sending && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Working...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="border-t border-zinc-800 p-3">
            {recording ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-400 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 ring-theme"
                  aria-label="Cancel recording"
                  title="Cancel recording"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                  <div className="flex h-5 flex-1 items-end gap-0.5">
                    {Array.from({ length: 16 }).map((_, i) => {
                      const seed = (Math.sin(Date.now() / 120 + i) + 1) / 2;
                      const h = Math.max(3, Math.min(20, recorder.level * 20 * (0.4 + seed)));
                      return <span key={i} className="w-1 flex-1 rounded bg-amber-400" style={{ height: `${h}px` }} />;
                    })}
                  </div>
                  <span className="text-xs tabular-nums text-amber-200">
                    {Math.floor(recorder.elapsedMs / 1000)}s
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopAndSend}
                  className="flex h-[38px] items-center gap-1 rounded-xl bg-amber-500 px-3 text-sm font-medium text-black hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 ring-theme"
                  aria-label="Stop and send"
                  title="Stop and send"
                >
                  <Square className="h-4 w-4" /> Send
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder={transcribing ? "Transcribing…" : "Ask, or tap the mic to speak…"}
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
                  disabled={sending || transcribing}
                />
                <Select
                  value={model}
                  onValueChange={(value) => {
                    const next = value as ModelChoice;
                    setModel(next);
                    if (typeof window !== "undefined") localStorage.setItem(MODEL_STORAGE_KEY, next);
                  }}
                  disabled={sending}
                >
                  <SelectTrigger
                    title="Choose which model answers"
                    aria-label="Choose which model answers"
                    className="h-[38px] w-auto gap-1 rounded-xl border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:border-zinc-500"
                  >
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[10rem]">
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sttProvider}
                  onValueChange={(value) => {
                    const next = value as SttProviderPreference;
                    setSttProvider(next);
                    if (typeof window !== "undefined") localStorage.setItem(STT_STORAGE_KEY, next);
                  }}
                  disabled={sending || transcribing}
                >
                  <SelectTrigger
                    title="Choose which voice transcription provider to use"
                    aria-label="Choose voice transcription provider"
                    className="h-[38px] w-auto gap-1 rounded-xl border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:border-zinc-500"
                  >
                    <Mic className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[12rem]">
                    {STT_PROVIDER_OPTIONS.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {input.trim() ? (
                  <button
                    type="button"
                    onClick={() => send(input)}
                    disabled={sending || transcribing}
                    aria-busy={sending}
                    className="h-[38px] rounded-xl border border-zinc-700 bg-zinc-100 px-3 text-zinc-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 ring-theme disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                    aria-label="Send message"
                    title="Send message"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={sending || transcribing}
                    aria-busy={transcribing}
                    className="flex h-[38px] w-[42px] items-center justify-center rounded-xl border border-zinc-700 bg-zinc-100 text-zinc-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 ring-theme disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                    aria-label={transcribing ? "Transcribing voice message…" : "Record voice message"}
                    title="Tap to speak"
                  >
                    {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
