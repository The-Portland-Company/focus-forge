import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { defaultModelChains } from "@/lib/ai/model-chains";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getRuleStatsForUser,
  listInboxItemsForUser,
  listMailboxesForUser,
  listRulesForUser,
  listSummaryProfilesForUser,
} from "@/lib/email-inbox/server";

export interface LoadDatabaseOptions {
  includeEmailData?: boolean;
  includeInboxItems?: boolean;
}

/**
 * Core database-load logic shared by the /api/database route handler (HTTP)
 * and the server component that streams initial data into the view client.
 *
 * Expects an already-authenticated `userId`. The caller is responsible for
 * verifying the session (the route does it via getSession; the server
 * component does it via the same Supabase server client). This function uses
 * the service-role client and scopes every query to `userId`, exactly like the
 * route always has.
 */
export async function loadDatabaseForUser(
  userId: string,
  userEmail: string | null | undefined,
  options: LoadDatabaseOptions = {},
) {
  const includeEmailData = options.includeEmailData !== false;
  const includeInboxItems =
    includeEmailData && options.includeInboxItems !== false;

  // Use service role client to bypass RLS issues with user_organizations table
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  try {
    const { data: currentProfile, error: currentProfileError } = await supabase
      .from("profiles")
      .select("id,status")
      .eq("id", userId)
      .maybeSingle();

    if (!currentProfileError && currentProfile?.status === "pending") {
      const { error: activateProfileError } = await supabase
        .from("profiles")
        .update({
          status: "active",
          invite_token: null,
          invite_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (activateProfileError) {
        console.error(
          "Failed to activate current user profile:",
          activateProfileError,
        );
      }
    }
  } catch (profileActivationError) {
    console.error(
      "Error activating current user profile:",
      profileActivationError,
    );
  }

  // Initialize the Supabase adapter with service client
  const adapter = new SupabaseAdapter(supabase, userId);

  // Fetch all data from Supabase
  let organizations: any[] = [];
  let projects: any[] = [];
  let tasks: any[] = [];
  let tags: any[] = [];
  let sections: any[] = [];
  let goals: any[] = [];
  let taskSections: any[] = [];
  let mailboxes: any[] = [];
  let inboxItems: any[] = [];
  let emailRules: any[] = [];
  let summaryProfiles: any[] = [];
  let ruleStats: any = { active: 0, quarantine: 0, alwaysDelete: 0 };
  let quarantineCount = 0;
  let sentCount = 0;
  let userProfile: any = null;
  const orgMemberMap = new Map<string, string[]>();
  const orgOwnerMap = new Map<string, string>();
  const projectMemberMap = new Map<string, string[]>();
  const projectOwnerMap = new Map<string, string>();

  try {
    organizations = await adapter.getOrganizations();
  } catch (error) {
    console.error("❌ Error fetching organizations:", error);
  }

  try {
    projects = await adapter.getProjects();
  } catch (error) {
    console.error("❌ Error fetching projects:", error);
  }

  try {
    tasks = await adapter.getTasks();
  } catch (error) {
    console.error("❌ Error fetching tasks:", error);
  }

  try {
    tags = await adapter.getTags();
  } catch (error) {
    console.error("Error fetching tags:", error);
  }

  try {
    const projectIds = projects.map((project: any) => project.id).filter(Boolean);
    if (projectIds.length > 0) {
      const { data: sectionRows, error: sectionsError } = await supabase
        .from("sections")
        .select("*")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("todoist_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (sectionsError) {
        console.error("Error fetching sections:", sectionsError);
      } else {
        sections = (sectionRows || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          projectId: row.project_id,
          parentId: row.parent_id || undefined,
          color: row.color || undefined,
          description: row.description || undefined,
          icon: row.icon || undefined,
          order: row.order_index ?? row.todoist_order ?? 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          todoistId: row.todoist_id || undefined,
          todoistOrder: row.todoist_order ?? undefined,
          todoistCollapsed: row.todoist_collapsed ?? undefined,
        }));
      }
    }
  } catch (error) {
    console.error("Error mapping sections:", error);
  }

  try {
    const projectIds = projects.map((project: any) => project.id).filter(Boolean);
    if (projectIds.length > 0) {
      const { data: goalRows, error: goalsError } = await supabase
        .from("goals")
        .select("*")
        .in("project_id", projectIds)
        .is("deleted_at", null)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (goalsError) {
        console.error("Error fetching goals:", goalsError);
      } else {
        goals = (goalRows || []).map((row: any) => ({
          id: row.id,
          sectionId: row.section_id || undefined,
          projectId: row.project_id,
          name: row.name,
          description: row.description || undefined,
          completed: row.completed ?? false,
          completedAt: row.completed_at || undefined,
          order: row.order_index ?? 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }
    }
  } catch (error) {
    console.error("Error mapping goals:", error);
  }

  try {
    const taskIds = tasks.map((task: any) => task.id).filter(Boolean);
    if (taskIds.length > 0) {
      const { data: taskSectionRows, error: taskSectionsError } = await supabase
        .from("task_sections")
        .select("*")
        .in("task_id", taskIds)
        .order("created_at", { ascending: true });

      if (taskSectionsError) {
        console.error("Error fetching task_sections:", taskSectionsError);
      } else {
        taskSections = (taskSectionRows || []).map((row: any) => ({
          id: row.id,
          taskId: row.task_id,
          sectionId: row.section_id,
          createdAt: row.created_at,
        }));

        const existingLinks = new Set(
          taskSections.map((row: any) => `${row.taskId}:${row.sectionId}`),
        );

        const inferredTaskSections = tasks
          .map((task: any) => {
            const sectionId = task.sectionId || task.section_id;
            if (!task.id || !sectionId) return null;

            const key = `${task.id}:${sectionId}`;
            if (existingLinks.has(key)) return null;

            return {
              id: `inferred-${task.id}-${sectionId}`,
              taskId: task.id,
              sectionId,
              createdAt:
                task.updatedAt ||
                task.updated_at ||
                task.createdAt ||
                task.created_at,
            };
          })
          .filter(Boolean);

        taskSections = [...taskSections, ...inferredTaskSections];
      }
    }
  } catch (error) {
    console.error("Error mapping task_sections:", error);
  }

  try {
    userProfile = await adapter.getUser(userId);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    // Create a minimal user profile if fetch fails
    userProfile = {
      id: userId,
      email: userEmail || "",
      firstName: "",
      lastName: "",
      name: userEmail?.split("@")[0] || "User",
      role: null,
      profileColor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      profileMemoji: null,
      animationsEnabled: true,
      dockBadgeEnabled: true,
      aiModelChains: defaultModelChains(),
      priorityColor: null,
      emailDeleteUndoSeconds: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    [mailboxes, inboxItems, emailRules, summaryProfiles, ruleStats] =
      includeEmailData
        ? await Promise.all([
            listMailboxesForUser(userId),
            includeInboxItems
              ? listInboxItemsForUser(userId)
              : Promise.resolve([]),
            listRulesForUser(userId),
            listSummaryProfilesForUser(userId),
            getRuleStatsForUser(userId),
          ])
        : [[], [], [], [], ruleStats];
    quarantineCount = inboxItems.filter(
      (item: any) => item.status === "quarantine",
    ).length;
    sentCount = inboxItems.filter(
      (item: any) =>
        item.status !== "deleted" &&
        item.status !== "quarantine" &&
        (item.origin === "outbound" || item.origin === "mixed"),
    ).length;
  } catch (error) {
    console.error("Error fetching email inbox data:", error);
  }

  const organizationMemberIds = new Set<string>();
  const orgIds = organizations.map((org: { id: string }) => org.id);

  if (orgIds.length > 0) {
    try {
      const { data: userOrgs, error: userOrgsError } = await supabase
        .from("user_organizations")
        .select("user_id,organization_id,is_owner")
        .in("organization_id", orgIds);

      if (!userOrgsError && userOrgs) {
        userOrgs.forEach((uo: any) => {
          organizationMemberIds.add(uo.user_id);
          if (!uo.organization_id) return;
          const memberIds = orgMemberMap.get(uo.organization_id) || [];
          if (!memberIds.includes(uo.user_id)) {
            memberIds.push(uo.user_id);
          }
          orgMemberMap.set(uo.organization_id, memberIds);
          if (uo.is_owner && !orgOwnerMap.has(uo.organization_id)) {
            orgOwnerMap.set(uo.organization_id, uo.user_id);
          }
        });
      }
    } catch (error) {
      console.error("Error fetching user_organizations:", error);
    }
  }

  const projectIds = projects.map((project: any) => project.id).filter(Boolean);
  if (projectIds.length > 0) {
    try {
      const { data: userProjects, error: userProjectsError } = await (
        supabase as any
      )
        .from("user_projects")
        .select("user_id,project_id,is_owner")
        .in("project_id", projectIds);

      if (!userProjectsError && userProjects) {
        userProjects.forEach((row: any) => {
          organizationMemberIds.add(row.user_id);
          if (!row.project_id) return;
          const memberIds = projectMemberMap.get(row.project_id) || [];
          if (!memberIds.includes(row.user_id)) {
            memberIds.push(row.user_id);
          }
          projectMemberMap.set(row.project_id, memberIds);
          if (row.is_owner && !projectOwnerMap.has(row.project_id)) {
            projectOwnerMap.set(row.project_id, row.user_id);
          }
        });
      }
    } catch (error) {
      console.error("Error fetching user_projects:", error);
    }
  }

  // Fetch all organization members from Supabase
  let organizationUsers: Array<Record<string, any>> = [];
  if (organizationMemberIds.size > 0) {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", Array.from(organizationMemberIds));

      if (!error && profiles) {
        organizationUsers = profiles.map((profile) => ({
          id: profile.id,
          email: profile.email || "",
          firstName: profile.first_name || "",
          lastName: profile.last_name || "",
          name:
            profile.display_name ||
            `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
            profile.email,
          role: profile.role || null,
          profileColor:
            profile.profile_color ||
            "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          profileMemoji: profile.profile_memoji || null,
          animationsEnabled: profile.animations_enabled ?? true,
          dockBadgeEnabled: profile.dock_badge_enabled ?? true,
          aiModelChains:
            (profile as any).ai_model_chains ?? defaultModelChains(),
          priorityColor: profile.priority_color || null,
          emailDeleteUndoSeconds: profile.email_delete_undo_seconds ?? 60,
          status: profile.status || "active",
          invitedAt: profile.invited_at || null,
          // SECURITY: never expose the invite secret to clients. Any org member
          // received it via the loaded DB, and accept-invite only needs
          // email + invite_token to set a password + confirm the account — i.e.
          // it enabled takeover of any pending invitee. Pending status is still
          // surfaced via `status`/`invitedAt`; resend/cancel resolve the token
          // server-side by user id, so it never needs to reach the client.
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        }));
      }
    } catch (error) {
      console.error("Error fetching organization members:", error);
    }
  }

  // Include the current user if not already in the list
  if (!organizationUsers.find((u) => u.id === userId) && userProfile) {
    organizationUsers.push(userProfile);
  }

  // Ensure the current user is always first in the list
  const currentUserIndex = organizationUsers.findIndex((u) => u.id === userId);
  if (currentUserIndex > 0) {
    const currentUser = organizationUsers.splice(currentUserIndex, 1)[0];
    organizationUsers.unshift(currentUser);
  }

  return {
    users: organizationUsers,
    organizations: organizations.map((org: any) => ({
      ...org,
      memberIds: orgMemberMap.get(org.id) || [],
      ownerId: orgOwnerMap.get(org.id) || org.owner_id || null,
    })),
    projects: projects.map((project: any) => ({
      ...project,
      devnotesMeta: project.devnotes_meta || null,
      memberIds: projectMemberMap.get(project.id) || [],
      ownerId: projectOwnerMap.get(project.id) || project.owner_id || null,
    })),
    tasks,
    mailboxes,
    inboxItems,
    emailRules,
    summaryProfiles,
    ruleStats,
    quarantineCount,
    sentCount,
    tags,
    sections,
    goals,
    reminders: [],
    userSectionPreferences: [],
    settings: { showCompletedTasks: true },
    taskSections,
  };
}
