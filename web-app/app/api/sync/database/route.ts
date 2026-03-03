import { NextRequest } from 'next/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'
import { mapOrganizationFromDb, mapProjectFromDb, mapSectionFromDb, mapTagFromDb, mapTaskFromDb } from '@/lib/api/sync-mapper'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    try {
      const supabase = await createClient()
      const { data: currentProfile, error: currentProfileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (currentProfileError) {
        return createErrorResponse(currentProfileError.message, 500)
      }

      const isSuperAdmin = currentProfile?.role === 'super_admin'

      const { data: userOrgs, error: userOrgsError } = await supabase
        .from('user_organizations')
        .select('organization_id, is_owner')
        .eq('user_id', userId)

      if (userOrgsError) {
        return createErrorResponse(userOrgsError.message, 500)
      }

      let organizations: any[] = []
      let organizationIds: string[] = []

      if (isSuperAdmin) {
        const { data: allOrganizations, error: allOrgError } = await supabase
          .from('organizations')
          .select('*')

        if (allOrgError) {
          return createErrorResponse(allOrgError.message, 500)
        }

        organizations = allOrganizations || []
        organizationIds = organizations.map(org => org.id)
      } else {
        organizationIds = (userOrgs || []).map((row: any) => row.organization_id)
        const { data: orgs, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .in('id', organizationIds.length > 0 ? organizationIds : ['00000000-0000-0000-0000-000000000000'])

        if (orgError) {
          return createErrorResponse(orgError.message, 500)
        }

        organizations = orgs || []
      }

      const { data: projects, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .in('organization_id', organizationIds.length > 0 ? organizationIds : ['00000000-0000-0000-0000-000000000000'])

      if (projectError) {
        return createErrorResponse(projectError.message, 500)
      }

      const projectIds = (projects || []).map((row: any) => row.id)

      const { data: tasks, error: taskError } = await supabase
        .from('tasks')
        .select(`
          *,
          task_tags(tag_id)
        `)
        .order('created_at', { ascending: false })

      if (taskError) {
        return createErrorResponse(taskError.message, 500)
      }
      console.log('[database] user', {
        userId,
        role: currentProfile?.role || null,
        orgCount: organizationIds.length,
        projectCount: projectIds.length,
        taskCount: tasks?.length || 0
      })

      const { data: tags, error: tagError } = await supabase
        .from('tags')
        .select('*')

      if (tagError) {
        return createErrorResponse(tagError.message, 500)
      }

      const { data: sections, error: sectionError } = await supabase
        .from('sections')
        .select('*')
        .in('project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000'])

      if (sectionError) {
        return createErrorResponse(sectionError.message, 500)
      }

      let memberIds: string[] = []
      const orgMemberMap = new Map<string, string[]>()
      const orgOwnerMap = new Map<string, string>()
      if (organizationIds.length > 0) {
        const { data: orgMembers, error: orgMembersError } = await supabase
          .from('user_organizations')
          .select('user_id, organization_id, is_owner')
          .in('organization_id', organizationIds)

        if (!orgMembersError && orgMembers) {
          memberIds = Array.from(new Set(orgMembers.map((row: any) => row.user_id).filter(Boolean)))
          orgMembers.forEach((row: any) => {
            if (!row.user_id || !row.organization_id) return
            const list = orgMemberMap.get(row.organization_id) || []
            if (!list.includes(row.user_id)) list.push(row.user_id)
            orgMemberMap.set(row.organization_id, list)
            if (row.is_owner && !orgOwnerMap.has(row.organization_id)) {
              orgOwnerMap.set(row.organization_id, row.user_id)
            }
          })
        }
      }

      let organizationUsers: any[] = []
      if (memberIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', memberIds)

        if (!profilesError && profiles) {
          organizationUsers = profiles.map(profile => ({
            id: profile.id,
            email: profile.email || '',
            firstName: profile.first_name || '',
            lastName: profile.last_name || '',
            name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
            profileColor: profile.profile_color || null,
            profileMemoji: profile.profile_memoji || null,
            animationsEnabled: profile.animations_enabled ?? true,
            priorityColor: profile.priority_color || null,
            role: profile.role || null,
            createdAt: profile.created_at || null,
            updatedAt: profile.updated_at || null
          }))
        }
      }

      if (!organizationUsers.find(user => user.id === userId) && currentProfile) {
        organizationUsers.unshift({
          id: currentProfile.id,
          email: currentProfile.email || '',
          firstName: currentProfile.first_name || '',
          lastName: currentProfile.last_name || '',
          name: `${currentProfile.first_name || ''} ${currentProfile.last_name || ''}`.trim() || currentProfile.email,
          profileColor: currentProfile.profile_color || null,
          profileMemoji: currentProfile.profile_memoji || null,
          animationsEnabled: currentProfile.animations_enabled ?? true,
          priorityColor: currentProfile.priority_color || null,
          role: currentProfile.role || null,
          createdAt: currentProfile.created_at || null,
          updatedAt: currentProfile.updated_at || null
        })
      }

      const response = createApiResponse({
        users: organizationUsers,
        organizations: (organizations || []).map(org => ({
          ...mapOrganizationFromDb(org),
          memberIds: orgMemberMap.get(org.id) || [],
          ownerId: orgOwnerMap.get(org.id) || null
        })),
        projects: (projects || []).map(mapProjectFromDb),
        tasks: (tasks || []).map(mapTaskFromDb),
        tags: (tags || []).map(mapTagFromDb),
        sections: (sections || []).map(mapSectionFromDb),
        reminders: [],
        userSectionPreferences: [],
        settings: { showCompletedTasks: true },
        taskSections: []
      })
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
      return response
    } catch (error) {
      return createErrorResponse('Failed to load database', 500)
    }
  })
}
