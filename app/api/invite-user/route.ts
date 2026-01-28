import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/email'
import crypto from 'crypto'

// Create Supabase admin client with service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: NextRequest) {
  try {
    const { email, organizationId, organizationName, firstName, lastName } = await request.json()

    if (!email || !organizationId || !organizationName) {
      return NextResponse.json(
        { error: 'Email, organization ID, and organization name are required' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === email)

    let userId: string

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
        console.error('Supabase create user error:', createError)
        return NextResponse.json(
          { error: createError.message || 'Failed to create user' },
          { status: 500 }
        )
      }

      userId = newUser.user.id
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

    // Build invite URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3244'
    const inviteUrl = `${baseUrl}/auth/accept-invite?token=${inviteToken}&email=${encodeURIComponent(email)}`

    // Send invite email via Resend
    try {
      await sendInviteEmail({
        to: email,
        firstName: firstName || '',
        lastName: lastName || '',
        organizationName,
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
      user: { id: userId, email }
    })

  } catch (error: any) {
    console.error('Invite user error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
