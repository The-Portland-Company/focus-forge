import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'

export async function GET() {
  const checks: Record<string, string> = {
    app: 'ok',
    database: 'unknown',
    supabase: 'unknown',
    environment: process.env.NODE_ENV || 'unknown',
    port: process.env.PORT || '3244',
    timestamp: new Date().toISOString()
  }

  // Check database connection
  try {
    const db = await getDatabase()
    checks.database = db ? 'ok' : 'error'
  } catch (error) {
    checks.database = 'error'
    checks.database_error = error instanceof Error ? error.message : 'Unknown error'
  }

  // Check Supabase if enabled
  if (process.env.USE_SUPABASE === 'true') {
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
        // For now, just check that credentials exist
        // Actual Supabase connection test would require client initialization
        checks.supabase = 'configured'
      }
    } catch (error) {
      checks.supabase = 'error'
      checks.supabase_error = error instanceof Error ? error.message : 'Unknown error'
    }
  } else {
    checks.supabase = 'disabled'
  }

  // Check critical environment variables
  const requiredVars = ['NODE_ENV']
  const missingVars = requiredVars.filter(v => !process.env[v])
  
  if (missingVars.length > 0) {
    checks.env_vars = 'missing'
    checks.missing_vars = missingVars.join(', ')
  } else {
    checks.env_vars = 'ok'
  }

  // Determine overall health
  const criticalChecks = ['app']
  
  // Database is critical if not using Supabase
  if (process.env.USE_SUPABASE !== 'true') {
    criticalChecks.push('database')
  }
  
  // Supabase is critical if enabled
  if (process.env.USE_SUPABASE === 'true') {
    criticalChecks.push('supabase')
  }

  const allOk = criticalChecks.every(check => {
    const value = checks[check]
    return value === 'ok' || value === 'disabled' || value === 'configured'
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