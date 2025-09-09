import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function withAuth(
  request: NextRequest,
  handler: (request: NextRequest, userId: string) => Promise<NextResponse>
) {
  const supabase = await createClient()
  
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid authorization header' },
      { status: 401 }
    )
  }
  
  const token = authHeader.substring(7)
  
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    )
  }
  
  return handler(request, user.id)
}

export function createApiResponse(data: any, status = 200) {
  return NextResponse.json(data, { 
    status,
    headers: {
      'Content-Type': 'application/json',
    }
  })
}

export function createErrorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}