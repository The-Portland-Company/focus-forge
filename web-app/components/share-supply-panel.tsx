import {
  formatCurrency,
  formatQuantity,
  hasSupplies,
  isSupply,
  parseSupplyVendor,
  supplyIdentityLabel,
  supplyLineTotal,
  supplyPrice,
  supplyQuantity,
  type SupplyLike,
} from "@/lib/supply";
import { SupplyTotal } from "@/components/supply-total";

type SupplyRow = SupplyLike & { id: string; name: string };

/**
 * The supplies half of one section row on the public share page: the section's
 * supply line items plus its subtotal.
 *
 * Every amount comes from lib/supply so the share page and the app can never
 * disagree about a price. Renders nothing when the section holds no supplies,
 * which leaves the grid cell empty and the section rows still aligned.
 */
export function ShareSupplyPanel({ items }: { items: SupplyRow[] }) {
  if (!hasSupplies(items)) return null;

  const supplies = items.filter(isSupply);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <ul className="space-y-2">
        {supplies.map((item) => {
          const identity = supplyIdentityLabel(item);
          const vendor = parseSupplyVendor(item);
          const price = supplyPrice(item);
          const lineTotal = supplyLineTotal(item);
          return (
            <li key={item.id} className="text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-zinc-200">
                  {item.name}
                </span>
                <span className="shrink-0 font-medium text-amber-200">
                  {formatCurrency(lineTotal)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                {identity && <span className="text-zinc-400">{identity}</span>}
                {price !== null && (
                  <span>
                    {formatQuantity(supplyQuantity(item) ?? 1)} ×{" "}
                    {formatCurrency(price)}
                  </span>
                )}
                {vendor &&
                  (vendor.url ? (
                    <a
                      href={vendor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300/80 underline underline-offset-2 hover:text-amber-200"
                    >
                      {vendor.label}
                    </a>
                  ) : (
                    <span className="text-amber-300/70">{vendor.label}</span>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
      <SupplyTotal items={items} className="mt-3" />
    </div>
  );
}
