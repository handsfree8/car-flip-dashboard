import { EXPENSE_COST_FIELDS } from "./costFields.ts";

export interface ExpenseDraft {
  carId: string | null;
  candidateCars: { id: string; year: string; model: string }[];
  amount: number | null;
  category: string | null;
  description?: string | null;
  labor?: number | null;
}

export type MissingField = "car" | "amount" | "category" | null;

export function getNextMissingField(draft: ExpenseDraft): MissingField {
  if (!draft.carId) return "car";
  if (draft.amount === null || draft.amount === undefined) return "amount";
  if (!draft.category) return "category";
  return null;
}

export function applyExpenseToCarData(
  carData: Record<string, unknown>,
  category: string,
  amount: number,
): Record<string, unknown> {
  const currentValue = Number(carData[category] || 0);
  return {
    ...carData,
    [category]: currentValue + amount,
  };
}

export function formatCarDisambiguationList(cars: { id: string; year: string; model: string }[]): string {
  return cars.map((car, index) => `${index + 1}) ${car.year} ${car.model}`).join("\n");
}

export function formatCategoryDisambiguationList(): string {
  return EXPENSE_COST_FIELDS.map((field, index) => `${index + 1}) ${field.label}`).join("\n");
}

export function parseListSelection(text: string, optionCount: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (parsed < 1 || parsed > optionCount) return null;
  return parsed;
}

export function parseYesNo(text: string): "yes" | "no" | null {
  const normalized = text.trim().toLowerCase();
  if (["yes", "y", "si", "sí", "confirm", "confirmo"].includes(normalized)) return "yes";
  if (["no", "n", "cancel", "cancelar"].includes(normalized)) return "no";
  return null;
}

export function parseAmount(text: string): number | null {
  // First check if the input contains a minus sign - if so, reject it
  if (text.includes("-")) return null;
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}
