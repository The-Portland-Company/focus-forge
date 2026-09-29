export { DEFAULT_ISSUER, PAT_PREFIX, ROLE_RANK, TpcAuthError, resolveIssuer } from "./types";
export type { AuthContext, OrgClaim, Role } from "./types";

export { verifyAccessToken, contextFromClaims } from "./verify";
export type { VerifyOptions } from "./verify";

export { authenticate, bearerToken, clearPatCache } from "./authenticate";
export type { AuthenticateOptions } from "./authenticate";

export { startRevocationPoll, isPolledRevoked, clearRevocationPollState } from "./revocation-poll";
export type { StartRevocationPollOptions, RevocationPollHandle } from "./revocation-poll";

export { requireApp, requireOrgRole, requireScope, orgRole } from "./guards";

export { protectedResourceMetadata, unauthorized, errorResponse } from "./resource";
export type { ResourceMetadataOptions, UnauthorizedOptions } from "./resource";

export { oidc, authorizeUrl, exchangeCode, refresh, revoke, logoutUrl, discover } from "./oidc";
export type { AuthorizeParams, ExchangeCodeParams, RefreshParams, TokenResponse } from "./oidc";

export { createPkcePair, generateCodeVerifier, codeChallenge, randomState } from "./pkce";

export { reportFeatureRequest } from "./feature-requests";
export type { FeatureRequestInput, FeatureRequestKind, FeatureRequestResult } from "./feature-requests";

export { requireApproval, canonicalParamsHash } from "./approval";
export type { RequireApprovalOptions, RequireApprovalResult, ApprovalRequiredBody } from "./approval";

export { isLockedDown, clearLockdownCache } from "./lockdown";

export {
  rateLimit,
  rateLimitResponse,
  dailyCap,
  DEFAULT_AGENT_CAPS,
  kvCounterStore,
  postgresCounterStore,
} from "./rate-limit";
export type { RateLimitBinding, CounterStore, RateLimitOptions, RateLimitResult, DailyCapOptions } from "./rate-limit";
