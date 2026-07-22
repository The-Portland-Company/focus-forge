import { ShoppingCart } from "lucide-react";
import {
  formatCurrency,
  hasSupplies,
  supplyCount,
  supplyTotal,
  type SupplyLike,
} from "@/lib/supply";

/**
 * Supply subtotal/total strip. Renders nothing when the list holds no
 * supplies, so ordinary task lists are unaffected.
 *
 * A plain server-renderable component (no hooks) so the public share page can
 * use the same markup as the app.
 */
export function SupplyTotal({
  items,
  label = "Supplies subtotal",
  variant = "subtotal",
  className = "",
}: {
  items: SupplyLike[];
  label?: string;
  variant?: "subtotal" | "total" | "inline";
  className?: string;
}) {
  if (!hasSupplies(items)) return null;

  const total = supplyTotal(items);
  const count = supplyCount(items);
  const isTotal = variant === "total";

  // Inline sits in a section or task-list heading rather than on its own row,
  // so it drops the panel chrome and keeps only the figure.
  if (variant === "inline") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-normal text-amber-300/80 ${className}`}
        title={`${count} ${count === 1 ? "supply" : "supplies"}`}
      >
        <ShoppingCart className="h-3 w-3 shrink-0" />
        {formatCurrency(total)}
      </span>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
        isTotal
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-zinc-800 bg-zinc-900/40"
      } ${className}`}
    >
      <span
        className={`flex items-center gap-1.5 ${
          isTotal ? "text-sm font-medium text-amber-200" : "text-xs text-zinc-400"
        }`}
      >
        <ShoppingCart className={isTotal ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {label}
        <span className="text-zinc-500">
          ({count} {count === 1 ? "item" : "items"})
        </span>
      </span>
      <span
        className={
          isTotal
            ? "text-base font-semibold text-amber-200"
            : "text-sm font-medium text-zinc-200"
        }
      >
        {formatCurrency(total)}
      </span>
    </div>
  );
}
