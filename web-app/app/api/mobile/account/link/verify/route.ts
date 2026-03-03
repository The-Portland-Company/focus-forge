import { NextRequest, NextResponse } from 'next/server'
import {
  createAnonSupabase,
  createServiceSupabase,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  createAccountLinkToken,
  isAccountLinkSecretConfigured,
} from '@/lib/mobile/account-link'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get('authorization'),
    )
    if (!auth.ok) {
      console.error('❌ account link verify auth failed:', auth.error.error)
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const body = await request.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')

    if (!email || !password) {
      return NextResponse.json(
        mobileFailure(
          'missing_credentials',
          'email and password are required to verify account link',
        ),
        { status: 400 },
      )
    }

    if ((auth.user.email || '').toLowerCase() === email) {
      return NextResponse.json(
        mobileFailure(
          'same_account',
          'Use credentials for a different existing account',
        ),
        { status: 400 },
      )
    }

    const anonSupabase = createAnonSupabase()
    const { data, error } = await anonSupabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data?.user) {
      console.error('❌ account link verify credential check failed:', {
        email,
        message: error?.message,
      })
      return NextResponse.json(
        mobileFailure(
          'invalid_credentials',
          'The email/password pair is invalid',
        ),
        { status: 401 },
      )
    }

    const sourceUser = data.user
    if (sourceUser.id === auth.user.id) {
      return NextResponse.json(
        mobileFailure(
          'same_account',
          'Cannot link an account to itself',
        ),
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    const { data: sourceAdminUser } = await admin.auth.admin.getUserById(
      sourceUser.id,
    )
    const linkedTo = sourceAdminUser?.user?.app_metadata?.linked_to_user_id
    if (linkedTo && linkedTo !== auth.user.id) {
      return NextResponse.json(
        mobileFailure(
          'source_already_linked',
          'This source account is already linked to another user',
        ),
        { status: 409 },
      )
    }

    const serviceSupabase = createServiceSupabase()
    const [{ data: membershipRows, error: membershipError }, { count: taskCount, error: taskCountError }] = await Promise.all([
      serviceSupabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', sourceUser.id),
      serviceSupabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', sourceUser.id),
    ])

    if (membershipError || taskCountError) {
      return NextResponse.json(
        mobileFailure(
          'preview_fetch_failed',
          'Failed to build account-link merge preview',
          membershipError || taskCountError,
        ),
        { status: 500 },
      )
    }

    const membershipCount = membershipRows?.length || 0
    const organizationIds = [...new Set((membershipRows || []).map((row: any) => row.organization_id))]

    let projectCount = 0
    if (organizationIds.length > 0) {
      const { count, error: projectCountError } = await serviceSupabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .in('organization_id', organizationIds)
      if (projectCountError) {
        return NextResponse.json(
          mobileFailure(
            'preview_project_count_failed',
            'Failed to count projects for merge preview',
            projectCountError,
          ),
          { status: 500 },
        )
      }
      projectCount = count || 0
    }

    if (!isAccountLinkSecretConfigured()) {
      return NextResponse.json(
        mobileFailure(
          'account_link_config_missing',
          'Server account-link secret is not configured',
          {
            expected_env: ['ACCOUNT_LINK_JWT_SECRET', 'JWT_SECRET'],
          },
        ),
        { status: 500 },
      )
    }

    const linkToken = await createAccountLinkToken({
      source_user_id: sourceUser.id,
      target_user_id: auth.user.id,
      source_email: sourceUser.email || email,
    })

    return NextResponse.json(
      mobileSuccess({
        link_token: linkToken,
        source_user: {
          id: sourceUser.id,
          email: sourceUser.email || email,
        },
        preview: {
          organization_memberships: membershipCount,
          projects_in_scope: projectCount,
          assigned_tasks: taskCount || 0,
        },
      }),
      { status: 200 },
    )
  } catch (error) {
    console.error('❌ account link verify internal error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to verify account link', {
        message,
      }),
      { status: 500 },
    )
  }
}
