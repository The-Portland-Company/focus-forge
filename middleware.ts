import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Public routes that don't require authentication
const publicRoutes = [
  '/auth/login',
  '/auth/register',
  '/auth/accept-invite',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/accept-invite',
  '/api/health'
]

const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'self'"
}

const applySecurityHeaders = (response: NextResponse) => {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Check if the route is public
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  
  if (isPublicRoute) {
    return applySecurityHeaders(NextResponse.next())
  }
  
  // Create a response that we'll modify
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })
  
  // Create a Supabase client for authentication
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        },
        remove(name: string, options: any) {
          request.cookies.delete(name)
          response.cookies.set(name, '', { ...options, maxAge: 0 })
        },
      },
    }
  )

  // Check for authenticated user using getSession instead of getUser
  // getSession doesn't verify the JWT, avoiding refresh token issues
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session?.user) {
    // Redirect to login page if not authenticated
    if (pathname.startsWith('/api/')) {
      // For API routes, return 401
      return applySecurityHeaders(NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ))
    }
    
    // For page routes, redirect to login
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return applySecurityHeaders(NextResponse.redirect(loginUrl))
  }
  
  // Add user ID to headers for API routes
  if (pathname.startsWith('/api/')) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', session.user.id)
    
    return applySecurityHeaders(NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }))
  }
  
  return applySecurityHeaders(response)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}
