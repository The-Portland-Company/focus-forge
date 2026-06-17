import type { Database } from "@/lib/types";

export function mergeDatabasePayload(
  previous: Database | null,
  next: Database,
  options: {
    preserveInboxItems?: boolean;
    preserveEmailData?: boolean;
  } = {},
): Database {
  // A server-seeded payload can omit email-related collections (they're loaded
  // client-side later). Normalize them to arrays so views that map/reduce over
  // database.mailboxes / database.inboxItems never crash on `undefined`.
  next = {
    ...next,
    mailboxes: next.mailboxes ?? [],
    inboxItems: next.inboxItems ?? [],
  };

  const shouldPreserveInboxItems =
    (options.preserveInboxItems || options.preserveEmailData) &&
    previous &&
    previous.inboxItems.length > 0 &&
    next.inboxItems.length === 0;

  if (options.preserveEmailData && previous) {
    return {
      ...next,
      mailboxes: previous.mailboxes,
      inboxItems: shouldPreserveInboxItems
        ? previous.inboxItems
        : next.inboxItems,
      emailRules: previous.emailRules,
      summaryProfiles: previous.summaryProfiles,
      ruleStats: previous.ruleStats,
      quarantineCount: shouldPreserveInboxItems
        ? previous.quarantineCount
        : next.quarantineCount,
      sentCount: previous.sentCount,
    };
  }

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
