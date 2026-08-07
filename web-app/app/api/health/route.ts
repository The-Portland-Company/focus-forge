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

export async function GET(request: Request) {
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
      // Real round-trip, hard-bounded.
      //
      // This used to validate the URL string and call that "ok". On 2026-08-07
      // the project's API gateway wedged — every authenticated request to
      // /rest/v1 and /auth/v1 hung indefinitely, so every app route that talks
      // to Supabase sat until Cloudflare's 100s origin timeout and returned
      // 524 — while this endpoint kept answering 200 "healthy". Health that
      // cannot go red during a total outage is worse than no health check: it
      // is what the deploy smoke test and any uptime monitor read.
      //
      // /auth/v1/health needs no credentials beyond the anon key and does not
      // depend on PostgREST or the schema cache, so it isolates "can we reach
      // the Supabase gateway at all" from any query-level problem. The abort
      // budget stays well under Cloudflare's 100s cut so this route always
      // answers rather than becoming a 524 itself.
      const SUPABASE_HEALTH_TIMEOUT_MS = 5000
      const startedAt = Date.now()
      try {
        const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
          headers: { apikey: key },
          cache: 'no-store',
          signal: AbortSignal.timeout(SUPABASE_HEALTH_TIMEOUT_MS),
        })
        checks.supabase_latency_ms = String(Date.now() - startedAt)
        if (response.ok) {
          checks.supabase = 'ok'
        } else {
          checks.supabase = 'error'
          checks.supabase_details = `auth/v1/health returned ${response.status}`
        }
      } catch (probeError) {
        checks.supabase_latency_ms = String(Date.now() - startedAt)
        checks.supabase =
          probeError instanceof Error && probeError.name === 'TimeoutError'
            ? 'timeout'
            : 'unreachable'
        checks.supabase_details =
          probeError instanceof Error ? probeError.message : 'probe failed'
      }
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

  // Liveness vs. dependency health are deliberately separated.
  //
  // Railway points its DEPLOYMENT healthcheck at this path (web-app/railway.toml
  // healthcheckPath). If a Supabase outage flipped this to 503, Railway would
  // treat a perfectly good container as a failed deploy and roll back — during
  // an outage we cannot fix by deploying. So the status code stays keyed to
  // liveness: is this process up and configured.
  //
  // Dependency state is still reported honestly in the body (`checks.supabase`,
  // `dependencies_ok`, `degraded`), and `?strict=1` returns 503 when a
  // dependency is down — point uptime monitors and humans at that variant.
  const criticalChecks = ['app', 'env_vars']
  const dependencyChecks = ['supabase']
  const dependenciesOk = dependencyChecks.every(
    (check) => checks[check] === 'ok',
  )
  const strict =
    new URL(request.url).searchParams.get('strict') === '1'

  const allOk = criticalChecks.every(check => {
    const value = checks[check]
    return value === 'ok'
  })

  const status = !allOk ? 'unhealthy' : dependenciesOk ? 'healthy' : 'degraded'
  const buildMeta = resolveBuildMeta()

  return NextResponse.json(
    {
      status,
      degraded: allOk && !dependenciesOk,
      dependencies_ok: dependenciesOk,
      checks,
      criticalChecks,
      dependencyChecks,
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
      status: allOk && (!strict || dependenciesOk) ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  )
}
