import { NextRequest, NextResponse } from 'next/server'
import {
  createAnonSupabase,
  createServiceSupabase,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'
import { getAdminClient } from '@/lib/supabase/admin'
import { createAccountLinkToken } from '@/lib/mobile/account-link'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get('authorization'),
    )
    if (!auth.ok) {
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
    const [{ count: membershipCount }, { count: taskCount }] = await Promise.all([
      serviceSupabase
        .from('user_organizations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', sourceUser.id),
      serviceSupabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', sourceUser.id),
    ])

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
          organization_memberships: membershipCount || 0,
          assigned_tasks: taskCount || 0,
        },
      }),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to verify account link', error),
      { status: 500 },
    )
  }
}

