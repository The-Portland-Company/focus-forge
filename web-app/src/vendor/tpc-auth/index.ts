// Vendored from tpc-auth/packages/auth/src (@the-portland-company/auth 0.1.0, tpc-auth@906bd06).
// Do not edit here. Replace with the published package once it exists.
export { DEFAULT_ISSUER, PAT_PREFIX, ROLE_RANK, TpcAuthError, resolveIssuer } from "./types";
export type { AuthContext, OrgClaim, Role } from "./types";

export { verifyAccessToken, contextFromClaims } from "./verify";
export type { VerifyOptions } from "./verify";

export { authenticate, bearerToken, clearPatCache } from "./authenticate";
export type { AuthenticateOptions } from "./authenticate";

export { requireApp, requireOrgRole, requireScope, orgRole } from "./guards";

export { protectedResourceMetadata, unauthorized, errorResponse } from "./resource";
export type { ResourceMetadataOptions, UnauthorizedOptions } from "./resource";

export { oidc, authorizeUrl, exchangeCode, refresh, revoke, logoutUrl, discover } from "./oidc";
export type { AuthorizeParams, ExchangeCodeParams, RefreshParams, TokenResponse } from "./oidc";

export { createPkcePair, generateCodeVerifier, codeChallenge, randomState } from "./pkce";

export { reportFeatureRequest } from "./feature-requests";
export type { FeatureRequestInput, FeatureRequestKind, FeatureRequestResult } from "./feature-requests";
