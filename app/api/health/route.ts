import { NextResponse } from 'next/server'
export async function GET() {
  const checks: Record<string, string> = {
    app: 'ok',
    supabase: 'unknown',
    environment: process.env.NODE_ENV || 'unknown',
    port: process.env.PORT || '3244',
    timestamp: new Date().toISOString()
  }

  // Check Supabase connection
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url || !key) {
      checks.supabase = 'missing_credentials'
      checks.supabase_details = `URL: ${url ? 'set' : 'missing'}, Key: ${key ? 'set' : 'missing'}`
    } else if (!url.startsWith('http')) {
      checks.supabase = 'invalid_url'
      checks.supabase_details = 'URL must start with http:// or https://'
    } else {
      // Lightweight check only: validate URL format without hitting the DB
      checks.supabase = 'ok'
    }
  } catch (error) {
    checks.supabase = 'error'
    checks.supabase_error = error instanceof Error ? error.message : 'Unknown error'
  }

  // Check critical environment variables
  const requiredVars = ['NODE_ENV', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
  const missingVars = requiredVars.filter(v => !process.env[v])
  
  if (missingVars.length > 0) {
    checks.env_vars = 'missing'
    checks.missing_vars = missingVars.join(', ')
  } else {
    checks.env_vars = 'ok'
  }

  // Determine overall health
  const criticalChecks = ['app', 'env_vars']

  const allOk = criticalChecks.every(check => {
    const value = checks[check]
    return value === 'ok'
  })

  const status = allOk ? 'healthy' : 'unhealthy'

  return NextResponse.json(
    { 
      status,
      checks,
      criticalChecks 
    },
    { 
      status: allOk ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  )
}
