const CURRENCY = "INR";

/** Format integer minor units (paise/cents) for display. */
export function formatMoney(cents: number, currency: string = CURRENCY, locale = "en-IN"): string {
  if (!Number.isFinite(cents)) throw new RangeError("Amount must be a finite number");
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Convert a user-typed decimal string ("12.50") to integer cents. Returns null when invalid. */
export function parsePriceToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface LineItem {
  unitPriceCents: number;
  quantity: number;
}

export function lineTotal(item: LineItem): number {
  return item.unitPriceCents * item.quantity;
}

export function cartTotal(items: readonly LineItem[]): number {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}
