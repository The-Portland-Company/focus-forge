import { NextResponse } from 'next/server'
import { mobileFailure, mobileSuccess } from '@/lib/mobile/api'
import { getMobileAuthProviderStatuses } from '@/lib/mobile/auth-providers'

/**
 * [mobile-sso] Which sign-in providers the login screen should render.
 *
 * The app renders exactly what this returns, so a provider that is not yet
 * configured in Supabase Auth never shows up as a dead button.
 */
export async function GET() {
  try {
    const { providers, degraded } = await getMobileAuthProviderStatuses()

    return NextResponse.json(
      mobileSuccess(
        {
          providers: providers
            .filter((provider) => provider.enabled)
            .map(({ id, name, kind }) => ({ id, name, kind })),
        },
        { degraded },
      ),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to list auth providers', error),
      { status: 500 },
    )
  }
}
