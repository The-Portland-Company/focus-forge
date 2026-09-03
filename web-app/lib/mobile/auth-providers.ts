/**
 * [mobile-sso] Shared catalog + helpers for the mobile sign-in providers.
 *
 * The iOS client asks `/api/mobile/auth/providers` which providers to render on
 * the login screen, then opens `/api/mobile/auth/oauth/:provider/url` in an
 * `ASWebAuthenticationSession`. Supabase GoTrue is the identity provider for all
 * of them, so "is this provider enabled" is read from GoTrue's own public
 * settings endpoint rather than duplicated in env vars here.
 */

export type MobileAuthProviderKind = 'native' | 'web'

export type MobileAuthProvider = {
  /** Supabase/GoTrue provider key — also the path segment used by the app. */
  id: string
  /** Human label rendered on the button. */
  name: string
  /**
   * `native` providers have a first-party iOS flow (Sign in with Apple) and are
   * exchanged through their own endpoint; `web` providers use the shared OAuth
   * authorize URL in a web auth session.
   */
  kind: MobileAuthProviderKind
  /** Extra OAuth scopes to request beyond the provider defaults. */
  scopes?: string
  /** Additional keys GoTrue may report this provider under. */
  aliases?: string[]
}

/**
 * Ordered: Apple first (App Store guideline 4.8 wants it alongside other social
 * logins), then the identity providers our users actually work in.
 */
export const MOBILE_AUTH_PROVIDERS: MobileAuthProvider[] = [
  { id: 'apple', name: 'Apple', kind: 'native' },
  { id: 'google', name: 'Google', kind: 'web' },
  { id: 'azure', name: 'Microsoft', kind: 'web', scopes: 'openid profile email offline_access' },
  { id: 'github', name: 'GitHub', kind: 'web', scopes: 'read:user user:email' },
  { id: 'gitlab', name: 'GitLab', kind: 'web' },
  { id: 'bitbucket', name: 'Bitbucket', kind: 'web' },
  { id: 'slack_oidc', name: 'Slack', kind: 'web', aliases: ['slack'] },
  { id: 'notion', name: 'Notion', kind: 'web' },
  { id: 'linkedin_oidc', name: 'LinkedIn', kind: 'web', aliases: ['linkedin'] },
  { id: 'figma', name: 'Figma', kind: 'web' },
  { id: 'discord', name: 'Discord', kind: 'web' },
  { id: 'facebook', name: 'Facebook', kind: 'web' },
]

const PROVIDERS_BY_ID = new Map(
  MOBILE_AUTH_PROVIDERS.map((provider) => [provider.id, provider]),
)

export const findMobileAuthProvider = (
  id: string | null | undefined,
): MobileAuthProvider | null => {
  if (!id) return null
  return PROVIDERS_BY_ID.get(id.trim().toLowerCase()) || null
}

/** The custom scheme the iOS app registers (see `CFBundleURLTypes`). */
export const MOBILE_URL_SCHEME = 'focusforge'
export const MOBILE_OAUTH_REDIRECT = `${MOBILE_URL_SCHEME}://auth-callback`
export const MOBILE_RECOVERY_REDIRECT = `${MOBILE_URL_SCHEME}://password-reset`

/**
 * Only let callers redirect back into the app itself. Without this the endpoint
 * would be an open redirect that hands a real session to any URL a caller names.
 */
export const isAllowedMobileRedirect = (redirectTo: string): boolean => {
  try {
    const url = new URL(redirectTo)
    return url.protocol === `${MOBILE_URL_SCHEME}:`
  } catch {
    return false
  }
}

type SettingsCache = { at: number; external: Record<string, boolean> }

const SETTINGS_TTL_MS = 5 * 60 * 1000
let settingsCache: SettingsCache | null = null

const readGoTrueSettings = async (): Promise<Record<string, boolean>> => {
  const now = Date.now()
  if (settingsCache && now - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.external
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!baseUrl || !anonKey) return {}

  const response = await fetch(`${baseUrl}/auth/v1/settings`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`GoTrue settings responded ${response.status}`)
  }

  const json = (await response.json()) as { external?: Record<string, boolean> }
  const external = json?.external || {}
  settingsCache = { at: now, external }
  return external
}

export type MobileAuthProviderStatus = MobileAuthProvider & { enabled: boolean }

/**
 * Resolve every catalog provider against the project's GoTrue config. When the
 * settings call fails we fall back to "Apple only" so the login screen never
 * advertises a provider that cannot complete, and the client can still fall
 * back to email + password.
 */
export const getMobileAuthProviderStatuses = async (): Promise<{
  providers: MobileAuthProviderStatus[]
  degraded: boolean
}> => {
  let external: Record<string, boolean> = {}
  let degraded = false

  try {
    external = await readGoTrueSettings()
  } catch (error) {
    console.error('[mobile-sso] failed to read GoTrue settings:', error)
    degraded = true
  }

  const providers = MOBILE_AUTH_PROVIDERS.map((provider) => {
    const keys = [provider.id, ...(provider.aliases || [])]
    const enabled = degraded
      ? false
      : keys.some((key) => external[key] === true)
    return { ...provider, enabled }
  })

  return { providers, degraded }
}

/**
 * Build the GoTrue authorize URL for a provider. GoTrue runs the implicit flow
 * for this endpoint, so the redirect back into the app carries the session in
 * the URL fragment — no server-held PKCE verifier is required, which is what
 * lets this endpoint stay stateless.
 */
export const buildProviderAuthorizeUrl = (
  provider: MobileAuthProvider,
  redirectTo: string,
): string => {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')

  const url = new URL(`${baseUrl}/auth/v1/authorize`)
  url.searchParams.set('provider', provider.id)
  url.searchParams.set('redirect_to', redirectTo)
  if (provider.scopes) url.searchParams.set('scopes', provider.scopes)
  return url.toString()
}

/** Test seam + cache reset for long-lived server processes. */
export const resetMobileAuthProviderCache = () => {
  settingsCache = null
}
