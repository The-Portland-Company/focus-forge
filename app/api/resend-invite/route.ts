import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendInviteEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getAdminClient()
    const { userId, ccEmail } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Get the pending user's profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single() as { data: any; error: any }

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError)
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (profile.status !== 'pending') {
      return NextResponse.json(
        { error: 'User is not in pending status' },
        { status: 400 }
      )
    }

    // Get user's organization via user_organizations join table
    const { data: userOrgs } = await supabaseAdmin
      .from('user_organizations')
      .select('organization_id, organizations(id, name)')
      .eq('user_id', userId)
      .limit(1)
      .single()

    const organizationName = (userOrgs?.organizations as any)?.name || 'Command Center'

    // Generate new invite token
    const inviteToken = crypto.randomBytes(32).toString('hex')
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Update profile with new invite token
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        invite_token: inviteToken,
        invite_expires_at: inviteExpiry.toISOString(),
        invited_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Profile update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update invite token' },
        { status: 500 }
      )
    }

    // Build invite URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3244'
    const inviteUrl = `${baseUrl}/auth/accept-invite?token=${inviteToken}&email=${encodeURIComponent(profile.email)}`

    // Send invite email via Resend with optional CC
    try {
      await sendInviteEmail({
        to: profile.email,
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        organizationName,
        inviteUrl,
        cc: ccEmail || undefined
      })
    } catch (emailError: any) {
      console.error('Failed to send invite email:', emailError)
      return NextResponse.json(
        {
          error: 'Failed to send invitation email',
          details: emailError.message
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation email resent successfully'
    })

  } catch (error: any) {
    console.error('Resend invite error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
