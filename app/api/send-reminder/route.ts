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

    // Use Supabase Admin API to resend the invitation
    // Supabase doesn't have a specific "resend" API, so we'll send a new invitation
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        firstName: firstName || '',
        lastName: lastName || '',
        organizationId,
        organizationName,
        invitedAt: new Date().toISOString(),
        isReminder: true
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3244'}/auth/accept-invite?org=${organizationId}`
    })

    if (error) {
      console.error('Supabase reminder error:', error)
      
      // Handle specific error cases
      if (error.message?.includes('already registered')) {
        return NextResponse.json(
          { 
            error: 'User already registered', 
            details: 'This user has already accepted their invitation',
            delivered: false
          },
          { status: 400 }
        )
      }
      
      if (error.message?.includes('not authorized') || error.message?.includes('Email sending is not configured')) {
        return NextResponse.json(
          { 
            error: 'Email sending is not configured', 
            details: 'Please configure SMTP settings in Supabase dashboard to send reminder emails',
            helpUrl: 'https://supabase.com/dashboard/project/_/settings/auth',
            delivered: false
          },
          { status: 503 }
        )
      }
      
      return NextResponse.json(
        { error: error.message || 'Failed to send reminder', delivered: false },
        { status: 500 }
      )
    }

    // Update the reminder timestamp in Supabase profiles
    try {
      await supabaseAdmin
        .from('profiles')
        .update({
          last_reminder_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('email', email)
    } catch (dbError) {
      console.error('Failed to update reminder timestamp:', dbError)
      // Don't fail the request if timestamp update fails
    }

    // Note: Supabase inviteUserByEmail only queues the email
    // Actual delivery depends on SMTP configuration
    // Without SMTP configured, emails only go to team members
    
    return NextResponse.json({ 
      success: true, 
      message: 'Reminder email queued',
      user: data?.user,
      delivered: false, // Supabase doesn't provide immediate delivery confirmation
      deliveryStatus: 'queued', // Email is queued, not necessarily delivered
      requiresSetup: false,
      note: 'Email queued. Delivery depends on SMTP configuration in Supabase dashboard.'
    })

  } catch (error: any) {
    console.error('Send reminder error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}