import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withAuth, createApiResponse, createErrorResponse } from '@/lib/api/auth'

// GET /api/sync/tasks/[id] - Get single task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Task not found', 404)
      }
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse(task)
  })
}

// PUT /api/sync/tasks/[id] - Update task
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    try {
      const body = await req.json()
      
      const updateData = {
        ...body,
        updatedAt: new Date().toISOString()
      }
      
      // If task is being completed, set completedAt
      if (body.completed === true) {
        updateData.completedAt = new Date().toISOString()
      } else if (body.completed === false) {
        updateData.completedAt = null
      }
      
      const { data: task, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          return createErrorResponse('Task not found', 404)
        }
        return createErrorResponse(error.message, 500)
      }

      // Boomerang: an email boomeranged "until this task is completed" returns
      // to the inbox now that the task is done. Best-effort.
      if (body.completed === true) {
        try {
          await supabase
            .from('email_threads')
            .update({ boomerang_until: null, boomerang_task_id: null } as never)
            .eq('boomerang_task_id', id)
        } catch {
          /* non-fatal */
        }
      }

      return createApiResponse(task)
    } catch (error) {
      return createErrorResponse('Invalid request body', 400)
    }
  })
}

// DELETE /api/sync/tasks/[id] - Delete task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
    
    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Task not found', 404)
      }
      return createErrorResponse(error.message, 500)
    }
    
    return createApiResponse({ success: true }, 200)
  })
}

// POST /api/sync/tasks/[id]/complete - Mark task as complete
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(request.url)
  const isComplete = url.pathname.endsWith('/complete')
  
  if (!isComplete) {
    return createErrorResponse('Invalid endpoint', 404)
  }
  
  return withAuth(request, async (req, userId) => {
    const supabase = await createClient()
    
    const { data: task, error } = await supabase
      .from('tasks')
      .update({
        completed: true,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Task not found', 404)
      }
      return createErrorResponse(error.message, 500)
    }

    // Return any email boomeranged until this task was completed.
    try {
      await supabase
        .from('email_threads')
        .update({ boomerang_until: null, boomerang_task_id: null } as never)
        .eq('boomerang_task_id', id)
    } catch {
      /* non-fatal */
    }

    return createApiResponse(task)
  })
}
