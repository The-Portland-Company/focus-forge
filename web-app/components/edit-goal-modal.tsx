"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Goal } from "@/lib/types";

export interface GoalEdits {
  name: string;
  description?: string;
  completed: boolean;
}

/**
 * Edit modal for a goal's own fields (name, description, completion). Mirrors
 * the add/edit-section modal shape so goals feel the same as task lists.
 */
export function EditGoalModal({
  isOpen,
  goal,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  goal: Goal | null;
  onClose: () => void;
  onSave: (goalId: string, edits: GoalEdits) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [completed, setCompleted] = useState(false);

  // Seed from the goal when opening; clear on close so a later open never
  // shows the previous goal's values.
  useEffect(() => {
    setName(isOpen ? (goal?.name ?? "") : "");
    setDescription(isOpen ? (goal?.description ?? "") : "");
    setCompleted(isOpen ? (goal?.completed ?? false) : false);
  }, [isOpen, goal]);

  if (!isOpen || !goal) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(goal.id, {
      name: trimmed,
      description: description.trim() || undefined,
      completed,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-zinc-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Edit Goal</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 transition-colors hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-400">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Goal name"
                className="w-full rounded bg-zinc-800 px-3 py-2 text-white transition-all focus:outline-none focus:ring-2 ring-theme"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-400">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add a description..."
                rows={3}
                className="w-full resize-none rounded bg-zinc-800 px-3 py-2 text-white transition-all focus:outline-none focus:ring-2 ring-theme"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={completed}
                onChange={(event) => setCompleted(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-800"
              />
              Mark this goal complete
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="btn-theme-primary rounded-lg px-4 py-2 text-white transition-all"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
