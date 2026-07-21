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
  supply_make?: string | null;
  supplyMake?: string | null;
  supply_model?: string | null;
  supplyModel?: string | null;
  supply_type?: string | null;
  supplyType?: string | null;
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

export function supplyMake(item: SupplyLike): string | null {
  const value = item.supply_make ?? item.supplyMake;
  return value ? String(value) : null;
}

export function supplyModel(item: SupplyLike): string | null {
  const value = item.supply_model ?? item.supplyModel;
  return value ? String(value) : null;
}

export function supplyType(item: SupplyLike): string | null {
  const value = item.supply_type ?? item.supplyType;
  return value ? String(value) : null;
}

/**
 * How a supply identifies itself: a make/model pair names a specific product, a
 * type names a commodity. Which one is in use is inferred from what's filled in
 * rather than stored, so supplies predating these fields stay valid.
 */
export function supplyIdentityKind(
  item: SupplyLike,
): "make-model" | "type" | null {
  if (supplyMake(item) || supplyModel(item)) return "make-model";
  if (supplyType(item)) return "type";
  return null;
}

/** One-line identity label, e.g. "DeWalt DCD771C2" or "2x6x8 doug fir". */
export function supplyIdentityLabel(item: SupplyLike): string | null {
  const make = supplyMake(item);
  const model = supplyModel(item);
  if (make || model) return [make, model].filter(Boolean).join(" ");
  return supplyType(item);
}

/**
 * What a task row should show as its primary label.
 *
 * A supply is identified by its make/model or type rather than a free-text
 * title, so those lead the row. Supplies predating the identity fields — and
 * every ordinary task — fall back to the stored name.
 */
export function taskDisplayName(item: SupplyLike, name: string): string {
  if (!isSupply(item)) return name;
  return supplyIdentityLabel(item)?.trim() || name;
}

/**
 * The name a supply is stored under.
 *
 * `tasks.name` is NOT NULL and every list view renders it, so a supply — whose
 * form has no title input — still needs one. It is derived from the identity
 * fields, falling back to the vendor, then a typed title, then a constant, so a
 * supply can never save with an empty name.
 */
export function deriveSupplyName(
  item: SupplyLike,
  fallback?: string | null,
): string {
  const identity = supplyIdentityLabel(item)?.trim();
  if (identity) return identity;
  const vendor = parseSupplyVendor(item)?.label?.trim();
  if (vendor) return vendor;
  const typed = fallback?.trim();
  if (typed) return typed;
  return "Supply";
}

/**
 * A vendor may be a plain name or a URL. Returns the parsed pieces so callers
 * can render a link labelled by site name rather than showing a raw URL.
 *
 * Only http(s) is treated as a link — a bare "Home Depot" stays text, and
 * javascript:/data: URLs are never linkified.
 */
export function parseSupplyVendor(
  item: SupplyLike,
): { label: string; url: string | null } | null {
  const raw = supplyVendor(item);
  if (!raw) return null;

  const trimmed = raw.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(trimmed)
      ? `https://${trimmed}`
      : null;

  if (!candidate) return { label: trimmed, url: null };

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { label: trimmed, url: null };
    }
    return { label: url.hostname.replace(/^www\./, ""), url: url.toString() };
  } catch {
    return { label: trimmed, url: null };
  }
}
