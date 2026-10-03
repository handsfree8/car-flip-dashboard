import test from "node:test";
import assert from "node:assert/strict";
import { buildMetricBreakdown } from "./summaryBreakdown.js";
import {
  money,
  getInvestment,
  getCollectedSoFar,
  getExpectedSaleValue,
  getExpectedProfit,
  getCollectedProfit,
} from "./carCalculations.js";

// Fixture: one available, one sold-cash, one sold-finance.
const A = { id: "a", year: "2020", model: "Available", status: "available", saleType: "cash", auctionPrice: "1000", estimatedMarketValue: "1500" };
const B = { id: "b", year: "2019", model: "CashSold", status: "sold", saleType: "cash", auctionPrice: "2000", soldPrice: "3000" };
const C = { id: "c", year: "2018", model: "Financed", status: "sold", saleType: "finance", auctionPrice: "1000", downPayment: "500", monthlyPayment: "100", numberOfPayments: "10", paymentsReceived: "2" };
const cars = [A, B, C];

test("invested: a row per car, sorted desc, footer equals the summed getInvestment", () => {
  const r = buildMetricBreakdown("invested", cars);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows.map((row) => row.value), [2000, 1000, 1000]); // sorted desc (B, then A/C tie)
  const total = cars.reduce((s, c) => s + getInvestment(c), 0);
  assert.equal(total, 4000);
  assert.equal(r.footerValue, money(total));
});

test("collected / expected footers tie out to the aggregate", () => {
  assert.equal(buildMetricBreakdown("collected", cars).footerValue, money(cars.reduce((s, c) => s + getCollectedSoFar(c), 0)));
  assert.equal(buildMetricBreakdown("expected", cars).footerValue, money(cars.reduce((s, c) => s + getExpectedSaleValue(c), 0)));
});

test("balance: only cars with a positive pending balance appear", () => {
  const r = buildMetricBreakdown("balance", cars);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].id, "c");
  assert.equal(r.rows[0].value, 800); // 1500 expected - 700 collected
  assert.equal(r.footerValue, money(800));
});

test("expectedProfit: signed highlight and footer tie-out", () => {
  const r = buildMetricBreakdown("expectedProfit", cars);
  const total = cars.reduce((s, c) => s + getExpectedProfit(c), 0);
  assert.equal(total, 2000);
  assert.equal(r.footerValue, money(2000));
  assert.ok(r.rows.every((row) => row.highlight === row.value >= 0));
});

test("collectedProfit: negative total ties out and negatives flagged", () => {
  const r = buildMetricBreakdown("collectedProfit", cars);
  const total = cars.reduce((s, c) => s + getCollectedProfit(c), 0);
  assert.equal(total, -300); // (-1000) + 1000 + (-300)
  assert.equal(r.footerValue, money(-300));
  assert.equal(r.rows.find((row) => row.id === "a").highlight, false);
});

test("financedCars: only sold-finance cars, count footer", () => {
  const r = buildMetricBreakdown("financedCars", cars);
  assert.deepEqual(r.rows.map((row) => row.id), ["c"]);
  assert.equal(r.kind, "count");
  assert.equal(r.footerValue, "1 vehicle");
});

test("availableCars: only unsold cars, count footer", () => {
  const r = buildMetricBreakdown("availableCars", cars);
  assert.deepEqual(r.rows.map((row) => row.id), ["a"]);
  assert.equal(r.footerValue, "1 vehicle");
});

test("cars: all vehicles with a profit-or-equity secondary, plural footer", () => {
  const r = buildMetricBreakdown("cars", cars);
  assert.equal(r.rows.length, 3);
  assert.equal(r.footerValue, "3 vehicles");
});

test("unknown metric returns an empty money breakdown", () => {
  const r = buildMetricBreakdown("nope", cars);
  assert.equal(r.rows.length, 0);
  assert.equal(r.footerValue, money(0));
});
