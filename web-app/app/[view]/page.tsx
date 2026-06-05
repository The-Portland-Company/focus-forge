import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadDatabaseForUser } from "@/lib/db/load-database";
import type { Database } from "@/lib/types";
import ViewClient from "./view-client";

// This page is per-user and auth-gated, so it must render dynamically.
export const dynamic = "force-dynamic";

/**
 * Streams the initial database payload from the server, scoped to the
 * authenticated session user (same auth + service-role path as
 * /api/database). The client component receives it as `initialData` and seeds
 * its state, skipping the first client fetch. Wrapped in Suspense so the
 * instant chrome (loading.tsx) streams immediately while data resolves —
 * Next.js shows loading.tsx automatically while this async component awaits.
 */
export default async function ViewPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Middleware already redirects unauthenticated users; this is defensive.
  if (!session?.user) {
    redirect("/auth/login");
  }

  let initialData: Database | null = null;
  try {
    initialData = (await loadDatabaseForUser(
      session.user.id,
      session.user.email,
    )) as unknown as Database;
  } catch (error) {
    // Fall back to a pure client fetch if the server load fails — never block
    // the page on it. The client effect will fetch when initialData is null.
    console.error("Server initial database load failed:", error);
    initialData = null;
  }

  return <ViewClient initialData={initialData} />;
}
