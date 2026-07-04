import { test } from "node:test";
import assert from "node:assert/strict";
import { carsToCsv } from "./exportCsv.js";
import { emptyCar } from "./carCalculations.js";

test("carsToCsv emits a header row plus one row per car", () => {
  const cars = [
    {
      ...emptyCar,
      model: "Civic",
      year: "2015",
      status: "sold",
      saleType: "cash",
      purchaseDate: "2026-01-01",
      soldDate: "2026-01-21",
      soldPrice: "8000",
      auctionPrice: "5000",
    },
  ];

  const csv = carsToCsv(cars);
  const lines = csv.split("\n");

  assert.equal(lines.length, 2);
  assert.equal(
    lines[0],
    "Model,Year,Status,Sale Type,Purchase Date,Sold Date,Investment,Expected Sale Value,Collected So Far,Balance Remaining,Expected Profit,Collected Profit,Days In Inventory"
  );
  assert.equal(lines[1], "Civic,2015,sold,cash,2026-01-01,2026-01-21,5000,8000,8000,0,3000,3000,20");
});

test("carsToCsv escapes commas and quotes in text fields", () => {
  const cars = [{ ...emptyCar, model: 'Civic, "Special"', year: "2015" }];
  const csv = carsToCsv(cars);
  const dataLine = csv.split("\n")[1];
  assert.equal(dataLine.startsWith('"Civic, ""Special""",2015,'), true);
});

test("carsToCsv returns just the header for an empty list", () => {
  const csv = carsToCsv([]);
  assert.equal(csv.split("\n").length, 1);
});
