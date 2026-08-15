"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAlertCenter } from "@/contexts/ToastContext";

/**
 * The "every provider is out of money" failure, raised in the alert center
 * instead of as a one-shot toast: it is not feedback on an action, it is a
 * standing account problem the user has to go fix, so the alert panel opens
 * itself, holds the card for AI_CREDIT_ALERT_MS, then closes again.
 *
 * Server copy lives in app/api/ai-agent/chat/route.ts.
 */
export const AI_CREDIT_ALERT_ID = "ai-providers-out-of-credit";

/** How long the alerts panel stays open for this alert. */
export const AI_CREDIT_ALERT_MS = 7000;

/** Settings deep link: the LLM Providers section autoscrolls on ?section=. */
export const LLM_PROVIDERS_SETTINGS_HREF = "/settings?section=llm-providers";

export const AI_CREDIT_ALERT_TITLE = "AI assistant is out of credit";

/** Recognises the exhausted-quota error text the chat API returns. */
export function isAiCreditError(message?: string | null): boolean {
  if (!message) return false;
  return /out of credit\/quota|Fund one of the accounts/i.test(message);
}

export function useAiCreditAlert() {
  const router = useRouter();
  const { upsertAlert, setPanelOpen } = useAlertCenter();
  const closeTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const openLlmProviderSettings = useCallback(() => {
    setPanelOpen(false);
    router.push(LLM_PROVIDERS_SETTINGS_HREF);
  }, [router, setPanelOpen]);

  /** Raise the alert in the alert panel and open the panel for 7s. */
  const showAiCreditAlert = useCallback(
    (message: string) => {
      upsertAlert({
        id: AI_CREDIT_ALERT_ID,
        type: "error",
        title: AI_CREDIT_ALERT_TITLE,
        message,
        hint: "Click to open your AI connections and top one up.",
        duration: AI_CREDIT_ALERT_MS,
        onSelect: openLlmProviderSettings,
        actions: [
          {
            id: "open-llm-providers",
            label: "Open AI connections",
            onClick: openLlmProviderSettings,
          },
        ],
      });
      setPanelOpen(true);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setPanelOpen(false);
      }, AI_CREDIT_ALERT_MS);
    },
    [openLlmProviderSettings, setPanelOpen, upsertAlert],
  );

  return { showAiCreditAlert, openLlmProviderSettings };
}
