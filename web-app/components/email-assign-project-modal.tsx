"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FolderOpen, Search, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { suggestProjectsForInboxItem } from "@/lib/email-inbox/project-suggestions";
import type { InboxItem, Project } from "@/lib/types";

type EmailAssignProjectModalProps = {
  open: boolean;
  item: InboxItem | null;
  projects: Project[];
  onOpenChange: (open: boolean) => void;
  onAssign: (item: InboxItem, projectId: string | null) => void;
};

/**
 * Type-to-search project picker for an email, opened from the row's right-click
 * menu. Suggestions come first — ranked from the email's sender, subject, AI
 * summary and preview (see lib/email-inbox/project-suggestions) — each with the
 * reason it was suggested, so the choice can be trusted at a glance instead of
 * scrolling an alphabetical list.
 */
export function EmailAssignProjectModal({
  open,
  item,
  projects,
  onOpenChange,
  onAssign,
}: EmailAssignProjectModalProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlight(0);
      return;
    }
    const timer = setTimeout(() => searchRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  const currentProjectId = item
    ? ((item as { projectId?: string | null }).projectId ?? null)
    : null;

  const suggestions = useMemo(
    () => (item ? suggestProjectsForInboxItem(projects, item) : []),
    [item, projects],
  );

  const active = useMemo(
    () =>
      (projects || [])
        .filter((project) => !project.archived)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [projects],
  );

  // While searching, one flat ranked list; with an empty box, suggestions on
  // top and the rest below (minus the ones already shown as suggestions).
  const { suggested, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const matches = active.filter((project) =>
        project.name.toLowerCase().includes(q),
      );
      return { suggested: [], rest: matches };
    }
    const suggestedIds = new Set(suggestions.map((s) => s.project.id));
    return {
      suggested: suggestions,
      rest: active.filter((project) => !suggestedIds.has(project.id)),
    };
  }, [active, query, suggestions]);

  const ordered = useMemo(
    () => [...suggested.map((s) => s.project), ...rest],
    [rest, suggested],
  );

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const assign = (projectId: string | null) => {
    if (!item) return;
    onAssign(item, projectId);
    onOpenChange(false);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, ordered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      const project = ordered[highlight];
      if (project) {
        event.preventDefault();
        assign(project.id);
      }
    }
  };

  const rowClass = (project: Project, index: number) =>
    `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
      index === highlight
        ? "bg-zinc-800 text-white"
        : "text-zinc-200 hover:bg-zinc-800/70"
    }`;

  const swatch = (project: Project) => (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white"
      style={{ backgroundColor: project.color }}
    >
      {project.name.slice(0, 2).toUpperCase()}
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        windowTitle="Assign to project"
        className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-lg"
      >
        <DialogTitle className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-zinc-400" />
          Assign to project
        </DialogTitle>
        <DialogDescription className="text-zinc-400">
          {item?.subject || "This email"}
        </DialogDescription>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search projects…"
            aria-label="Search projects"
            className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
        </div>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {suggested.length > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wide text-zinc-500">
                <Sparkles className="h-3 w-3" />
                Suggested for this email
              </div>
              {suggested.map((suggestion, index) => (
                <button
                  key={suggestion.project.id}
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => assign(suggestion.project.id)}
                  className={rowClass(suggestion.project, index)}
                >
                  {swatch(suggestion.project)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {suggestion.project.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {suggestion.reason}
                    </span>
                  </span>
                  {suggestion.project.id === currentProjectId ? (
                    <Check className="h-4 w-4 shrink-0 text-zinc-400" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-1">
            {suggested.length > 0 ? (
              <div className="px-1 text-[10px] uppercase tracking-wide text-zinc-500">
                All projects
              </div>
            ) : null}
            {rest.length === 0 && suggested.length === 0 ? (
              <div className="px-2.5 py-6 text-center text-sm text-zinc-500">
                No projects match.
              </div>
            ) : (
              rest.map((project, index) => {
                const offset = suggested.length + index;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onMouseEnter={() => setHighlight(offset)}
                    onClick={() => assign(project.id)}
                    className={rowClass(project, offset)}
                  >
                    {swatch(project)}
                    <span className="min-w-0 flex-1 truncate">
                      {project.name}
                    </span>
                    {project.id === currentProjectId ? (
                      <Check className="h-4 w-4 shrink-0 text-zinc-400" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {currentProjectId ? (
          <button
            type="button"
            onClick={() => assign(null)}
            className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Remove from project
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
