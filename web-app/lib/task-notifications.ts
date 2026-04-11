import { getAppBaseUrl } from "@/lib/auth/urls";
import { sendEmailMessage } from "@/lib/email";
import { getRichTextPreview, richTextToPlainText } from "@/lib/rich-text";
import { getAdminClient } from "@/lib/supabase/admin";

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name?: string | null;
  status?: string | null;
};

type TaskRow = {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  assigned_to: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  organization_id: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type CommentRecipientReason =
  | "assignee"
  | "commenter"
  | "assignee_and_commenter";

type CommentRecipient = {
  userId: string;
  reason: CommentRecipientReason;
};

const mentionPattern = /(^|[^a-z0-9_])@([a-z0-9][a-z0-9._@-]{0,127})/gi;

export function normalizeMentionKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/g, "")
    .replace(/[^a-z0-9@._-]+/g, "");
}

function getProfileDisplayName(profile: ProfileRow | null | undefined) {
  if (!profile) return "Someone";

  const fullName =
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return fullName || profile.display_name || profile.email || "Someone";
}

function getTaskNotificationSource(
  task: Pick<TaskRow, "name" | "description">,
) {
  return [task.name || "", richTextToPlainText(task.description || "")]
    .filter(Boolean)
    .join("\n");
}

function getNotificationLink(path = "") {
  const baseUrl = getAppBaseUrl();
  if (!path) return baseUrl;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function getTaskLink(projectId: string | null | undefined) {
  if (!projectId) return getNotificationLink();
  return getNotificationLink(`/project-${projectId}`);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderNotificationHtml(options: {
  title: string;
  greeting: string;
  intro: string;
  details?: Array<{ label: string; value: string | null | undefined }>;
  excerpt?: string | null;
  actionUrl?: string;
  actionLabel?: string;
  footer?: string;
}) {
  const details = (options.details || []).filter((detail) => detail.value);
  const detailsHtml = details.length
    ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0 0 0; border-collapse: collapse;">
          ${details
            .map(
              (detail) => `
                <tr>
                  <td style="padding: 8px 0; color: #71717a; font-size: 13px; width: 120px; vertical-align: top;">
                    ${escapeHtml(detail.label)}
                  </td>
                  <td style="padding: 8px 0; color: #f4f4f5; font-size: 14px; vertical-align: top;">
                    ${escapeHtml(String(detail.value))}
                  </td>
                </tr>
              `,
            )
            .join("")}
        </table>
      `
    : "";

  const excerptHtml = options.excerpt
    ? `
        <div style="margin-top: 20px; padding: 16px; border-radius: 10px; background-color: #18181b; border: 1px solid #3f3f46;">
          <div style="font-size: 12px; color: #71717a; margin-bottom: 8px;">Excerpt</div>
          <div style="font-size: 14px; line-height: 22px; color: #e4e4e7;">
            ${escapeHtml(options.excerpt)}
          </div>
        </div>
      `
    : "";

  const actionHtml =
    options.actionUrl && options.actionLabel
      ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
            <tr>
              <td align="center">
                <a
                  href="${escapeHtml(options.actionUrl)}"
                  style="display: inline-block; padding: 14px 28px; border-radius: 8px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600;"
                >
                  ${escapeHtml(options.actionLabel)}
                </a>
              </td>
            </tr>
          </table>
        `
      : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(options.title)}</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px; background-color: #0a0a0a;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; border-radius: 14px; overflow: hidden; background-color: #27272a; border: 1px solid #3f3f46;">
                <tr>
                  <td style="padding: 28px 32px; border-bottom: 1px solid #3f3f46;">
                    <div style="font-size: 22px; font-weight: 700; color: #ffffff;">Focus: Forge</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    <h1 style="margin: 0 0 16px 0; font-size: 22px; line-height: 30px; color: #ffffff;">
                      ${escapeHtml(options.greeting)}
                    </h1>
                    <p style="margin: 0; font-size: 15px; line-height: 24px; color: #d4d4d8;">
                      ${escapeHtml(options.intro)}
                    </p>
                    ${detailsHtml}
                    ${excerptHtml}
                    ${actionHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 32px; border-top: 1px solid #3f3f46; font-size: 12px; line-height: 18px; color: #71717a;">
                    ${escapeHtml(
                      options.footer ||
                        "You are receiving this email because of activity in Focus: Forge.",
                    )}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function renderNotificationText(options: {
  greeting: string;
  intro: string;
  details?: Array<{ label: string; value: string | null | undefined }>;
  excerpt?: string | null;
  actionUrl?: string;
  footer?: string;
}) {
  const lines = [options.greeting, "", options.intro];

  for (const detail of options.details || []) {
    if (!detail.value) continue;
    lines.push(`${detail.label}: ${detail.value}`);
  }

  if (options.excerpt) {
    lines.push("", `Excerpt: ${options.excerpt}`);
  }

  if (options.actionUrl) {
    lines.push("", `Open Focus: Forge: ${options.actionUrl}`);
  }

  lines.push(
    "",
    options.footer ||
      "You are receiving this email because of activity in Focus: Forge.",
  );

  return lines.join("\n");
}

async function fetchProfilesByIds(userIds: string[]) {
  const ids = Array.from(
    new Set(
      userIds.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );
  if (!ids.length) return new Map<string, ProfileRow>();

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,first_name,last_name,display_name,status")
    .in("id", ids);

  if (error) {
    throw error;
  }

  return new Map<string, ProfileRow>(
    ((data || []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  );
}

async function fetchOrganizationProfiles(organizationId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  const profiles = await fetchProfilesByIds(
    (data || [])
      .map((row: { user_id: string | null }) => row.user_id)
      .filter(
        (value: string | null): value is string =>
          typeof value === "string" && value.length > 0,
      ),
  );

  return Array.from(profiles.values());
}

async function fetchTaskContext(taskId: string) {
  const admin = getAdminClient();
  const { data: task, error: taskError } = await admin
    .from("tasks")
    .select("id,name,description,project_id,assigned_to")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    throw taskError || new Error("Task not found");
  }

  const typedTask = task as TaskRow;

  let project: ProjectRow | null = null;
  if (typedTask.project_id) {
    const { data: projectRow, error: projectError } = await admin
      .from("projects")
      .select("id,name,organization_id")
      .eq("id", typedTask.project_id)
      .single();

    if (projectError) {
      throw projectError;
    }

    project = projectRow as ProjectRow;
  }

  let organization: OrganizationRow | null = null;
  if (project?.organization_id) {
    const { data: organizationRow, error: organizationError } = await admin
      .from("organizations")
      .select("id,name")
      .eq("id", project.organization_id)
      .single();

    if (organizationError) {
      throw organizationError;
    }

    organization = organizationRow as OrganizationRow;
  }

  return { task: typedTask, project, organization };
}

async function sendNotification(options: {
  kind: string;
  entityId: string;
  recipient: ProfileRow;
  subject: string;
  greeting: string;
  intro: string;
  details?: Array<{ label: string; value: string | null | undefined }>;
  excerpt?: string | null;
  actionUrl?: string;
  actionLabel?: string;
  footer?: string;
}) {
  if (!options.recipient.email) {
    return null;
  }

  const delivery = await sendEmailMessage({
    to: options.recipient.email,
    subject: options.subject,
    html: renderNotificationHtml({
      title: options.subject,
      greeting: options.greeting,
      intro: options.intro,
      details: options.details,
      excerpt: options.excerpt,
      actionUrl: options.actionUrl,
      actionLabel: options.actionLabel,
      footer: options.footer,
    }),
    text: renderNotificationText({
      greeting: options.greeting,
      intro: options.intro,
      details: options.details,
      excerpt: options.excerpt,
      actionUrl: options.actionUrl,
      footer: options.footer,
    }),
  });

  console.info("Notification email sent", {
    kind: options.kind,
    entityId: options.entityId,
    to: options.recipient.email,
    messageId: delivery.messageId,
  });

  return delivery;
}

function addMentionAlias(
  aliasMap: Map<string, Set<string>>,
  rawAlias: string | null | undefined,
  userId: string,
) {
  const normalizedAlias = normalizeMentionKey(rawAlias);
  if (!normalizedAlias) return;

  const existing = aliasMap.get(normalizedAlias) || new Set<string>();
  existing.add(userId);
  aliasMap.set(normalizedAlias, existing);
}

export function extractMentionedProfileIds(
  text: string,
  profiles: ProfileRow[],
) {
  const plainText = richTextToPlainText(text || "");
  const aliasMap = new Map<string, Set<string>>();

  for (const profile of profiles) {
    if (!profile.id) continue;

    const firstName = String(profile.first_name || "").trim();
    const lastName = String(profile.last_name || "").trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const email = String(profile.email || "")
      .trim()
      .toLowerCase();
    const emailLocalPart = email.includes("@") ? email.split("@")[0] : "";

    addMentionAlias(aliasMap, email, profile.id);
    addMentionAlias(aliasMap, emailLocalPart, profile.id);
    addMentionAlias(aliasMap, profile.display_name, profile.id);
    addMentionAlias(aliasMap, fullName, profile.id);
    addMentionAlias(aliasMap, `${firstName}${lastName}`, profile.id);
    addMentionAlias(aliasMap, `${firstName}.${lastName}`, profile.id);
    addMentionAlias(aliasMap, `${firstName}_${lastName}`, profile.id);
    addMentionAlias(aliasMap, firstName, profile.id);
    addMentionAlias(aliasMap, lastName, profile.id);
  }

  const uniqueAliases = new Map<string, string>();
  for (const [alias, userIds] of aliasMap.entries()) {
    if (userIds.size === 1) {
      uniqueAliases.set(alias, Array.from(userIds)[0]);
    }
  }

  const mentionedUserIds = new Set<string>();
  for (const match of plainText.matchAll(mentionPattern)) {
    const alias = normalizeMentionKey(match[2]);
    const userId = uniqueAliases.get(alias);
    if (userId) {
      mentionedUserIds.add(userId);
    }
  }

  return Array.from(mentionedUserIds);
}

export function getTaskCommentRecipients(options: {
  authorId: string;
  assigneeId?: string | null;
  priorCommenterIds: string[];
}) {
  const priorCommenterSet = new Set(
    options.priorCommenterIds.filter(
      (userId) => Boolean(userId) && userId !== options.authorId,
    ),
  );
  const recipients: CommentRecipient[] = [];
  const recipientIds = new Set<string>();

  if (
    options.assigneeId &&
    options.assigneeId !== options.authorId &&
    !recipientIds.has(options.assigneeId)
  ) {
    recipients.push({
      userId: options.assigneeId,
      reason: priorCommenterSet.has(options.assigneeId)
        ? "assignee_and_commenter"
        : "assignee",
    });
    recipientIds.add(options.assigneeId);
    priorCommenterSet.delete(options.assigneeId);
  }

  for (const userId of priorCommenterSet) {
    if (recipientIds.has(userId)) continue;
    recipients.push({ userId, reason: "commenter" });
    recipientIds.add(userId);
  }

  return recipients;
}

export function computeAddedMembershipUserIds(options: {
  existingUserIds: string[];
  memberIds?: string[] | null;
  ownerId?: string | null;
  existingOwnerIds?: string[] | null;
  actorUserId: string;
}) {
  const nextOwnerIds = options.ownerId
    ? [options.ownerId]
    : options.existingOwnerIds && options.existingOwnerIds.length > 0
      ? options.existingOwnerIds
      : [options.actorUserId];

  const nextMemberIds = new Set<string>([
    ...((options.memberIds || []).filter(Boolean) as string[]),
    ...nextOwnerIds.filter(Boolean),
  ]);

  const existingUserIdSet = new Set(options.existingUserIds.filter(Boolean));
  return Array.from(nextMemberIds).filter(
    (userId) => !existingUserIdSet.has(userId),
  );
}

export async function sendTaskLifecycleNotifications(options: {
  taskId: string;
  actorUserId: string;
  previousAssignedTo?: string | null;
  previousText?: string | null;
}) {
  try {
    const [{ task, project, organization }, actorProfiles] = await Promise.all([
      fetchTaskContext(options.taskId),
      fetchProfilesByIds([options.actorUserId]),
    ]);
    const actor = actorProfiles.get(options.actorUserId);
    const actorName = getProfileDisplayName(actor);
    const taskUrl = getTaskLink(task.project_id);

    if (
      task.assigned_to &&
      task.assigned_to !== options.actorUserId &&
      task.assigned_to !== (options.previousAssignedTo || null)
    ) {
      const assigneeProfiles = await fetchProfilesByIds([task.assigned_to]);
      const assignee = assigneeProfiles.get(task.assigned_to);
      if (assignee?.email) {
        await sendNotification({
          kind: "task_assignment",
          entityId: task.id,
          recipient: assignee,
          subject: `You were assigned: ${task.name}`,
          greeting: `Hi ${getProfileDisplayName(assignee)},`,
          intro: `${actorName} assigned you to "${task.name}" in Focus: Forge.`,
          details: [
            { label: "Task", value: task.name },
            { label: "Project", value: project?.name || null },
            { label: "Organization", value: organization?.name || null },
            { label: "Assigned by", value: actorName },
          ],
          excerpt: getRichTextPreview(task.description || "", 240) || null,
          actionUrl: taskUrl,
          actionLabel: "Open Task",
        });
      }
    }

    if (!project?.organization_id) {
      return;
    }

    const organizationProfiles = await fetchOrganizationProfiles(
      project.organization_id,
    );
    const previousMentionedIds = new Set(
      extractMentionedProfileIds(
        options.previousText || "",
        organizationProfiles,
      ),
    );
    const currentMentionedIds = extractMentionedProfileIds(
      getTaskNotificationSource(task),
      organizationProfiles,
    ).filter((userId) => userId !== options.actorUserId);

    const newlyMentionedIds = currentMentionedIds.filter(
      (userId) => !previousMentionedIds.has(userId),
    );

    if (!newlyMentionedIds.length) {
      return;
    }

    const mentionedProfiles = await fetchProfilesByIds(newlyMentionedIds);
    await Promise.allSettled(
      newlyMentionedIds.map(async (userId) => {
        const recipient = mentionedProfiles.get(userId);
        if (!recipient?.email) return;

        await sendNotification({
          kind: "task_mention",
          entityId: task.id,
          recipient,
          subject: `You were mentioned in: ${task.name}`,
          greeting: `Hi ${getProfileDisplayName(recipient)},`,
          intro: `${actorName} mentioned you on "${task.name}" in Focus: Forge.`,
          details: [
            { label: "Task", value: task.name },
            { label: "Project", value: project?.name || null },
            { label: "Organization", value: organization?.name || null },
            { label: "Mentioned by", value: actorName },
          ],
          excerpt:
            getRichTextPreview(getTaskNotificationSource(task), 240) || null,
          actionUrl: taskUrl,
          actionLabel: "Open Task",
        });
      }),
    );
  } catch (error) {
    console.error("Failed to send task lifecycle notifications", {
      taskId: options.taskId,
      actorUserId: options.actorUserId,
      error,
    });
  }
}

export async function sendTaskCommentNotifications(options: {
  taskId: string;
  actorUserId: string;
  commentContent: string;
}) {
  try {
    const admin = getAdminClient();
    const [{ task, project, organization }, actorProfiles, commentsResponse] =
      await Promise.all([
        fetchTaskContext(options.taskId),
        fetchProfilesByIds([options.actorUserId]),
        admin
          .from("comments")
          .select("user_id")
          .eq("task_id", options.taskId)
          .eq("is_deleted", false),
      ]);

    if (commentsResponse.error) {
      throw commentsResponse.error;
    }

    const actor = actorProfiles.get(options.actorUserId);
    const actorName = getProfileDisplayName(actor);
    const recipients = getTaskCommentRecipients({
      authorId: options.actorUserId,
      assigneeId: task.assigned_to,
      priorCommenterIds: (commentsResponse.data || [])
        .map((comment: { user_id: string | null }) => comment.user_id)
        .filter(
          (value: string | null): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    });

    if (!recipients.length) {
      return;
    }

    const recipientProfiles = await fetchProfilesByIds(
      recipients.map((recipient) => recipient.userId),
    );
    const commentPreview = getRichTextPreview(
      richTextToPlainText(options.commentContent || ""),
      240,
    );
    const taskUrl = getTaskLink(task.project_id);

    await Promise.allSettled(
      recipients.map(async (recipientSpec) => {
        const recipient = recipientProfiles.get(recipientSpec.userId);
        if (!recipient?.email) return;

        const intro =
          recipientSpec.reason === "assignee_and_commenter"
            ? `${actorName} added a new comment on "${task.name}". You are assigned to this task and have commented on it before.`
            : recipientSpec.reason === "assignee"
              ? `${actorName} added a new comment on "${task.name}", which is assigned to you.`
              : `${actorName} added a new comment on "${task.name}", which you commented on before.`;

        await sendNotification({
          kind: "task_comment",
          entityId: task.id,
          recipient,
          subject: `New comment on: ${task.name}`,
          greeting: `Hi ${getProfileDisplayName(recipient)},`,
          intro,
          details: [
            { label: "Task", value: task.name },
            { label: "Project", value: project?.name || null },
            { label: "Organization", value: organization?.name || null },
            { label: "Comment by", value: actorName },
          ],
          excerpt: commentPreview || null,
          actionUrl: taskUrl,
          actionLabel: "View Conversation",
        });
      }),
    );
  } catch (error) {
    console.error("Failed to send task comment notifications", {
      taskId: options.taskId,
      actorUserId: options.actorUserId,
      error,
    });
  }
}

export async function sendOrganizationMembershipNotifications(options: {
  organizationId: string;
  actorUserId: string;
  addedUserIds: string[];
}) {
  if (!options.addedUserIds.length) {
    return;
  }

  try {
    const admin = getAdminClient();
    const [
      { data: organization, error: organizationError },
      profiles,
      actorProfiles,
    ] = await Promise.all([
      admin
        .from("organizations")
        .select("id,name")
        .eq("id", options.organizationId)
        .single(),
      fetchProfilesByIds(options.addedUserIds),
      fetchProfilesByIds([options.actorUserId]),
    ]);

    if (organizationError || !organization) {
      throw organizationError || new Error("Organization not found");
    }

    const actor = actorProfiles.get(options.actorUserId);
    const actorName = getProfileDisplayName(actor);
    const appUrl = getNotificationLink();

    await Promise.allSettled(
      options.addedUserIds.map(async (userId) => {
        if (userId === options.actorUserId) return;

        const recipient = profiles.get(userId);
        if (!recipient?.email) return;

        await sendNotification({
          kind: "organization_membership",
          entityId: organization.id,
          recipient,
          subject: `You were added to ${organization.name}`,
          greeting: `Hi ${getProfileDisplayName(recipient)},`,
          intro: `${actorName} added you to the organization "${organization.name}" in Focus: Forge.`,
          details: [
            { label: "Organization", value: organization.name },
            { label: "Added by", value: actorName },
          ],
          actionUrl: appUrl,
          actionLabel: "Open Focus: Forge",
        });
      }),
    );
  } catch (error) {
    console.error("Failed to send organization membership notifications", {
      organizationId: options.organizationId,
      actorUserId: options.actorUserId,
      addedUserIds: options.addedUserIds,
      error,
    });
  }
}

export async function sendProjectMembershipNotifications(options: {
  projectId: string;
  actorUserId: string;
  addedUserIds: string[];
}) {
  if (!options.addedUserIds.length) {
    return;
  }

  try {
    const admin = getAdminClient();
    const [{ data: project, error: projectError }, profiles, actorProfiles] =
      await Promise.all([
        admin
          .from("projects")
          .select("id,name,organization_id")
          .eq("id", options.projectId)
          .single(),
        fetchProfilesByIds(options.addedUserIds),
        fetchProfilesByIds([options.actorUserId]),
      ]);

    if (projectError || !project) {
      throw projectError || new Error("Project not found");
    }

    let organizationName: string | null = null;
    if (project.organization_id) {
      const { data: organization } = await admin
        .from("organizations")
        .select("name")
        .eq("id", project.organization_id)
        .maybeSingle();
      organizationName = organization?.name || null;
    }

    const actor = actorProfiles.get(options.actorUserId);
    const actorName = getProfileDisplayName(actor);
    const projectUrl = getTaskLink(project.id);

    await Promise.allSettled(
      options.addedUserIds.map(async (userId) => {
        if (userId === options.actorUserId) return;

        const recipient = profiles.get(userId);
        if (!recipient?.email) return;

        await sendNotification({
          kind: "project_membership",
          entityId: project.id,
          recipient,
          subject: `You were added to ${project.name}`,
          greeting: `Hi ${getProfileDisplayName(recipient)},`,
          intro: `${actorName} added you to the project "${project.name}" in Focus: Forge.`,
          details: [
            { label: "Project", value: project.name },
            { label: "Organization", value: organizationName },
            { label: "Added by", value: actorName },
          ],
          actionUrl: projectUrl,
          actionLabel: "Open Project",
        });
      }),
    );
  } catch (error) {
    console.error("Failed to send project membership notifications", {
      projectId: options.projectId,
      actorUserId: options.actorUserId,
      addedUserIds: options.addedUserIds,
      error,
    });
  }
}
