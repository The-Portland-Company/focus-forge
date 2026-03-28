"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Filter,
  Play,
  Square,
  Trash2,
  Search,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type {
  TimeTrackingBootstrap,
  TimeTrackingEntry,
} from "@/lib/time/types";
import { formatElapsed } from "@/lib/time/client";

type DraftEntryState = {
  organizationId: string;
  projectId: string;
  sectionId: string;
  taskIds: string[];
  title: string;
  description: string;
  timezone: string;
  startedAt: string;
  endedAt: string;
};

type FiltersState = {
  organizationId: string;
  projectId: string;
  sectionId: string;
  taskIds: string[];
  userIds: string[];
  roles: string[];
  query: string;
  startedAfter: string;
  endedBefore: string;
};

const toLocalDateTimeValue = (value: Date) => {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
};

export function TimeTrackingView() {
  const [bootstrap, setBootstrap] = useState<TimeTrackingBootstrap | null>(null);
  const [entries, setEntries] = useState<TimeTrackingEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<TimeTrackingEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState("00:00:00");
  const [filters, setFilters] = useState<FiltersState>({
    organizationId: "",
    projectId: "",
    sectionId: "",
    taskIds: [],
    userIds: [],
    roles: [],
    query: "",
    startedAfter: "",
    endedBefore: "",
  });
  const [draft, setDraft] = useState<DraftEntryState>({
    organizationId: "",
    projectId: "",
    sectionId: "",
    taskIds: [],
    title: "Focus session",
    description: "",
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC",
    startedAt: toLocalDateTimeValue(new Date()),
    endedAt: "",
  });

  const selectedProjects = useMemo(
    () =>
      (bootstrap?.projects || []).filter(
        (project) =>
          !filters.organizationId || project.organizationId === filters.organizationId,
      ),
    [bootstrap?.projects, filters.organizationId],
  );

  const availableSections = useMemo(
    () =>
      (bootstrap?.sections || []).filter(
        (section) => !draft.projectId || section.projectId === draft.projectId,
      ),
    [bootstrap?.sections, draft.projectId],
  );

  const filterSections = useMemo(
    () =>
      (bootstrap?.sections || []).filter(
        (section) => !filters.projectId || section.projectId === filters.projectId,
      ),
    [bootstrap?.sections, filters.projectId],
  );

  const availableTasks = useMemo(
    () =>
      (bootstrap?.tasks || []).filter((task) => {
        if (draft.sectionId) {
          return task.sectionId === draft.sectionId;
        }
        if (draft.projectId) {
          return task.projectId === draft.projectId;
        }
        return true;
      }),
    [bootstrap?.tasks, draft.projectId, draft.sectionId],
  );

  const filterTasks = useMemo(
    () =>
      (bootstrap?.tasks || []).filter((task) => {
        if (filters.sectionId) {
          return task.sectionId === filters.sectionId;
        }
        if (filters.projectId) {
          return task.projectId === filters.projectId;
        }
        return true;
      }),
    [bootstrap?.tasks, filters.projectId, filters.sectionId],
  );

  const loadBootstrap = async () => {
    const response = await fetch("/api/v1/time/bootstrap", { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message || "Failed to load time tracking bootstrap.");
    }
    setBootstrap(payload.data);
    setDraft((current) => ({
      ...current,
      organizationId: current.organizationId || payload.data.organizations?.[0]?.id || "",
    }));
    setFilters((current) => ({
      ...current,
      organizationId: current.organizationId || payload.data.organizations?.[0]?.id || "",
    }));
  };

  const loadEntries = async (nextFilters = filters) => {
    const searchParams = new URLSearchParams();
    if (nextFilters.organizationId) searchParams.set("organizationId", nextFilters.organizationId);
    if (nextFilters.projectId) searchParams.set("projectId", nextFilters.projectId);
    if (nextFilters.sectionId) searchParams.set("sectionId", nextFilters.sectionId);
    if (nextFilters.taskIds.length > 0) searchParams.set("taskIds", nextFilters.taskIds.join(","));
    if (nextFilters.userIds.length > 0) searchParams.set("userIds", nextFilters.userIds.join(","));
    if (nextFilters.roles.length > 0) searchParams.set("roles", nextFilters.roles.join(","));
    if (nextFilters.query) searchParams.set("query", nextFilters.query);
    if (nextFilters.startedAfter) {
      searchParams.set("startedAfter", new Date(nextFilters.startedAfter).toISOString());
    }
    if (nextFilters.endedBefore) {
      searchParams.set("endedBefore", new Date(nextFilters.endedBefore).toISOString());
    }

    const response = await fetch(`/api/v1/time/entries?${searchParams.toString()}`, {
      credentials: "include",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message || "Failed to load time entries.");
    }
    setEntries(payload.data || []);
  };

  const loadCurrent = async () => {
    const response = await fetch("/api/v1/time/current", { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message || "Failed to load current timer.");
    }
    setCurrentEntry(payload.data || null);
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadBootstrap(), loadEntries(), loadCurrent()]);
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || "Failed to load Focus: Time.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentEntry?.startedAt || currentEntry.endedAt) {
      setElapsed("00:00:00");
      return;
    }

    setElapsed(formatElapsed(currentEntry.startedAt));
    const interval = window.setInterval(() => {
      setElapsed(formatElapsed(currentEntry.startedAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentEntry?.endedAt, currentEntry?.startedAt]);

  const refreshAll = async () => {
    setError(null);
    try {
      await Promise.all([loadBootstrap(), loadEntries(), loadCurrent()]);
    } catch (refreshError: any) {
      setError(refreshError?.message || "Failed to refresh Focus: Time.");
    }
  };

  const submitEntry = async (withEndTime: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        organizationId: draft.organizationId,
        projectId: draft.projectId || null,
        sectionId: draft.sectionId || null,
        taskIds: draft.taskIds,
        title: draft.title.trim() || "Focus session",
        description: draft.description.trim() || null,
        timezone: draft.timezone,
        startedAt: new Date(draft.startedAt).toISOString(),
        endedAt:
          withEndTime && draft.endedAt ? new Date(draft.endedAt).toISOString() : null,
      };

      const response = await fetch("/api/v1/time/entries", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to create time entry.");
      }

      await Promise.all([loadEntries(), loadCurrent()]);
      setDraft((current) => ({
        ...current,
        title: "Focus session",
        description: "",
        taskIds: [],
        endedAt: "",
        startedAt: toLocalDateTimeValue(new Date()),
      }));
    } catch (submitError: any) {
      setError(submitError?.message || "Failed to create time entry.");
    } finally {
      setSaving(false);
    }
  };

  const stopCurrent = async () => {
    if (!currentEntry) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/time/entries/${currentEntry.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt: new Date().toISOString() }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to stop timer.");
      }
      await Promise.all([loadEntries(), loadCurrent()]);
    } catch (stopError: any) {
      setError(stopError?.message || "Failed to stop timer.");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/time/entries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to delete time entry.");
      }
      await Promise.all([loadEntries(), loadCurrent()]);
    } catch (deleteError: any) {
      setError(deleteError?.message || "Failed to delete time entry.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">
        Loading Focus: Time...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Focus: Time</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Time Tracking</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Start a live timer or log a manual entry with org, project, task list, and multi-task attribution.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/developer/api"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              API Docs
            </Link>
            <Link
              href="/docs/focus-time-agent"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-800/70 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-200 transition hover:border-emerald-600 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              Public Agent Prompt
            </Link>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-center gap-2 text-zinc-300">
              <Clock3 className="h-4 w-4 text-emerald-300" />
              Current Timer
            </div>
            {currentEntry ? (
              <div className="mt-4 space-y-4">
                <div className="text-4xl font-semibold tracking-tight text-white">{elapsed}</div>
                <div className="space-y-1 text-sm text-zinc-400">
                  <div>{currentEntry.title}</div>
                  <div>{currentEntry.organization?.name}</div>
                  <div>
                    {[currentEntry.project?.name, currentEntry.section?.name]
                      .filter(Boolean)
                      .join(" / ") || "No project or task list"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void stopCurrent()}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
                >
                  <Square className="h-4 w-4" />
                  Stop Timer
                </button>
              </div>
            ) : (
              <div className="mt-4 text-sm text-zinc-500">No active timer.</div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-center gap-2 text-zinc-300">
              <Filter className="h-4 w-4 text-sky-300" />
              Session Details
            </div>
            <div className="mt-4 grid gap-3">
              <select
                value={draft.organizationId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    organizationId: event.target.value,
                    projectId: "",
                    sectionId: "",
                    taskIds: [],
                  }))
                }
                className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              >
                <option value="">Select organization</option>
                {(bootstrap?.organizations || []).map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
              <select
                value={draft.projectId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    projectId: event.target.value,
                    sectionId: "",
                    taskIds: [],
                  }))
                }
                className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              >
                <option value="">Optional project</option>
                {(bootstrap?.projects || [])
                  .filter(
                    (project) =>
                      !draft.organizationId || project.organizationId === draft.organizationId,
                  )
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
              <select
                value={draft.sectionId}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sectionId: event.target.value,
                    taskIds: [],
                  }))
                }
                className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              >
                <option value="">Optional task list</option>
                {availableSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Session title"
                className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
              <input
                value={draft.timezone}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, timezone: event.target.value }))
                }
                placeholder="Timezone"
                className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
              <input
                type="datetime-local"
                value={draft.startedAt}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, startedAt: event.target.value }))
                }
                className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
              <input
                type="datetime-local"
                value={draft.endedAt}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, endedAt: event.target.value }))
                }
                className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
            </div>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              rows={4}
              placeholder="Optional notes"
              className="mt-3 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            />
            <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Tasks</div>
              <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto md:grid-cols-2">
                {availableTasks.length === 0 ? (
                  <div className="text-sm text-zinc-500">No tasks available for the current filters.</div>
                ) : (
                  availableTasks.map((task) => {
                    const checked = draft.taskIds.includes(task.id);
                    return (
                      <label
                        key={task.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                          checked
                            ? "border-emerald-600 bg-emerald-950/40 text-emerald-100"
                            : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              taskIds: event.target.checked
                                ? [...current.taskIds, task.id]
                                : current.taskIds.filter((taskId) => taskId !== task.id),
                            }))
                          }
                        />
                        <span>{task.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving || !draft.organizationId}
                onClick={() => void submitEntry(false)}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                Start Timer
              </button>
              <button
                type="button"
                disabled={saving || !draft.organizationId || !draft.endedAt}
                onClick={() => void submitEntry(true)}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-white disabled:opacity-60"
              >
                <Clock3 className="h-4 w-4" />
                Save Manual Entry
              </button>
            </div>
            {error ? <div className="mt-3 text-sm text-rose-300">{error}</div> : null}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Available users</div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {(bootstrap?.users || []).map((user) => (
                <div
                  key={user.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-200"
                >
                  <div className="font-medium text-white">{user.name}</div>
                  <div className="text-xs uppercase tracking-[0.15em] text-zinc-500">
                    {user.role || "team_member"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6">
        <div className="flex items-center gap-2 text-zinc-300">
          <Search className="h-4 w-4 text-zinc-500" />
          Report Filters
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-4">
          <select
            value={filters.organizationId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                organizationId: event.target.value,
                projectId: "",
                sectionId: "",
                taskIds: [],
              }))
            }
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          >
            <option value="">All organizations</option>
            {(bootstrap?.organizations || []).map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <select
            value={filters.projectId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                projectId: event.target.value,
                sectionId: "",
                taskIds: [],
              }))
            }
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          >
            <option value="">All projects</option>
            {selectedProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={filters.sectionId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                sectionId: event.target.value,
                taskIds: [],
              }))
            }
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          >
            <option value="">All task lists</option>
            {filterSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
          <input
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
            placeholder="Search title, notes, user, task..."
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <input
            type="datetime-local"
            value={filters.startedAfter}
            onChange={(event) =>
              setFilters((current) => ({ ...current, startedAfter: event.target.value }))
            }
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <input
            type="datetime-local"
            value={filters.endedBefore}
            onChange={(event) =>
              setFilters((current) => ({ ...current, endedBefore: event.target.value }))
            }
            className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <select
            multiple
            value={filters.userIds}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                userIds: Array.from(event.target.selectedOptions).map((option) => option.value),
              }))
            }
            className="min-h-[130px] rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          >
            {(bootstrap?.users || []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <select
            multiple
            value={filters.roles}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                roles: Array.from(event.target.selectedOptions).map((option) => option.value),
              }))
            }
            className="min-h-[130px] rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          >
            {["team_member", "admin", "super_admin"].map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Filter tasks</div>
          <div className="mt-3 grid max-h-40 gap-2 overflow-y-auto md:grid-cols-3">
            {filterTasks.map((task) => {
              const checked = filters.taskIds.includes(task.id);
              return (
                <label
                  key={task.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                    checked
                      ? "border-sky-600 bg-sky-950/40 text-sky-100"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        taskIds: event.target.checked
                          ? [...current.taskIds, task.id]
                          : current.taskIds.filter((taskId) => taskId !== task.id),
                      }))
                    }
                  />
                  <span>{task.name}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void loadEntries(filters)}
            className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500"
          >
            <Filter className="h-4 w-4" />
            Apply Filters
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Time Report</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {entries.length} entries matching the current filters.
            </p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-800 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-zinc-500">
                <th className="pb-3 pr-4">User</th>
                <th className="pb-3 pr-4">Organization</th>
                <th className="pb-3 pr-4">Project / Task List</th>
                <th className="pb-3 pr-4">Tasks</th>
                <th className="pb-3 pr-4">Started</th>
                <th className="pb-3 pr-4">Ended</th>
                <th className="pb-3 pr-4">Timezone</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top text-zinc-200">
                  <td className="py-4 pr-4">
                    <div className="font-medium text-white">{entry.user?.name || entry.userId}</div>
                    <div className="text-xs uppercase tracking-[0.15em] text-zinc-500">
                      {entry.user?.role || "team_member"}
                    </div>
                  </td>
                  <td className="py-4 pr-4">{entry.organization?.name || entry.organizationId}</td>
                  <td className="py-4 pr-4">
                    <div>{entry.project?.name || "No project"}</div>
                    <div className="text-xs text-zinc-500">
                      {entry.section?.name || "No task list"}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex max-w-xs flex-wrap gap-2">
                      {(entry.tasks || []).length > 0 ? (
                        (entry.tasks || []).map((task) => (
                          <span
                            key={task.id}
                            className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
                          >
                            {task.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-500">No tasks</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    {new Date(entry.startedAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="py-4 pr-4">
                    {entry.endedAt
                      ? new Date(entry.endedAt).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Running"}
                  </td>
                  <td className="py-4 pr-4">{entry.timezone}</td>
                  <td className="py-4 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteEntry(entry.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-800/80 bg-rose-950/30 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:border-rose-600 hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-10 text-center text-sm text-zinc-500">
              No time entries match the current filters.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
