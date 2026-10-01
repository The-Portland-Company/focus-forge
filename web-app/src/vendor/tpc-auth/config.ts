// Focus Forge's TPC Auth resource/app configuration.
//
// Confirmed directly against TPC Auth's `apps` table (Supabase project
// rraiiekfgwdpjsrvepfs): id "forge", scopes forge:read/forge:write. The
// OAuth client for this app is registered there as client_id "focus-forge"
// (public client, PKCE, no secret).
//
// Domain migration (2026-09-30): Forge's canonical resource/audience moved
// to https://app.focusforge.dev. TPC Auth's `apps.resource_uri` for "forge"
// was updated to match, with the old host added to `apps.resource_aliases`
// so a freshly-requested token/PAT exchange against either host still
// resolves to the same app (see tpc-auth PR #15, "resource_aliases").
// New tokens TPC Auth issues always carry the NEW canonical as `aud` — so
// Forge only needs to keep accepting the OLD canonical as a *legacy* audience
// for tokens that were already issued before this cutover, not as an ongoing
// alias going forward. `authenticate()` is given both: `resource` (new) is
// what's used for outbound requests (authorize/token/PAT-exchange — the IdP
// resolves either value to the same app, but exchanges should ask for the
// value this app now intends to use going forward) and verifying freshly
// exchanged PATs; `legacyResources` only widens *local JWT verification* to
// also accept the old `aud`, so an access token minted before the cutover
// keeps working until it naturally expires (access tokens are short-lived:
// 5-15 minutes).
export const TPC_APP_ID = "forge";
export const TPC_RESOURCE = "https://app.focusforge.dev";
/** Audiences a token may still carry that we must keep accepting (JWT verify only). */
export const TPC_LEGACY_RESOURCES = ["https://focusforge.theportlandcompany.com"];
export const TPC_CLIENT_ID = "focus-forge";
