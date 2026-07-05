export interface CostField {
  key: string;
  label: string;
}

export const EXPENSE_COST_FIELDS: CostField[] = [
  { key: "repairCost", label: "Repairs / Labor" },
  { key: "partsCost", label: "Parts" },
  { key: "transportCost", label: "Transport / Tow" },
  { key: "adminFees", label: "Admin / Auction Fees" },
  { key: "titleFees", label: "Title / Registration" },
  { key: "taxes", label: "Taxes" },
  { key: "detailingCost", label: "Detailing / Cleaning" },
  { key: "advertisingCost", label: "Ads / Marketplace" },
  { key: "repoCost", label: "Repo / Recovery Cost" },
  { key: "miscCost", label: "Miscellaneous" },
];

export function isValidExpenseCategory(key: string | null | undefined): boolean {
  if (!key) return false;
  return EXPENSE_COST_FIELDS.some((field) => field.key === key);
}

export function getExpenseCategoryLabel(key: string): string {
  const field = EXPENSE_COST_FIELDS.find((f) => f.key === key);
  return field ? field.label : key;
}
