import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadDatabaseForUser } from "@/lib/db/load-database";
import type { Database } from "@/lib/types";
import ViewClient from "./view-client";

// This page is per-user and auth-gated, so it must render dynamically.
export const dynamic = "force-dynamic";

/** Cap SSR data wait so loading.tsx (chromeOnly, no client fetch) cannot stick forever. */
const SSR_DATABASE_TIMEOUT_MS = 4_000;

/**
 * Streams the initial database payload from the server, scoped to the
 * authenticated session user (same auth + service-role path as
 * /api/database). The client component receives it as `initialData` and seeds
 * its state, skipping the first client fetch. Wrapped in Suspense so the
 * instant chrome (loading.tsx) streams immediately while data resolves —
 * Next.js shows loading.tsx automatically while this async component awaits.
 *
 * Critical: if the server load hangs (PostgREST/email path), we MUST stop
 * awaiting or the user stays on chromeOnly skeletons with no client fetch.
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
    // Skip heavy email/inbox on SSR — client /api/database loads that next.
    // Race a hard timeout so a stuck Supabase call cannot pin loading.tsx.
    const loadPromise = loadDatabaseForUser(session.user.id, session.user.email, {
      includeEmailData: false,
    }).then((data) => data as unknown as Database);

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), SSR_DATABASE_TIMEOUT_MS);
    });

    initialData = await Promise.race([loadPromise, timeoutPromise]);
    if (initialData == null) {
      console.warn(
        `Server initial database load timed out after ${SSR_DATABASE_TIMEOUT_MS}ms; client will fetch`,
      );
    }
  } catch (error) {
    // Fall back to a pure client fetch if the server load fails — never block
    // the page on it. The client effect will fetch when initialData is null.
    console.error("Server initial database load failed:", error);
    initialData = null;
  }

  return <ViewClient initialData={initialData} />;
}
