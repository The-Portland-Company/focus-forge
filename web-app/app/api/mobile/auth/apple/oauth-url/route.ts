import { NextRequest, NextResponse } from 'next/server'
import { createAnonSupabase, mobileFailure, mobileSuccess } from '@/lib/mobile/api'

const DEFAULT_REDIRECT = 'focusforge://auth-callback'

export async function GET(request: NextRequest) {
  try {
    const redirectTo = request.nextUrl.searchParams.get('redirect_to') || DEFAULT_REDIRECT
    const supabase = createAnonSupabase()

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        skipBrowserRedirect: true,
        redirectTo,
      },
    })

    if (error || !data?.url) {
      const message = error?.message || 'Failed to initialize Apple OAuth URL'
      const missingSecret = /missing oauth secret/i.test(message)
      return NextResponse.json(
        mobileFailure(
          missingSecret ? 'apple_provider_missing_secret' : 'apple_oauth_start_failed',
          message,
          missingSecret
            ? {
                hint: 'Configure Apple provider credentials in Supabase Auth for this project.',
              }
            : error,
        ),
        { status: 400 },
      )
    }

    return NextResponse.json(
      mobileSuccess({ url: data.url }),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create Apple OAuth URL', error),
      { status: 500 },
    )
  }
}
