import { Clock, ShoppingCart } from "lucide-react";
import { formatCurrency, type SupplyLike } from "@/lib/supply";
import {
  formatDuration,
  sumCost,
  sumTimeEstimate,
  type TimeLike,
} from "@/lib/rollup";

/**
 * Running subtotal of time and/or cost for a set of items (a parent task's
 * descendants, or a section's tasks). Renders nothing when there's nothing to
 * show, so ordinary rows are unaffected.
 *
 * Plain (no hooks) so a Server Component can render it. `showTime`/`showCost`
 * let a caller drop a figure it already shows elsewhere — e.g. a section that
 * already renders the supply cost via <SupplyTotal> asks for time only.
 */
export function RollupSubtotal({
  items,
  showTime = true,
  showCost = true,
  className = "",
}: {
  items: (TimeLike & SupplyLike)[];
  showTime?: boolean;
  showCost?: boolean;
  className?: string;
}) {
  const minutes = showTime ? sumTimeEstimate(items) : 0;
  const cost = showCost ? sumCost(items) : 0;
  const duration = formatDuration(minutes);

  if (!duration && cost <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-2 text-xs font-normal ${className}`}
    >
      {duration && (
        <span className="inline-flex items-center gap-0.5 text-teal-400">
          <Clock className="h-3 w-3 shrink-0" />
          {duration}
        </span>
      )}
      {cost > 0 && (
        <span className="inline-flex items-center gap-0.5 text-amber-300/80">
          <ShoppingCart className="h-3 w-3 shrink-0" />
          {formatCurrency(cost)}
        </span>
      )}
    </span>
  );
}
