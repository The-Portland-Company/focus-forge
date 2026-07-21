/**
 * Supply line-item maths and formatting.
 *
 * Shared by the authenticated app and the public share page so a subtotal can
 * never disagree between the two. Accepts both the camelCase Task shape and
 * raw snake_case DB rows, because the share page reads rows straight from
 * PostgREST without going through the adapter's mapper.
 */

export interface SupplyLike {
  is_supply?: boolean | null;
  isSupply?: boolean | null;
  supply_quantity?: number | string | null;
  supplyQuantity?: number | string | null;
  supply_price?: number | string | null;
  supplyPrice?: number | string | null;
  supply_vendor?: string | null;
  supplyVendor?: string | null;
}

/** numeric columns arrive from PostgREST as strings; coerce safely. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isSupply(item: SupplyLike): boolean {
  return Boolean(item.is_supply ?? item.isSupply);
}

export function supplyQuantity(item: SupplyLike): number | null {
  return toNumber(item.supply_quantity ?? item.supplyQuantity);
}

export function supplyPrice(item: SupplyLike): number | null {
  return toNumber(item.supply_price ?? item.supplyPrice);
}

export function supplyVendor(item: SupplyLike): string | null {
  const vendor = item.supply_vendor ?? item.supplyVendor;
  return vendor ? String(vendor) : null;
}

/**
 * Line total for one supply, rounded to cents.
 *
 * Returns null when the line has no computable amount (not a supply, or price
 * missing) so callers can distinguish "no amount" from a genuine 0.00. A
 * missing quantity counts as 1 — a supply priced but unquantified is one of
 * the thing, which is what people mean when they leave quantity blank.
 */
export function supplyLineTotal(item: SupplyLike): number | null {
  if (!isSupply(item)) return null;
  const price = supplyPrice(item);
  if (price === null) return null;
  const quantity = supplyQuantity(item) ?? 1;
  return Math.round(price * quantity * 100) / 100;
}

/** Sum of every computable supply line in the list, rounded to cents. */
export function supplyTotal(items: SupplyLike[]): number {
  const total = items.reduce<number>((sum, item) => {
    const line = supplyLineTotal(item);
    return line === null ? sum : sum + line;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** How many of the given items are supplies. */
export function supplyCount(items: SupplyLike[]): number {
  return items.filter(isSupply).length;
}

/** True when the list has at least one supply worth showing a subtotal for. */
export function hasSupplies(items: SupplyLike[]): boolean {
  return items.some(isSupply);
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format an amount as USD currency, e.g. 1234.5 -> "$1,234.50". */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "—";
  }
  return currencyFormatter.format(amount);
}

/** Format a quantity without trailing zero noise: 2 -> "2", 2.5 -> "2.5". */
export function formatQuantity(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) {
    return "";
  }
  return String(Number(quantity.toFixed(3)));
}
