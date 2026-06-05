import { cn } from "@/lib/utils";

/**
 * Unified skeleton placeholder primitive.
 *
 * Single source of truth for loading placeholder visuals across the app.
 * Renders a pulsing rounded box matching the visual style used throughout
 * the loading-states overhaul. Only use this for DB/API-fetched data —
 * static chrome should render instantly.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded bg-zinc-800", className)}
      {...props}
    />
  );
}
