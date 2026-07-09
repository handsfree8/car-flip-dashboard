import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyExpenseItemToCarData, formatExpenseItemConfirmation, type ExpenseLineItem } from "./expenseItem.ts";

const item: ExpenseLineItem = {
  id: "item-1",
  description: "ABS sensor",
  category: "partsCost",
  amount: 300,
  labor: 80,
  date: "2026-07-07",
};

Deno.test("applyExpenseItemToCarData appends the item and rolls part into its category and labor into repairCost", () => {
  const result = applyExpenseItemToCarData({ partsCost: "100", repairCost: "50" }, item);
  assertEquals((result.expenses as unknown[]).length, 1);
  assertEquals((result.expenses as ExpenseLineItem[])[0].description, "ABS sensor");
  assertEquals(result.partsCost, 400); // 100 + 300
  assertEquals(result.repairCost, 130); // 50 + 80 labor
});

Deno.test("applyExpenseItemToCarData handles a repairCost-category item plus labor without double-counting", () => {
  const repairItem: ExpenseLineItem = { ...item, category: "repairCost", amount: 200, labor: 50 };
  const result = applyExpenseItemToCarData({ repairCost: "0" }, repairItem);
  assertEquals(result.repairCost, 250); // 0 + 200 amount + 50 labor
});

Deno.test("applyExpenseItemToCarData starts a new expenses array and does not mutate input", () => {
  const input = { partsCost: "0" };
  const result = applyExpenseItemToCarData(input, item);
  assertEquals((result.expenses as unknown[]).length, 1);
  assertEquals("expenses" in input, false); // input untouched
});

Deno.test("applyExpenseItemToCarData appends to an existing expenses array", () => {
  const prior: ExpenseLineItem = { ...item, id: "item-0", description: "Oil change" };
  const result = applyExpenseItemToCarData({ expenses: [prior], partsCost: "0" }, item);
  assertEquals((result.expenses as ExpenseLineItem[]).map((e) => e.id), ["item-0", "item-1"]);
});

Deno.test("applyExpenseItemToCarData with zero labor does not touch repairCost", () => {
  const result = applyExpenseItemToCarData({ partsCost: "0" }, { ...item, labor: 0 });
  assertEquals(result.repairCost, undefined);
});

Deno.test("formatExpenseItemConfirmation renders the mini table with labor", () => {
  const msg = formatExpenseItemConfirmation("2018 Ford Mustang", "ABS sensor", "partsCost", 300, 80);
  assertEquals(msg.includes("2018 Ford Mustang"), true);
  assertEquals(msg.includes("ABS sensor"), true);
  assertEquals(msg.includes("$380"), true);
  assertEquals(msg.includes("Confirm? (yes/no)"), true);
});

Deno.test("formatExpenseItemConfirmation omits the labor segment when labor is 0", () => {
  const msg = formatExpenseItemConfirmation("2018 Ford Mustang", "Wax", "detailingCost", 40, 0);
  assertEquals(msg.includes("Labor"), false);
  assertEquals(msg.includes("$40"), true);
});
