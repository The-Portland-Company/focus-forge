"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

/**
 * Client-only lazy wrapper for the global floating AI assistant. It is a
 * deferred widget (not needed for first paint), so we keep it out of the
 * initial client bundle and load it on the client after hydration.
 *
 * `ssr: false` requires a Client Component boundary, which this file provides;
 * the server layout cannot use `ssr: false` directly.
 */
const AiPlannerFloatingChat = dynamic(
  () =>
    import("@/components/ai-planner-floating-chat").then(
      (mod) => mod.AiPlannerFloatingChat,
    ),
  { ssr: false },
);

export function AiPlannerFloatingChatLazy() {
  const pathname = usePathname();
  // Public share links are unauthenticated and read-only; the assistant has no
  // place there and would call authed endpoints that 401. Mounted app-wide in
  // the root layout, so this is where it is gated out.
  if (pathname?.startsWith("/share/")) return null;
  return <AiPlannerFloatingChat />;
}
