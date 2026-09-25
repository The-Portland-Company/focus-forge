// Focus Forge's TPC Auth resource/app configuration.
//
// Confirmed directly against TPC Auth's `apps` table (Supabase project
// rraiiekfgwdpjsrvepfs): id "forge", resource_uri
// "https://focusforge.theportlandcompany.com", scopes forge:read/forge:write.
// The OAuth client for this app is registered there as client_id
// "focus-forge" (public client, PKCE, no secret).
export const TPC_APP_ID = "forge";
export const TPC_RESOURCE = "https://focusforge.theportlandcompany.com";
export const TPC_CLIENT_ID = "focus-forge";
