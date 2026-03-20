import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendInviteEmail } from '@/lib/email'
import crypto from 'crypto'
import { isDuplicateUserErrorMessage, normalizeInviteEmail } from './utils'

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
      (user) => normalizeInviteEmail(user.email || '') === email
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

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getAdminClient()
    const {
      email: rawEmail,
      organizationId,
      organizationName,
      projectId,
      firstName,
      lastName
    } = await request.json()
    const email = normalizeInviteEmail(rawEmail || '')

    if (!email || !organizationId || !organizationName) {
      return NextResponse.json(
        { error: 'Email, organization ID, and organization name are required' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await findAuthUserByEmail(email)

    let userId: string
    let projectName: string | undefined

    if (existingUser) {
      // User exists - just add them to the organization
      userId = existingUser.id
    } else {
      // Generate a secure temporary password (user will set their own on first login)
      const tempPassword = crypto.randomBytes(32).toString('base64')

      // Create user in Supabase Auth without sending email
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: false, // Don't auto-confirm, they need to use the invite link
        user_metadata: {
          firstName: firstName || '',
          lastName: lastName || '',
          organizationId,
          organizationName,
          invitedAt: new Date().toISOString(),
          mustResetPassword: true
        }
      })

      if (createError) {
        if (isDuplicateUserErrorMessage(createError.message || '')) {
          const duplicateUser = await findAuthUserByEmail(email)

          if (duplicateUser?.id) {
            userId = duplicateUser.id
          } else {
            console.error('Supabase create user duplicate error with unresolved user:', createError)
            return NextResponse.json(
              { error: 'User already exists, but lookup by email failed' },
              { status: 409 }
            )
          }
        } else {
          console.error('Supabase create user error:', createError)
          return NextResponse.json(
            { error: createError.message || 'Failed to create user' },
            { status: 500 }
          )
        }
      } else {
        userId = newUser.user.id
      }
    }

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex')
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Create or update profile with pending status and invite token
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        first_name: firstName || '',
        last_name: lastName || '',
        display_name: `${firstName || ''} ${lastName || ''}`.trim() || email,
        status: 'pending',
        invite_token: inviteToken,
        invite_expires_at: inviteExpiry.toISOString(),
        invited_at: new Date().toISOString(),
        profile_color: '#667eea',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })

    if (profileError) {
      console.error('Profile upsert error:', profileError)
      // Continue anyway - profile might already exist
    }

    // Add user to organization via user_organizations join table
    try {
      const { error: userOrgError } = await supabaseAdmin
        .from('user_organizations')
        .upsert({
          user_id: userId,
          organization_id: organizationId,
          is_owner: false
        }, {
          onConflict: 'user_id,organization_id'
        })

      if (userOrgError) {
        console.error('Failed to add user to organization:', userOrgError)
      }
    } catch (orgError) {
      console.error('Failed to add user to organization:', orgError)
      // Continue anyway
    }

    if (projectId) {
      try {
        const { data: project } = await (supabaseAdmin as any)
          .from('projects')
          .select('name')
          .eq('id', projectId)
          .single()

        if (project?.name) {
          projectName = project.name
        }
      } catch (projectLookupError) {
        console.error('Failed to fetch project name for invite email:', projectLookupError)
      }

      try {
        const { error: userProjectError } = await (supabaseAdmin as any)
          .from('user_projects')
          .upsert({
            user_id: userId,
            project_id: projectId,
            is_owner: false,
          }, {
            onConflict: 'user_id,project_id'
          })

        if (userProjectError) {
          console.error('Failed to add user to project:', userProjectError)
        }
      } catch (projectError) {
        console.error('Failed to add user to project:', projectError)
      }
    }

    // Build invite URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3244'
    const inviteUrl = `${baseUrl}/auth/accept-invite?token=${inviteToken}&email=${encodeURIComponent(email)}`

    let delivery: Awaited<ReturnType<typeof sendInviteEmail>> | null = null

    // Send invite email via Resend
    try {
      delivery = await sendInviteEmail({
        to: email,
        firstName: firstName || '',
        lastName: lastName || '',
        organizationName,
        projectName,
        inviteUrl
      })
    } catch (emailError: any) {
      console.error('Failed to send invite email:', emailError)
      return NextResponse.json(
        {
          error: 'Failed to send invitation email',
          details: emailError.message,
          userId // Still return userId so user can be assigned
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation email sent successfully',
      user: { id: userId, email },
      emailDelivery: delivery
    })

  } catch (error: any) {
    console.error('Invite user error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
