import { NextRequest, NextResponse } from 'next/server'
import { mobileFailure, mobileSuccess } from '@/lib/mobile/api'
import {
  MOBILE_OAUTH_REDIRECT,
  buildProviderAuthorizeUrl,
  findMobileAuthProvider,
  getMobileAuthProviderStatuses,
  isAllowedMobileRedirect,
} from '@/lib/mobile/auth-providers'

/**
 * [mobile-sso] Start an SSO sign-in for any configured provider.
 *
 * The app opens the returned URL in an `ASWebAuthenticationSession`; GoTrue
 * redirects back to `focusforge://auth-callback#access_token=…&refresh_token=…`
 * and the app trades the refresh token for a normalized session through
 * `/api/mobile/auth/refresh`.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider: providerId } = await context.params
    const provider = findMobileAuthProvider(providerId)

    if (!provider) {
      return NextResponse.json(
        mobileFailure('unsupported_provider', `Unsupported provider: ${providerId}`),
        { status: 404 },
      )
    }

    const redirectTo =
      request.nextUrl.searchParams.get('redirect_to') || MOBILE_OAUTH_REDIRECT

    if (!isAllowedMobileRedirect(redirectTo)) {
      return NextResponse.json(
        mobileFailure(
          'invalid_redirect',
          'redirect_to must use the focusforge:// app scheme',
        ),
        { status: 400 },
      )
    }

    const { providers } = await getMobileAuthProviderStatuses()
    const status = providers.find((entry) => entry.id === provider.id)
    if (!status?.enabled) {
      return NextResponse.json(
        mobileFailure(
          'provider_not_configured',
          `${provider.name} sign-in is not enabled for this project`,
          {
            hint: `Enable the ${provider.id} provider in Supabase Auth and add ${MOBILE_OAUTH_REDIRECT} to the redirect allow list.`,
          },
        ),
        { status: 409 },
      )
    }

    return NextResponse.json(
      mobileSuccess({
        provider: provider.id,
        url: buildProviderAuthorizeUrl(provider, redirectTo),
        redirect_to: redirectTo,
      }),
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to create OAuth URL', error),
      { status: 500 },
    )
  }
}
