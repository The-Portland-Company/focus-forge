"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, MessageSquare, Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/user-avatar";

type ProjectNote = {
  id: string;
  content: string;
  created_at: string;
  user_id?: string | null;
  author_name?: string | null;
  author_memoji?: string | null;
  author_email?: string | null;
};

interface ProjectNotesModalProps {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  initialDescription?: string | null;
  onClose: () => void;
  onSaveDescription: (description: string) => Promise<void> | void;
}

export function ProjectNotesModal({
  isOpen,
  projectId,
  projectName,
  initialDescription,
  onClose,
  onSaveDescription,
}: ProjectNotesModalProps) {
  const [description, setDescription] = useState(initialDescription || "");
  const [savingDescription, setSavingDescription] = useState(false);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!isOpen) return;
    setDescription(initialDescription || "");
  }, [initialDescription, isOpen]);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }, [supabase]);

  const getAuthorName = (note: ProjectNote) => {
    const explicit = (note.author_name || "").trim();
    if (explicit) return explicit;
    const email = (note.author_email || "").trim();
    if (email) return email;
    return "Unknown User";
  };

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError("No session token found. Please sign in again.");
        setLoadingNotes(false);
        return;
      }

      const response = await fetch(`/api/sync/comments?projectId=${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load notes");
      }

      setNotes(Array.isArray(payload) ? payload : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notes");
    } finally {
      setLoadingNotes(false);
    }
  }, [getAccessToken, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadNotes();
  }, [isOpen, loadNotes]);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setCurrentUserId(data.user?.id || null);
    })();
  }, [isOpen, supabase]);

  const handleSaveDescription = async () => {
    setSavingDescription(true);
    setError(null);
    try {
      await onSaveDescription(description);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save description");
    } finally {
      setSavingDescription(false);
    }
  };

  const handleAddNote = async () => {
    const content = newNote.trim();
    if (!content) return;

    setAddingNote(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError("No session token found. Please sign in again.");
        setAddingNote(false);
        return;
      }

      const response = await fetch("/api/sync/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          content,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to add note");
      }

      setNewNote("");
      setNotes((prev) => [payload as ProjectNote, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setAddingNote(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{projectName}</h2>
            <p className="text-xs text-zinc-500">Project Description + Notes</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a project description..."
              rows={4}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 ring-theme transition-all"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={handleSaveDescription}
                disabled={savingDescription}
                className="px-3 py-1.5 rounded bg-theme-gradient text-white text-sm disabled:opacity-60"
              >
                {savingDescription ? "Saving..." : "Save Description"}
              </button>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-medium text-zinc-300">Notes</h3>
            </div>

            <div className="mb-3 flex items-start gap-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
                rows={3}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 ring-theme transition-all"
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote || !newNote.trim()}
                className="mt-1 rounded-lg bg-zinc-800 border border-zinc-700 p-2 text-zinc-300 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors"
                title="Add note"
              >
                {addingNote ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
              {loadingNotes ? (
                <div className="text-sm text-zinc-500 py-4">Loading notes...</div>
              ) : notes.length === 0 ? (
                <div className="text-sm text-zinc-500 py-4">
                  No notes yet for this project.
                </div>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className={`flex ${note.user_id === currentUserId ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] ${note.user_id === currentUserId ? "items-end" : "items-start"} flex flex-col`}>
                      <div className="mb-1 flex items-center gap-2 px-1">
                        <UserAvatar
                          size={22}
                          name={getAuthorName(note)}
                          memoji={note.author_memoji}
                          ariaLabel={`${getAuthorName(note)} avatar`}
                        />
                        <p className="text-[11px] text-zinc-400">{getAuthorName(note)}</p>
                      </div>
                      <div
                        className={`relative rounded-2xl px-3 py-2 border text-sm whitespace-pre-wrap ${
                          note.user_id === currentUserId
                            ? "bg-theme-primary/20 border-theme-primary/40 text-zinc-100 rounded-br-md"
                            : "bg-zinc-900 border-zinc-700 text-zinc-200 rounded-bl-md"
                        }`}
                      >
                        {note.content}
                        <span
                          className={`absolute -bottom-1 h-2 w-2 rotate-45 border ${
                            note.user_id === currentUserId
                              ? "right-2 border-theme-primary/40 bg-theme-primary/20"
                              : "left-2 border-zinc-700 bg-zinc-900"
                          }`}
                        />
                      </div>
                      <p className="mt-1 px-1 text-[11px] text-zinc-500">
                        {new Date(note.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
