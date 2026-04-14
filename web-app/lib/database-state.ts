import type { Database } from "@/lib/types";

export function mergeDatabasePayload(
  previous: Database | null,
  next: Database,
  options: {
    preserveInboxItems?: boolean;
  } = {},
): Database {
  if (
    !options.preserveInboxItems ||
    !previous ||
    previous.inboxItems.length === 0 ||
    next.inboxItems.length > 0
  ) {
    return next;
  }

  return {
    ...next,
    inboxItems: previous.inboxItems,
    quarantineCount: previous.quarantineCount,
  };
}
