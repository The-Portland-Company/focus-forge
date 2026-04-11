import type { InboxItem, InboxParticipant } from "@/lib/types";

export function buildEmailPushNotificationContent(params: {
  mailboxName?: string | null;
  mailboxEmailAddress?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  subject?: string | null;
}) {
  const title =
    params.mailboxName?.trim() ||
    params.mailboxEmailAddress?.trim() ||
    "New email";
  const sender =
    params.senderName?.trim() || params.senderEmail?.trim() || "Someone";
  const subject = params.subject?.trim();

  return {
    title,
    body: subject ? `${sender}: ${subject}` : `${sender} sent a new email`,
  };
}

export function shouldSendEmailPushNotification(params: {
  hadPreviousSync: boolean;
  status?: string | null;
  classification?: string | null;
  alwaysDelete?: boolean | null;
}) {
  if (!params.hadPreviousSync) {
    return false;
  }

  if (params.alwaysDelete) {
    return false;
  }

  if (params.status === "deleted" || params.status === "quarantine") {
    return false;
  }

  if (params.classification === "spam") {
    return false;
  }

  return true;
}

function notificationTimestamp(value?: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getInboxNotificationSender(
  participants: InboxParticipant[] | undefined,
) {
  const sender = participants?.find(
    (participant) => participant.participantRole === "from",
  );

  return {
    senderName: sender?.displayName ?? null,
    senderEmail: sender?.emailAddress ?? null,
  };
}

export function buildInboxBrowserNotificationContent(
  item: Pick<
    InboxItem,
    "mailboxName" | "mailboxEmailAddress" | "participants" | "subject"
  >,
) {
  const sender = getInboxNotificationSender(item.participants);

  return buildEmailPushNotificationContent({
    mailboxName: item.mailboxName,
    mailboxEmailAddress: item.mailboxEmailAddress,
    senderName: sender.senderName,
    senderEmail: sender.senderEmail,
    subject: item.subject,
  });
}

export function listNewInboxItemsForNotification(params: {
  previousItems: InboxItem[];
  nextItems: InboxItem[];
}) {
  const previousById = new Map(
    params.previousItems.map((item) => [item.id, item] as const),
  );

  return params.nextItems.filter((item) => {
    if (
      !shouldSendEmailPushNotification({
        hadPreviousSync: true,
        status: item.status,
        classification: item.classification,
        alwaysDelete: item.alwaysDelete,
      })
    ) {
      return false;
    }

    const previousItem = previousById.get(item.id);
    const nextInboundAt = notificationTimestamp(
      item.latestInboundAt || item.createdAt,
    );

    if (!previousItem) {
      return nextInboundAt > 0;
    }

    const previousInboundAt = notificationTimestamp(
      previousItem.latestInboundAt || previousItem.createdAt,
    );

    return nextInboundAt > previousInboundAt;
  });
}
