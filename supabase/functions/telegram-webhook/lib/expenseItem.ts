import { getExpenseCategoryLabel } from "./costFields.ts";

export interface ExpenseLineItem {
  id: string;
  description: string;
  category: string;
  amount: number;
  labor: number;
  date: string;
}

// Appends the line item and rolls its costs into the flat category totals:
// the part cost into the item's own category, and any labor into repairCost
// ("Repairs / Labor"). Reads run against the in-progress result so a
// repairCost-category item with labor accumulates correctly. Input is not mutated.
export function applyExpenseItemToCarData(
  carData: Record<string, unknown>,
  item: ExpenseLineItem,
): Record<string, unknown> {
  const existing = Array.isArray(carData.expenses) ? (carData.expenses as unknown[]) : [];
  const result: Record<string, unknown> = { ...carData, expenses: [...existing, item] };
  result[item.category] = Number(result[item.category] || 0) + item.amount;
  if (item.labor > 0) {
    result.repairCost = Number(result.repairCost || 0) + item.labor;
  }
  return result;
}

export function formatExpenseItemConfirmation(
  carLabel: string,
  description: string,
  category: string,
  amount: number,
  labor: number,
): string {
  const total = amount + labor;
  const laborPart = labor > 0 ? ` + Labor: $${labor}` : "";
  return (
    `Add to the ${carLabel}:\n` +
    `• ${description} — ${getExpenseCategoryLabel(category)}: $${amount}${laborPart} = $${total}\n` +
    `Confirm? (yes/no)`
  );
}
