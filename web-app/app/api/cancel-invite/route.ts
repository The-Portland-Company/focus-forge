import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

async function cleanupPendingUserIfOrphaned(userId: string) {
  const supabaseAdmin = getAdminClient()

  const { data: orgMemberships, error: orgError } = await supabaseAdmin
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)

  if (orgError) {
    throw orgError
  }

  const { data: projectMemberships, error: projectError } = await supabaseAdmin
    .from('user_projects')
    .select('project_id')
    .eq('user_id', userId)
    .limit(1)

  if (projectError) {
    throw projectError
  }

  if ((orgMemberships?.length || 0) > 0 || (projectMemberships?.length || 0) > 0) {
    return { deletedUser: false }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('status')
    .eq('id', userId)
    .maybeSingle() as { data: any; error: any }

  if (profileError) {
    throw profileError
  }

  if (!profile || profile.status !== 'pending') {
    return { deletedUser: false }
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (deleteError) {
    throw deleteError
  }

  return { deletedUser: true }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getAdminClient()
    const { userId, organizationId, projectId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (!organizationId && !projectId) {
      return NextResponse.json(
        { error: 'Organization ID or project ID is required' },
        { status: 400 },
      )
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, status')
      .eq('id', userId)
      .maybeSingle() as { data: any; error: any }

    if (profileError) {
      throw profileError
    }

    if (!profile) {
      return NextResponse.json({ error: 'Pending invite not found' }, { status: 404 })
    }

    if (profile.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending invitations can be cancelled' },
        { status: 400 },
      )
    }

    if (projectId) {
      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('id, organization_id')
        .eq('id', projectId)
        .single() as { data: any; error: any }

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      const { error: userProjectError } = await supabaseAdmin
        .from('user_projects')
        .delete()
        .eq('user_id', userId)
        .eq('project_id', projectId)

      if (userProjectError) {
        throw userProjectError
      }

      const { data: remainingProjects, error: remainingProjectsError } = await supabaseAdmin
        .from('user_projects')
        .select('project_id')
        .eq('user_id', userId)
        .limit(1)

      if (remainingProjectsError) {
        throw remainingProjectsError
      }

      if ((remainingProjects?.length || 0) === 0 && project.organization_id) {
        const { error: userOrgError } = await supabaseAdmin
          .from('user_organizations')
          .delete()
          .eq('user_id', userId)
          .eq('organization_id', project.organization_id)

        if (userOrgError) {
          throw userOrgError
        }
      }
    }

    if (organizationId) {
      const { data: orgProjects, error: orgProjectsError } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('organization_id', organizationId)

      if (orgProjectsError) {
        throw orgProjectsError
      }

      const projectIds = (orgProjects || []).map((project: any) => project.id)
      if (projectIds.length > 0) {
        const { error: removeProjectMembershipsError } = await supabaseAdmin
          .from('user_projects')
          .delete()
          .eq('user_id', userId)
          .in('project_id', projectIds)

        if (removeProjectMembershipsError) {
          throw removeProjectMembershipsError
        }
      }

      const { error: userOrgError } = await supabaseAdmin
        .from('user_organizations')
        .delete()
        .eq('user_id', userId)
        .eq('organization_id', organizationId)

      if (userOrgError) {
        throw userOrgError
      }
    }

    const cleanup = await cleanupPendingUserIfOrphaned(userId)

    return NextResponse.json({
      success: true,
      message: `Cancelled invitation for ${profile.email}`,
      deletedUser: cleanup.deletedUser,
    })
  } catch (error: any) {
    console.error('Cancel invite error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    )
  }
}
