"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AgentIntroModal } from "@/components/agent-intro-modal";

// Client guard so we attempt onboarding at most once per browser session even
// across client navigations. The authoritative gate is the server (profiles
// .agent_intro_seen_at); this just avoids redundant POSTs.
const SESSION_KEY = "agentIntro:attempted";

/**
 * First-login prompt: offers a ready-to-paste agent prompt containing a freshly
 * minted "default" personal access token. The server route is idempotent and
 * only mints/reveals the token on the user's first call.
 */
export function AgentIntroNudge() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const pathname = usePathname() || "";

  useEffect(() => {
    if (pathname.startsWith("/auth") || pathname.startsWith("/login")) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/agent-intro", {
          method: "POST",
          credentials: "include",
        });
        // Mark attempted regardless of outcome to avoid loops on transient errors.
        window.sessionStorage.setItem(SESSION_KEY, "1");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (json?.needed && json?.prompt) {
          setPrompt(json.prompt);
          setOpen(true);
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <AgentIntroModal isOpen={open} onClose={() => setOpen(false)} prompt={prompt} />
  );
}
