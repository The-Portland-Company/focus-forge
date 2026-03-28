import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { normalizeInviteEmail } from '@/app/api/invite-user/utils'

type AcceptInviteAction = 'validate' | 'accept'

type InviteValidationResult = {
  profile: {
    id: string
    email: string
    firstName: string
    lastName: string
    status: string | null
  }
  authUser: {
    id: string
    emailConfirmedAt: string | null
  } | null
}

export function inviteRequiresPasswordSetup(emailConfirmedAt: string | null | undefined) {
  return !emailConfirmedAt
}

const findAuthUserByEmail = async (email: string) => {
  const supabaseAdmin = getAdminClient()
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })

    if (error) {
      throw error
    }

    const users = data?.users || []
    const existingUser = users.find(
      (user: any) => normalizeInviteEmail(user.email || '') === email
    )

    if (existingUser) {
      return existingUser
    }

    if (users.length < perPage) {
      return null
    }

    page += 1
  }
}

type InviteProfileRow = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  status: string | null
  invite_token: string | null
  invite_expires_at: string | null
}

const validateInvite = async (email: string, token: string): Promise<InviteValidationResult> => {
  const supabaseAdmin = getAdminClient()

  const { data: rawProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,email,first_name,last_name,status,invite_token,invite_expires_at')
    .eq('email', email)
    .eq('invite_token', token)
    .single()

  const profile = rawProfile as InviteProfileRow | null

  if (profileError || !profile) {
    throw new Error('Invalid invitation link. Please request a new invitation.')
  }

  const inviteExpiresAt =
    typeof profile.invite_expires_at === 'string' ? profile.invite_expires_at : null

  if (inviteExpiresAt && new Date(inviteExpiresAt).getTime() < Date.now()) {
    throw new Error('This invitation link has expired. Please request a new invitation.')
  }

  const authUser = await findAuthUserByEmail(email)

  return {
    profile: {
      id: profile.id,
      email: profile.email || email,
      firstName: profile.first_name || '',
      lastName: profile.last_name || '',
      status: profile.status || null,
    },
    authUser: authUser
      ? {
          id: authUser.id,
          emailConfirmedAt: authUser.email_confirmed_at || null,
        }
      : null,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = (body.action || 'accept') as AcceptInviteAction
    const email = normalizeInviteEmail(body.email || '')
    const token = body.token?.trim()
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !token) {
      return NextResponse.json(
        { error: 'Invitation token and email are required' },
        { status: 400 }
      )
    }

    const validation = await validateInvite(email, token)
    const requiresPasswordSetup = inviteRequiresPasswordSetup(
      validation.authUser?.emailConfirmedAt
    )

    if (action === 'validate') {
      return NextResponse.json({
        success: true,
        invitation: {
          email: validation.profile.email,
          firstName: validation.profile.firstName,
          lastName: validation.profile.lastName,
          status: validation.profile.status,
          requiresPasswordSetup,
        },
      })
    }

    if (requiresPasswordSetup && password.length < 8) {
      return NextResponse.json(
        { error: 'Please choose a password with at least 8 characters.' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getAdminClient()

    if (validation.authUser?.id && password) {
      const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
        validation.authUser.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            firstName: validation.profile.firstName,
            lastName: validation.profile.lastName,
            mustResetPassword: false,
          },
        }
      )

      if (updateUserError) {
        throw new Error(updateUserError.message || 'Failed to finish account setup.')
      }
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        status: 'active',
        invite_token: null,
        invite_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validation.profile.id)

    if (profileUpdateError) {
      throw new Error(profileUpdateError.message || 'Failed to accept invitation.')
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation accepted successfully.',
      invitation: {
        email: validation.profile.email,
        firstName: validation.profile.firstName,
        lastName: validation.profile.lastName,
        requiresPasswordSetup,
      },
    })
  } catch (error: any) {
    console.error('Accept invite error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
