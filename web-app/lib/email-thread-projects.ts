import type { Database } from "@/lib/types";

type InboxProjectOption = Database["projects"][number];

const inboxProjectCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function sortInboxProjects(projects: InboxProjectOption[]) {
  return [...projects].sort((left, right) =>
    inboxProjectCollator.compare(
      left.name.trim() || left.name,
      right.name.trim() || right.name,
    ),
  );
}

export function filterInboxProjects(
  projects: InboxProjectOption[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();

  return sortInboxProjects(projects).filter((project) => {
    if (!normalizedQuery) return true;
    return project.name.toLowerCase().includes(normalizedQuery);
  });
}

export function getThreadProjectId(
  thread:
    | {
        projectId?: string | null;
        project_id?: string | null;
      }
    | null
    | undefined,
) {
  return thread?.projectId || thread?.project_id || "";
}
