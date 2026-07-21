import { ShoppingCart } from "lucide-react";
import {
  formatCurrency,
  formatQuantity,
  isSupply,
  supplyLineTotal,
  supplyPrice,
  supplyQuantity,
  supplyVendor,
  type SupplyLike,
} from "@/lib/supply";

/**
 * Inline "3 × $2.50 = $7.50 @ Vendor" detail for a supply task row.
 * Renders nothing for ordinary tasks.
 */
export function SupplyLine({
  task,
  className = "",
}: {
  task: SupplyLike;
  className?: string;
}) {
  if (!isSupply(task)) return null;

  const price = supplyPrice(task);
  const vendor = supplyVendor(task);
  const lineTotal = supplyLineTotal(task);

  // A supply with neither a price nor a vendor still gets the cart icon, so it
  // reads as a supply rather than looking like an ordinary task.
  return (
    <span
      className={`ml-auto flex shrink-0 items-center gap-1.5 text-xs text-amber-300 ${className}`}
    >
      <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
      {price !== null && (
        <span className="font-medium">
          {formatQuantity(supplyQuantity(task) ?? 1)} × {formatCurrency(price)} ={" "}
          {formatCurrency(lineTotal)}
        </span>
      )}
      {vendor && <span className="text-amber-300/70">@ {vendor}</span>}
    </span>
  );
}
