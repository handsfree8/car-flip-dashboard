import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EXPENSE_COST_FIELDS, getExpenseCategoryLabel, isValidExpenseCategory } from "./costFields.ts";

Deno.test("EXPENSE_COST_FIELDS has exactly 10 categories, excluding auctionPrice", () => {
  assertEquals(EXPENSE_COST_FIELDS.length, 10);
  assertEquals(
    EXPENSE_COST_FIELDS.some((field) => field.key === "auctionPrice"),
    false,
  );
});

Deno.test("isValidExpenseCategory accepts known keys and rejects unknown/null/undefined", () => {
  assertEquals(isValidExpenseCategory("partsCost"), true);
  assertEquals(isValidExpenseCategory("auctionPrice"), false);
  assertEquals(isValidExpenseCategory("notARealCategory"), false);
  assertEquals(isValidExpenseCategory(null), false);
  assertEquals(isValidExpenseCategory(undefined), false);
});

Deno.test("getExpenseCategoryLabel returns the human label for a known key, or the key itself otherwise", () => {
  assertEquals(getExpenseCategoryLabel("partsCost"), "Parts");
  assertEquals(getExpenseCategoryLabel("detailingCost"), "Detailing / Cleaning");
  assertEquals(getExpenseCategoryLabel("unknownKey"), "unknownKey");
});
