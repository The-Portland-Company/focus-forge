/**
 * Alert-center store logic, kept framework-free so it can be unit tested.
 *
 * The app previously had four independent, bottom-anchored notification
 * systems (global toasts, the email delete tray, the email status pill, undo
 * toasts) that piled up over each other. The alert center consolidates the
 * first three into one top-right stack + bell panel. This module owns the
 * pure state transitions; React wiring lives in contexts/ToastContext.tsx and
 * the UI in components/alert-center.tsx.
 */

export type AlertType = "success" | "error" | "warning" | "info" | "progress";

export type AlertAction = {
  /** Stable key within the alert. */
  id: string;
  label: string;
  onClick: () => void;
  /** Render as a link-style button (e.g. "Show the email"). */
  variant?: "button" | "link";
  disabled?: boolean;
};

export type AppAlert = {
  id: string;
  type: AlertType;
  title: string;
  message?: string;
  /** Secondary hint line rendered under the message (e.g. what to do next). */
  hint?: string;
  createdAt: number;
  /** ms until auto-dismiss; 0 = sticky (errors, in-flight progress). */
  duration: number;
  actions?: AlertAction[];
};

/** How many alerts the collapsed (panel-closed) stack shows at once. */
export const ALERT_STACK_VISIBLE_COUNT = 3;

export const ALERT_DEFAULT_DURATION_MS: Record<AlertType, number> = {
  success: 3000,
  info: 3000,
  warning: 7000,
  // Errors and in-flight progress must be acknowledged / resolved, never
  // silently expire.
  error: 0,
  progress: 0,
};

/** Insert or replace by id, newest first. An upsert with an existing id keeps
 *  the alert's stack position stable while its state changes (e.g. a delete
 *  flipping progress → success → gone). */
export function upsertAlert(alerts: AppAlert[], alert: AppAlert): AppAlert[] {
  const existingIndex = alerts.findIndex((entry) => entry.id === alert.id);
  if (existingIndex === -1) {
    return [alert, ...alerts];
  }
  const next = [...alerts];
  next[existingIndex] = alert;
  return next;
}

export function dismissAlert(alerts: AppAlert[], id: string): AppAlert[] {
  const next = alerts.filter((alert) => alert.id !== id);
  return next.length === alerts.length ? alerts : next;
}

/** The slice the collapsed stack renders (newest first, capped). */
export function getVisibleStackAlerts(
  alerts: AppAlert[],
  visibleCount: number = ALERT_STACK_VISIBLE_COUNT,
): AppAlert[] {
  return alerts.slice(0, visibleCount);
}

export function hasOverflowAlerts(
  alerts: AppAlert[],
  visibleCount: number = ALERT_STACK_VISIBLE_COUNT,
): boolean {
  return alerts.length > visibleCount;
}
