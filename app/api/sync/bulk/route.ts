import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// POST /api/sync/bulk - Perform bulk sync operations
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      const { operations } = body
      
      if (!Array.isArray(operations)) {
        return createErrorResponse('Operations array is required', 400)
      }
      
      const results: {
        organizations: { created: any[]; updated: any[]; deleted: any[] }
        projects: { created: any[]; updated: any[]; deleted: any[] }
        tasks: { created: any[]; updated: any[]; deleted: any[] }
        comments: { created: any[]; updated: any[]; deleted: any[] }
        sections: { created: any[]; updated: any[]; deleted: any[] }
        tags: { created: any[]; updated: any[]; deleted: any[] }
        errors: Array<{ operation: any; error: string }>
      } = {
        organizations: { created: [], updated: [], deleted: [] },
        projects: { created: [], updated: [], deleted: [] },
        tasks: { created: [], updated: [], deleted: [] },
        comments: { created: [], updated: [], deleted: [] },
        sections: { created: [], updated: [], deleted: [] },
        tags: { created: [], updated: [], deleted: [] },
        errors: []
      }
      
      for (const op of operations) {
        try {
          const { type, action, data } = op
          
          switch (type) {
            case 'organization':
              await handleOrganizationOp(supabase, action, data, userId, results)
              break
            case 'project':
              await handleProjectOp(supabase, action, data, userId, results)
              break
            case 'task':
              await handleTaskOp(supabase, action, data, userId, results)
              break
            case 'comment':
              await handleCommentOp(supabase, action, data, userId, results)
              break
            case 'section':
              await handleSectionOp(supabase, action, data, results)
              break
            case 'tag':
              await handleTagOp(supabase, action, data, results)
              break
            default:
              results.errors.push({ operation: op, error: 'Unknown type' })
          }
        } catch (error) {
          results.errors.push({ 
            operation: op, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          })
        }
      }
      
      return createApiResponse(results)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}

async function handleOrganizationOp(supabase: any, action: string, data: any, userId: string, results: any) {
  switch (action) {
    case 'create':
      const { data: created, error: createError } = await supabase
        .from('organizations')
        .insert({ ...data, ownerId: userId, memberIds: [userId] })
        .select()
        .single()
      if (createError) throw createError
      results.organizations.created.push(created)
      break
    case 'update':
      const { data: updated, error: updateError } = await supabase
        .from('organizations')
        .update(data)
        .eq('id', data.id)
        .select()
        .single()
      if (updateError) throw updateError
      results.organizations.updated.push(updated)
      break
    case 'delete':
      const { error: deleteError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', data.id)
      if (deleteError) throw deleteError
      results.organizations.deleted.push(data.id)
      break
  }
}

async function handleProjectOp(supabase: any, action: string, data: any, userId: string, results: any) {
  switch (action) {
    case 'create':
      const { data: created, error: createError } = await supabase
        .from('projects')
        .insert({ 
          ...data, 
          ownerId: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .select()
        .single()
      if (createError) throw createError
      results.projects.created.push(created)
      break
    case 'update':
      const { data: updated, error: updateError } = await supabase
        .from('projects')
        .update({ ...data, updatedAt: new Date().toISOString() })
        .eq('id', data.id)
        .select()
        .single()
      if (updateError) throw updateError
      results.projects.updated.push(updated)
      break
    case 'delete':
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', data.id)
      if (deleteError) throw deleteError
      results.projects.deleted.push(data.id)
      break
  }
}

async function handleTaskOp(supabase: any, action: string, data: any, userId: string, results: any) {
  switch (action) {
    case 'create':
      const { data: created, error: createError } = await supabase
        .from('tasks')
        .insert({ 
          ...data, 
          createdBy: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .select()
        .single()
      if (createError) throw createError
      results.tasks.created.push(created)
      break
    case 'update':
      const updateData = { ...data, updatedAt: new Date().toISOString() }
      if (data.completed === true) {
        updateData.completedAt = new Date().toISOString()
      } else if (data.completed === false) {
        updateData.completedAt = null
      }
      const { data: updated, error: updateError } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', data.id)
        .select()
        .single()
      if (updateError) throw updateError
      results.tasks.updated.push(updated)
      break
    case 'delete':
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', data.id)
      if (deleteError) throw deleteError
      results.tasks.deleted.push(data.id)
      break
  }
}

async function handleCommentOp(supabase: any, action: string, data: any, userId: string, results: any) {
  switch (action) {
    case 'create':
      const { data: user } = await supabase
        .from('users')
        .select('name')
        .eq('authId', userId)
        .single()
      
      const { data: created, error: createError } = await supabase
        .from('comments')
        .insert({ 
          ...data, 
          userId,
          userName: user?.name || 'Unknown User',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .select()
        .single()
      if (createError) throw createError
      results.comments.created.push(created)
      break
    case 'update':
      const { data: updated, error: updateError } = await supabase
        .from('comments')
        .update({ ...data, updatedAt: new Date().toISOString() })
        .eq('id', data.id)
        .eq('userId', userId)
        .select()
        .single()
      if (updateError) throw updateError
      results.comments.updated.push(updated)
      break
    case 'delete':
      const { error: deleteError } = await supabase
        .from('comments')
        .update({ isDeleted: true, updatedAt: new Date().toISOString() })
        .eq('id', data.id)
        .eq('userId', userId)
      if (deleteError) throw deleteError
      results.comments.deleted.push(data.id)
      break
  }
}

async function handleSectionOp(supabase: any, action: string, data: any, results: any) {
  switch (action) {
    case 'create':
      const { data: created, error: createError } = await supabase
        .from('sections')
        .insert({ 
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .select()
        .single()
      if (createError) throw createError
      results.sections.created.push(created)
      break
    case 'update':
      const { data: updated, error: updateError } = await supabase
        .from('sections')
        .update({ ...data, updatedAt: new Date().toISOString() })
        .eq('id', data.id)
        .select()
        .single()
      if (updateError) throw updateError
      results.sections.updated.push(updated)
      break
    case 'delete':
      const { error: deleteError } = await supabase
        .from('sections')
        .delete()
        .eq('id', data.id)
      if (deleteError) throw deleteError
      results.sections.deleted.push(data.id)
      break
  }
}

async function handleTagOp(supabase: any, action: string, data: any, results: any) {
  switch (action) {
    case 'create':
      const { data: created, error: createError } = await supabase
        .from('tags')
        .insert(data)
        .select()
        .single()
      if (createError) throw createError
      results.tags.created.push(created)
      break
    case 'update':
      const { data: updated, error: updateError } = await supabase
        .from('tags')
        .update(data)
        .eq('id', data.id)
        .select()
        .single()
      if (updateError) throw updateError
      results.tags.updated.push(updated)
      break
    case 'delete':
      const { error: deleteError } = await supabase
        .from('tags')
        .delete()
        .eq('id', data.id)
      if (deleteError) throw deleteError
      results.tags.deleted.push(data.id)
      break
  }
}
