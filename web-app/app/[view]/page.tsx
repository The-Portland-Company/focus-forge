import ViewClient from "./view-client";

// This page is per-user and auth-gated (middleware), so it must render dynamically.
export const dynamic = "force-dynamic";

/**
 * Render the client shell immediately.
 *
 * Auth is enforced by middleware before this runs. We intentionally do NOT await
 * loadDatabaseForUser here: a hung Supabase/PostgREST call pinned Suspense on
 * loading.tsx (chromeOnly, no client fetch) so the UI showed skeletons forever
 * with a generic "User" label. Client ViewClient fetches /api/database with its
 * own abort timeout once mounted.
 */
export default function ViewPage() {
  return <ViewClient initialData={null} />;
}
