import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyExpenseToCarData,
  formatCarDisambiguationList,
  formatCategoryDisambiguationList,
  getNextMissingField,
  parseAmount,
  parseListSelection,
  parseYesNo,
  type ExpenseDraft,
} from "./expenseLogic.ts";

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    carId: "car-1",
    candidateCars: [],
    amount: 220,
    category: "partsCost",
    ...overrides,
  };
}

Deno.test("getNextMissingField: car missing when carId is null", () => {
  assertEquals(getNextMissingField(draft({ carId: null })), "car");
});

Deno.test("getNextMissingField: amount missing when carId is set but amount is null", () => {
  assertEquals(getNextMissingField(draft({ amount: null })), "amount");
});

Deno.test("getNextMissingField: category missing when carId and amount are set but category is null", () => {
  assertEquals(getNextMissingField(draft({ category: null })), "category");
});

Deno.test("getNextMissingField: null (nothing missing) when everything is set", () => {
  assertEquals(getNextMissingField(draft()), null);
});

Deno.test("applyExpenseToCarData adds to an existing numeric string value", () => {
  const result = applyExpenseToCarData({ partsCost: "100" }, "partsCost", 50);
  assertEquals(result.partsCost, 150);
});

Deno.test("applyExpenseToCarData treats a missing/empty field as 0", () => {
  const result = applyExpenseToCarData({ partsCost: "" }, "partsCost", 75);
  assertEquals(result.partsCost, 75);
});

Deno.test("applyExpenseToCarData preserves other fields unchanged", () => {
  const result = applyExpenseToCarData({ partsCost: "10", model: "Mustang" }, "partsCost", 5);
  assertEquals(result.model, "Mustang");
});

Deno.test("formatCarDisambiguationList numbers each car starting at 1", () => {
  const list = formatCarDisambiguationList([
    { id: "a", year: "2018", model: "Mustang" },
    { id: "b", year: "2020", model: "Mustang GT" },
  ]);
  assertEquals(list, "1) 2018 Mustang\n2) 2020 Mustang GT");
});

Deno.test("formatCategoryDisambiguationList lists all 10 categories numbered", () => {
  const list = formatCategoryDisambiguationList();
  assertEquals(list.split("\n").length, 10);
  assertEquals(list.split("\n")[0], "1) Repairs / Labor");
});

Deno.test("parseListSelection accepts a valid in-range number", () => {
  assertEquals(parseListSelection("2", 3), 2);
});

Deno.test("parseListSelection rejects out-of-range, non-numeric, or decimal input", () => {
  assertEquals(parseListSelection("0", 3), null);
  assertEquals(parseListSelection("4", 3), null);
  assertEquals(parseListSelection("abc", 3), null);
  assertEquals(parseListSelection("1.5", 3), null);
});

Deno.test("parseYesNo recognizes common yes/no variants and rejects anything else", () => {
  assertEquals(parseYesNo("yes"), "yes");
  assertEquals(parseYesNo("Y"), "yes");
  assertEquals(parseYesNo("si"), "yes");
  assertEquals(parseYesNo("no"), "no");
  assertEquals(parseYesNo("cancel"), "no");
  assertEquals(parseYesNo("maybe"), null);
});

Deno.test("parseAmount extracts a positive number, ignoring currency symbols", () => {
  assertEquals(parseAmount("$220"), 220);
  assertEquals(parseAmount("220.50"), 220.5);
  assertEquals(parseAmount("not a number"), null);
  assertEquals(parseAmount("-5"), null);
  assertEquals(parseAmount("0"), null);
});
