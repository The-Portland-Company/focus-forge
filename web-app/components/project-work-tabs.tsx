"use client";

import type { ReactNode } from "react";
import { CheckSquare, Mail } from "lucide-react";

export type ProjectWorkTab = "tasks" | "emails";

type ProjectWorkTabsProps = {
  activeTab: ProjectWorkTab;
  emailCount: number;
  taskCount: number;
  onTabChange: (tab: ProjectWorkTab) => void;
  taskContent: ReactNode;
  emailContent: ReactNode;
};

export function ProjectWorkTabs({
  activeTab,
  emailCount,
  taskCount,
  onTabChange,
  taskContent,
  emailContent,
}: ProjectWorkTabsProps) {
  const getTabClassName = (tab: ProjectWorkTab) =>
    `inline-flex items-center gap-2 rounded-t-lg border px-4 py-2 text-sm font-medium transition-colors ${
      activeTab === tab
        ? "border-zinc-800 border-b-zinc-900 bg-zinc-900/40 text-white"
        : "border-zinc-800 bg-zinc-950/70 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
    }`;

  return (
    <div className="mb-5">
      <div className="flex items-end gap-1" role="tablist">
        <button
          type="button"
          onClick={() => onTabChange("tasks")}
          className={getTabClassName("tasks")}
          role="tab"
          id="project-work-tab-tasks"
          aria-selected={activeTab === "tasks"}
          aria-controls="project-work-panel-tasks"
        >
          <CheckSquare className="h-4 w-4" />
          <span>Tasks</span>
          <span className="rounded-full border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
            {taskCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange("emails")}
          className={getTabClassName("emails")}
          role="tab"
          id="project-work-tab-emails"
          aria-selected={activeTab === "emails"}
          aria-controls="project-work-panel-emails"
        >
          <Mail className="h-4 w-4" />
          <span>Email Work</span>
          <span className="rounded-full border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
            {emailCount}
          </span>
        </button>
      </div>
      <div
        id={
          activeTab === "emails"
            ? "project-work-panel-emails"
            : "project-work-panel-tasks"
        }
        className="rounded-b-lg rounded-tr-lg border border-zinc-800 bg-zinc-900/40 p-3"
        role="tabpanel"
        aria-labelledby={
          activeTab === "emails"
            ? "project-work-tab-emails"
            : "project-work-tab-tasks"
        }
      >
        {activeTab === "emails" ? emailContent : taskContent}
      </div>
    </div>
  );
}
