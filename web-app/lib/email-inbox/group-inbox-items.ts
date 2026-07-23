/**
 * Inbox grouping: cluster the visible list by Sender, Project, or
 * Project→Sender, driven by the quick toggle on the Filters row. Grouping is
 * a stable reorder — within a group, items keep their current sort order —
 * plus a label wherever a new group starts (rendered as a separator row).
 */

export type InboxGroupBy = "none" | "sender" | "project" | "project_sender";

export const INBOX_GROUP_BY_STORAGE_KEY = "focus-forge:email-inbox-group-by";

export const INBOX_GROUP_BY_OPTIONS: Array<{
  id: InboxGroupBy;
  label: string;
}> = [
  { id: "none", label: "None" },
  { id: "sender", label: "Sender" },
  { id: "project", label: "Project" },
  { id: "project_sender", label: "Project › Sender" },
];

export function normalizeInboxGroupBy(value: unknown): InboxGroupBy {
  return value === "sender" ||
    value === "project" ||
    value === "project_sender" ||
    value === "none"
    ? value
    : "none";
}

/** Minimal item surface this module reads. */
type GroupableItem = {
  projectId?: string | null;
};

const UNASSIGNED_PROJECT_LABEL = "No project";
const UNKNOWN_SENDER_LABEL = "Unknown sender";

export function getInboxItemGroupLabel<T extends GroupableItem>(
  item: T,
  groupBy: InboxGroupBy,
  getSenderName: (item: T) => string,
  getProjectName: (projectId: string | null | undefined) => string | null,
): string | null {
  if (groupBy === "none") return null;

  const senderLabel = () => getSenderName(item) || UNKNOWN_SENDER_LABEL;
  const projectLabel = () =>
    getProjectName(item.projectId) || UNASSIGNED_PROJECT_LABEL;

  if (groupBy === "sender") return senderLabel();
  if (groupBy === "project") return projectLabel();
  return `${projectLabel()} › ${senderLabel()}`;
}

/**
 * Stable-cluster `items` by group label (groups ordered by the position of
 * their first occurrence, so grouping respects the active sort — e.g. with
 * newest-first sort, the group with the newest email comes first).
 */
export function groupInboxItems<T extends GroupableItem>(
  items: T[],
  groupBy: InboxGroupBy,
  getSenderName: (item: T) => string,
  getProjectName: (projectId: string | null | undefined) => string | null,
): T[] {
  if (groupBy === "none" || items.length < 2) return items;

  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const label =
      getInboxItemGroupLabel(item, groupBy, getSenderName, getProjectName) ??
      "";
    const bucket = buckets.get(label);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(label, [item]);
    }
  }
  if (buckets.size <= 1) return items;
  return Array.from(buckets.values()).flat();
}
