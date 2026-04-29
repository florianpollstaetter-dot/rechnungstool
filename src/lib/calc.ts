export interface CalcItem {
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  tax_rate?: number;
  item_type?: "item" | "section" | "travel_day";
}

export interface TaxBreakdownEntry {
  rate: number;
  taxableAmount: number;
  taxAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcItemTotal(item: CalcItem): number {
  // SCH-924 K2-θ — section rows are headings only and never contribute to totals.
  if (item.item_type === "section") return 0;
  let lineTotal = item.quantity * item.unit_price;
  if (item.discount_percent > 0) {
    lineTotal -= lineTotal * (item.discount_percent / 100);
  }
  if (item.discount_amount > 0) {
    lineTotal -= item.discount_amount;
  }
  return Math.max(0, lineTotal);
}

export function calcTotals(
  items: CalcItem[],
  taxRate: number,
  overallDiscountPercent: number,
  overallDiscountAmount: number
) {
  const itemSubtotal = items.reduce((sum, item) => sum + calcItemTotal(item), 0);
  const discountFactor =
    itemSubtotal > 0
      ? Math.max(
          0,
          1 -
            overallDiscountPercent / 100 -
            (overallDiscountAmount > 0 ? overallDiscountAmount / itemSubtotal : 0),
        )
      : 0;

  // Group by effective per-line rate (falling back to header rate).
  const byRate = new Map<number, number>();
  for (const item of items) {
    const rate = item.tax_rate ?? taxRate;
    const lineNet = calcItemTotal(item) * discountFactor;
    byRate.set(rate, (byRate.get(rate) ?? 0) + lineNet);
  }

  const breakdown: TaxBreakdownEntry[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, taxableAmount]) => ({
      rate,
      taxableAmount: round2(taxableAmount),
      taxAmount: round2(taxableAmount * (rate / 100)),
    }));

  const subtotal = round2(itemSubtotal * discountFactor);
  const taxAmount = breakdown.reduce((s, e) => s + e.taxAmount, 0);
  const total = round2(subtotal + taxAmount);

  return {
    subtotal,
    taxAmount: round2(taxAmount),
    total,
    taxBreakdown: breakdown,
  };
}
