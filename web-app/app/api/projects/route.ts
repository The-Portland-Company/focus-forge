import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupabaseAdapter } from '@/lib/db/supabase-adapter'
import { normalizeRichText } from '@/lib/rich-text-sanitize'
import { normalizeProjectContentFields } from '@/lib/devnotes-meta'
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";
import { requireOrgAdmin } from "@/lib/api/authz";
import { parseOrganizationIdsInput } from "@/lib/api/project-organization-ids";

// Supabase/PostgREST errors are plain objects, not Error instances, so
// String(error) yields "[object Object]" and hides the real cause (e.g. an
// RLS denial on INSERT). Surface the useful fields instead.
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    const parts = [e.message, e.code, e.details, e.hint]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
    if (parts.length) return parts.join(' | ')
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Get the Supabase client and authenticated user
    const viewerResult = await requireViewerOrUnauthorized();
    
    if (viewerResult instanceof NextResponse) return viewerResult;
    
    const { supabase, user } = viewerResult;
    
    const session = { user };
    
    const name = String(body?.name || '').trim()
    const organizationId =
      body?.organization_id ||
      body?.organizationId ||
      null

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    const normalizedDescription =
      body?.description !== undefined ? normalizeRichText(body.description) : null
    const normalizedContent = normalizeProjectContentFields({
      description: normalizedDescription,
      devnotesMeta: body?.devnotesMeta,
      devnotes_meta: body?.devnotes_meta,
    })

    const projectData = {
      name,
      description: normalizedContent.description,
      devnotes_meta: normalizedContent.devnotesMeta,
      color: body?.color || '#6B7280',
      organization_id: organizationId,
      is_favorite: body?.is_favorite ?? body?.isFavorite ?? false,
      archived: body?.archived ?? false,
      budget: body?.budget ?? null,
      deadline: body?.deadline || null,
      start_date: body?.start_date ?? body?.startDate ?? null,
      end_date: body?.end_date ?? body?.endDate ?? null,
      goal: body?.goal ?? null,
      order_index: body?.order_index ?? body?.orderIndex ?? 0,
    }

    // Multi-org: optional extra owning orgs. Only an admin of the PRIMARY org may
    // share a project, so refuse BEFORE creating anything.
    const requestedOrgIds = parseOrganizationIdsInput(body)
    const additionalOrgIds = (requestedOrgIds ?? []).filter((id) => id !== organizationId)

    // Initialize the Supabase adapter
    const adapter = new SupabaseAdapter(supabase, session.user.id)

    if (additionalOrgIds.length > 0) {
      const authz = await requireOrgAdmin(supabase, session.user.id, organizationId)
      if (!authz.authorized) {
        return NextResponse.json(
          { error: 'Only an organization admin can share a project with other organizations' },
          { status: 403 },
        )
      }
      await adapter.validateOrganizationIds(additionalOrgIds)
    }

    const newProject = await adapter.createProject(projectData)

    if (additionalOrgIds.length > 0) {
      await adapter.setProjectOrganizations(newProject.id, additionalOrgIds)
      return NextResponse.json({
        ...newProject,
        organizationIds: [organizationId, ...additionalOrgIds],
        organization_ids: [organizationId, ...additionalOrgIds],
      })
    }
    return NextResponse.json(newProject)
  } catch (error) {
    console.error('Failed to create project:', error)
    if ((error as any)?.status === 400) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }
    return NextResponse.json(
      {
        error: 'Failed to create project',
        details: describeError(error),
      },
      { status: 500 },
    )
  }
}
