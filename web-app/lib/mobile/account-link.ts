import { SignJWT, jwtVerify } from 'jose'

type LinkTokenPayload = {
  source_user_id: string
  target_user_id: string
  source_email: string
}

const issuer = 'focus-forge-mobile-account-link'
const audience = 'focus-forge-mobile'

const getConfiguredSecret = () =>
  process.env.ACCOUNT_LINK_JWT_SECRET || process.env.JWT_SECRET || null

export const isAccountLinkSecretConfigured = () =>
  Boolean(getConfiguredSecret())

const getSecret = () => {
  const secret = getConfiguredSecret()
  if (!secret) {
    throw new Error(
      'ACCOUNT_LINK_JWT_SECRET (or JWT_SECRET) is required for account linking',
    )
  }
  return new TextEncoder().encode(secret)
}

export const createAccountLinkToken = async (payload: LinkTokenPayload) => {
  const secret = getSecret()
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(payload.source_user_id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret)
}

export const verifyAccountLinkToken = async (token: string) => {
  const secret = getSecret()
  const { payload } = await jwtVerify(token, secret, {
    issuer,
    audience,
  })

  return {
    source_user_id: String(payload.source_user_id || ''),
    target_user_id: String(payload.target_user_id || ''),
    source_email: String(payload.source_email || ''),
  }
}
