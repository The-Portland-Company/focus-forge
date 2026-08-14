"use client";

import { useCallback, useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Info,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALERT_STACK_VISIBLE_COUNT,
  getFloatingAlerts,
  getVisibleStackAlerts,
  hasOverflowAlerts,
  type AppAlert,
} from "@/lib/alert-center";
import { useAlertCenter } from "@/contexts/ToastContext";

/** Matches .alert-card-exit in globals.css. */
const ALERT_EXIT_MS = 220;

function AlertTypeIcon({ type }: { type: AppAlert["type"] }) {
  switch (type) {
    case "success":
      return <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />;
    case "error":
      return <XCircle className="h-4 w-4 shrink-0 text-rose-400" />;
    case "warning":
      return <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />;
    case "progress":
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />;
    default:
      return <Info className="h-4 w-4 shrink-0 text-sky-400" />;
  }
}

function alertToneClassName(type: AppAlert["type"]) {
  switch (type) {
    case "success":
      return "border-emerald-500/30 bg-emerald-950/85";
    case "error":
      return "border-rose-500/40 bg-rose-950/85";
    case "warning":
      return "border-amber-500/30 bg-amber-950/85";
    default:
      return "border-zinc-700/70 bg-zinc-950/90";
  }
}

function AlertCard({
  alert,
  onDismiss,
  animated = true,
}: {
  alert: AppAlert;
  onDismiss: (id: string) => void;
  animated?: boolean;
}) {
  const [isLeaving, setIsLeaving] = useState(false);

  // Exit animation before unmount (removing on the timer directly would yank
  // the card out mid-animation).
  const requestClose = useCallback(() => {
    if (!animated) {
      onDismiss(alert.id);
      return;
    }
    setIsLeaving((already) => {
      if (already) return already;
      window.setTimeout(() => onDismiss(alert.id), ALERT_EXIT_MS);
      return true;
    });
  }, [alert.id, animated, onDismiss]);

  useEffect(() => {
    if (!alert.duration) return;
    const timer = window.setTimeout(requestClose, alert.duration);
    return () => window.clearTimeout(timer);
  }, [alert.duration, requestClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-xl backdrop-blur",
        alertToneClassName(alert.type),
        animated && (isLeaving ? "alert-card-exit" : "alert-card-enter"),
      )}
    >
      <span className="mt-0.5">
        <AlertTypeIcon type={alert.type} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs font-medium text-zinc-100">
          {alert.title}
        </p>
        {alert.message ? (
          <p className="mt-1 break-words text-[11px] leading-snug text-zinc-300/90">
            {alert.message}
          </p>
        ) : null}
        {alert.hint ? (
          <p className="mt-0.5 break-words text-[11px] leading-snug text-zinc-500">
            {alert.hint}
          </p>
        ) : null}
        {alert.actions?.length ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {alert.actions.map((action) =>
              action.variant === "link" ? (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className="rounded-md text-[11px] font-medium text-zinc-200 underline decoration-zinc-500 underline-offset-4 transition-colors hover:text-white disabled:opacity-50"
                >
                  {action.label}
                </button>
              ) : (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={requestClose}
        aria-label="Dismiss"
        title="Dismiss"
        className="-mr-0.5 shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * The collapsed top-right stack: newest ALERT_STACK_VISIBLE_COUNT *ephemeral*
 * alerts, the last one fading out via a bottom mask; hovering lifts the mask
 * and lets the (height-capped) container scroll through the rest. Hidden while
 * the bell panel is open — the panel shows the same cards.
 *
 * Only showToast's one-shot feedback floats here. Persistent alerts (a delete
 * offering undo for a minute, a send, sync progress) are bell-only: they used
 * to camp on top of the page for as long as they were live.
 */
export function AlertCenterStack() {
  const { alerts, dismissAlert, isPanelOpen } = useAlertCenter();
  const [isHovered, setIsHovered] = useState(false);

  const floating = getFloatingAlerts(alerts);
  if (isPanelOpen || floating.length === 0) return null;

  const overflowing = hasOverflowAlerts(floating);
  const visible = isHovered ? floating : getVisibleStackAlerts(floating);
  // Fade the bottom of the stack when it is truncated (the 3rd card) or, while
  // hovered, when there is still more to scroll to.
  const masked =
    !isHovered && (overflowing || floating.length === ALERT_STACK_VISIBLE_COUNT);

  return (
    <div
      className="pointer-events-none fixed right-4 top-16 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "flex flex-col gap-2 pr-0.5",
          isHovered && "max-h-[70vh] overflow-y-auto",
          masked && "alert-stack-masked",
        )}
      >
        {visible.map((alert) => (
          <AlertCard key={alert.id} alert={alert} onDismiss={dismissAlert} />
        ))}
      </div>
      {overflowing && !isHovered ? (
        <p className="pointer-events-auto mt-1 self-end text-[10px] text-zinc-500">
          +{alerts.length - ALERT_STACK_VISIBLE_COUNT} more — hover to scroll
        </p>
      ) : null}
    </div>
  );
}

/**
 * Bell button for header button rows. Shows the active-alert count and opens
 * the alert panel (a popover listing every active alert); while open, the
 * floating stack hides.
 */
export function AlertBellButton({ className }: { className?: string }) {
  const { alerts, dismissAlert, dismissAllAlerts, isPanelOpen, setPanelOpen } =
    useAlertCenter();

  return (
    <Popover.Root open={isPanelOpen} onOpenChange={setPanelOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white",
            className,
          )}
          aria-label={
            alerts.length
              ? `Alerts (${alerts.length} active)`
              : "Alerts (none active)"
          }
          title="Alerts"
        >
          <Bell className="h-4 w-4" />
          {alerts.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--theme-primary-rgb))] px-1 text-[10px] font-semibold text-white">
              {alerts.length}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="bottom"
          sideOffset={8}
          className="z-[90] w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-xs font-medium text-zinc-300">
              {alerts.length
                ? `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}`
                : "No active alerts"}
            </span>
            {alerts.length > 1 ? (
              <button
                type="button"
                onClick={dismissAllAlerts}
                className="rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Clear all
              </button>
            ) : null}
          </div>
          {alerts.length ? (
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-2">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onDismiss={dismissAlert}
                  animated={false}
                />
              ))}
            </div>
          ) : (
            <p className="px-3 py-6 text-center text-xs text-zinc-500">
              You&apos;re all caught up.
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
