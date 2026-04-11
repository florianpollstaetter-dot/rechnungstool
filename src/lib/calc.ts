export interface CalcItem {
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
}

export function calcItemTotal(item: CalcItem): number {
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
  let subtotal = itemSubtotal;
  if (overallDiscountPercent > 0) {
    subtotal -= subtotal * (overallDiscountPercent / 100);
  }
  if (overallDiscountAmount > 0) {
    subtotal -= overallDiscountAmount;
  }
  subtotal = Math.max(0, subtotal);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal: Math.round(subtotal * 100) / 100, taxAmount: Math.round(taxAmount * 100) / 100, total: Math.round(total * 100) / 100 };
}
