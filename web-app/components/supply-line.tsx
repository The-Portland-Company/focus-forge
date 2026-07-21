import { ExternalLink, ShoppingCart } from "lucide-react";
import {
  formatCurrency,
  formatQuantity,
  isSupply,
  supplyLineTotal,
  parseSupplyVendor,
  supplyPrice,
  supplyQuantity,
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
  const vendor = parseSupplyVendor(task);
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
      {/* A vendor may be a plain name or a URL. URLs render as a link labelled
          by site name; the click is stopped so opening the vendor does not also
          open the task. */}
      {vendor &&
        (vendor.url ? (
          <a
            href={vendor.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Open ${vendor.label} in a new tab`}
            className="inline-flex items-center gap-0.5 text-amber-300/70 underline-offset-2 hover:text-amber-200 hover:underline"
          >
            @ {vendor.label}
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          </a>
        ) : (
          <span className="text-amber-300/70">@ {vendor.label}</span>
        ))}
    </span>
  );
}
