import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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


    // Use Supabase Admin API to invite user
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        firstName: firstName || '',
        lastName: lastName || '',
        organizationId,
        organizationName,
        invitedAt: new Date().toISOString()
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3244'}/auth/accept-invite?org=${organizationId}`
    })

    if (error) {
      console.error('Supabase invite error:', error)
      
      // Handle specific error cases
      if (error.message?.includes('not authorized') || error.message?.includes('Email sending is not configured')) {
        return NextResponse.json(
          { 
            error: 'Email sending is not configured', 
            details: 'Please configure SMTP settings in Supabase dashboard to send invitation emails',
            helpUrl: 'https://supabase.com/dashboard/project/_/settings/auth'
          },
          { status: 503 }
        )
      }
      
      return NextResponse.json(
        { error: error.message || 'Failed to send invitation' },
        { status: 500 }
      )
    }

    // Create a pending user record in Supabase profiles
    if (data?.user?.id) {
      try {
        await supabaseAdmin
          .from('profiles')
          .upsert({
            id: data.user.id,
            email,
            first_name: firstName || '',
            last_name: lastName || '',
            display_name: `${firstName || ''} ${lastName || ''}`.trim(),
            status: 'pending',
            invited_at: new Date().toISOString(),
            profile_color: '#667eea',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        // Add to organization
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('member_ids')
          .eq('id', organizationId)
          .single()

        if (org) {
          const memberIds = org.member_ids || []
          if (!memberIds.includes(data.user.id)) {
            memberIds.push(data.user.id)
            await supabaseAdmin
              .from('organizations')
              .update({ member_ids: memberIds })
              .eq('id', organizationId)
          }
        }
      } catch (dbError) {
        console.error('Failed to update profiles:', dbError)
        // Don't fail the request if profile update fails
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Invitation email sent successfully',
      user: data?.user
    })

  } catch (error: any) {
    console.error('Invite user error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}