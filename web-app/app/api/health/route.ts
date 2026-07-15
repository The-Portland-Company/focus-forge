import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { readFileSync } from 'fs'
import path from 'path'
import { BUILD_INFO } from '@/lib/build-info.generated'

type FileBuildInfo = {
  git_commit?: string
  built_at?: string
  run_id?: string
}

function readBuildInfoFromDisk(): FileBuildInfo | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'build-info.json'),
    path.join(process.cwd(), 'build-info.json'),
  ]
  for (const filePath of candidates) {
    try {
      const raw = readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw) as FileBuildInfo
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // missing or unreadable — try next
    }
  }
  return null
}

function resolveBuildMeta() {
  const fromFile = readBuildInfoFromDisk()
  const fileCommit =
    fromFile?.git_commit && fromFile.git_commit !== 'unknown'
      ? fromFile.git_commit
      : undefined
  const generatedCommit =
    BUILD_INFO.git_commit && BUILD_INFO.git_commit !== 'unknown'
      ? BUILD_INFO.git_commit
      : undefined

  const git_commit =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_GIT_COMMIT ||
    fileCommit ||
    generatedCommit ||
    'unknown'

  const built_at = fromFile?.built_at || BUILD_INFO.built_at || ''
  const run_id = fromFile?.run_id || BUILD_INFO.run_id || ''

  return { git_commit, built_at, run_id }
}

export async function GET() {
  const requestHeaders = await headers()
  const railwayRequestId = requestHeaders.get('x-railway-request-id') || 'unknown'

  const checks: Record<string, string> = {
    app: 'ok',
    supabase: 'unknown',
    environment: process.env.NODE_ENV || 'unknown',
    port: process.env.PORT || '3244',
    timestamp: new Date().toISOString(),
    railway_request_id: railwayRequestId
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
  const buildMeta = resolveBuildMeta()

  return NextResponse.json(
    { 
      status,
      checks,
      criticalChecks,
      build: {
        git_commit: buildMeta.git_commit,
        built_at: buildMeta.built_at || undefined,
        run_id: buildMeta.run_id || undefined,
        deployment_id: process.env.RAILWAY_DEPLOYMENT_ID || 'unknown',
        service: process.env.RAILWAY_SERVICE_NAME || 'unknown',
        environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown'
      }
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
