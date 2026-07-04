import { test } from "node:test";
import assert from "node:assert/strict";
import {
  money,
  numberValue,
  getInvestment,
  isSold,
  getExpectedSaleValue,
  getCollectedSoFar,
  getBalanceRemaining,
  getExpectedProfit,
  getInventoryEquity,
  getCollectedProfit,
  getBreakEvenPayment,
  rowToCar,
  getDaysInInventory,
  getPaymentStatus,
  getCostBreakdown,
  getProfitByMonth,
  getAgingInventory,
  emptyCar,
} from "./carCalculations.js";

test("money formats a number as whole-dollar USD", () => {
  assert.equal(money(1234.9), "$1,235");
  assert.equal(money(""), "$0");
});

test("numberValue coerces empty/undefined to 0", () => {
  assert.equal(numberValue(""), 0);
  assert.equal(numberValue(undefined), 0);
  assert.equal(numberValue("42"), 42);
});

test("getInvestment sums all cost fields", () => {
  const car = { ...emptyCar, auctionPrice: "1000", repairCost: "200", partsCost: "50" };
  assert.equal(getInvestment(car), 1250);
});

test("isSold reflects status field", () => {
  assert.equal(isSold({ ...emptyCar, status: "sold" }), true);
  assert.equal(isSold({ ...emptyCar, status: "available" }), false);
});

test("getExpectedSaleValue: not sold falls back to estimated/asking price", () => {
  const car = { ...emptyCar, status: "available", estimatedMarketValue: "9000" };
  assert.equal(getExpectedSaleValue(car), 9000);
});

test("getExpectedSaleValue: cash sale uses soldPrice", () => {
  const car = { ...emptyCar, status: "sold", saleType: "cash", soldPrice: "8000" };
  assert.equal(getExpectedSaleValue(car), 8000);
});

test("getExpectedSaleValue: finance sale is down payment + full contract", () => {
  const car = {
    ...emptyCar,
    status: "sold",
    saleType: "finance",
    downPayment: "500",
    monthlyPayment: "200",
    numberOfPayments: "10",
    lateFeesCollected: "25",
  };
  assert.equal(getExpectedSaleValue(car), 500 + 200 * 10 + 25);
});

test("getCollectedSoFar: finance sale counts only payments received", () => {
  const car = {
    ...emptyCar,
    status: "sold",
    saleType: "finance",
    downPayment: "500",
    monthlyPayment: "200",
    paymentsReceived: "3",
    lateFeesCollected: "25",
  };
  assert.equal(getCollectedSoFar(car), 500 + 200 * 3 + 25);
});

test("getBalanceRemaining: 0 for cash sales, positive for unpaid finance", () => {
  const cash = { ...emptyCar, status: "sold", saleType: "cash", soldPrice: "8000" };
  assert.equal(getBalanceRemaining(cash), 0);

  const finance = {
    ...emptyCar,
    status: "sold",
    saleType: "finance",
    monthlyPayment: "200",
    numberOfPayments: "10",
    paymentsReceived: "3",
  };
  assert.equal(getBalanceRemaining(finance), 200 * 7);
});

test("getExpectedProfit and getCollectedProfit subtract investment", () => {
  const car = {
    ...emptyCar,
    status: "sold",
    saleType: "cash",
    soldPrice: "8000",
    auctionPrice: "5000",
  };
  assert.equal(getExpectedProfit(car), 3000);
  assert.equal(getCollectedProfit(car), 3000);
});

test("getInventoryEquity is 0 once sold, else estimated value minus investment", () => {
  const available = { ...emptyCar, status: "available", estimatedMarketValue: "9000", auctionPrice: "6000" };
  assert.equal(getInventoryEquity(available), 3000);

  const sold = { ...emptyCar, status: "sold", saleType: "cash", soldPrice: "8000" };
  assert.equal(getInventoryEquity(sold), 0);
});

test("getBreakEvenPayment computes the payment number that covers investment", () => {
  const car = {
    ...emptyCar,
    saleType: "finance",
    auctionPrice: "5000",
    downPayment: "500",
    monthlyPayment: "300",
  };
  // remaining after down = 4500, / 300 = 15
  assert.equal(getBreakEvenPayment(car), 15);
});

test("getBreakEvenPayment returns N/A for cash sales", () => {
  assert.equal(getBreakEvenPayment({ ...emptyCar, saleType: "cash" }), "N/A");
});

test("rowToCar merges Supabase row data over emptyCar defaults", () => {
  const row = { id: "abc-1", data: { model: "Civic", year: "2015" }, created_at: "2026-01-01" };
  const car = rowToCar(row);
  assert.equal(car.id, "abc-1");
  assert.equal(car.model, "Civic");
  assert.equal(car.year, "2015");
  assert.equal(car.status, "available"); // default preserved
});

test("getDaysInInventory: null with no purchase date", () => {
  assert.equal(getDaysInInventory({ ...emptyCar }), null);
});

test("getDaysInInventory: counts from purchaseDate to referenceDate when not sold", () => {
  const car = { ...emptyCar, status: "available", purchaseDate: "2026-06-01" };
  assert.equal(getDaysInInventory(car, new Date("2026-06-11")), 10);
});

test("getDaysInInventory: counts from purchaseDate to soldDate when sold", () => {
  const car = { ...emptyCar, status: "sold", purchaseDate: "2026-06-01", soldDate: "2026-06-21" };
  // reference date is far in the future but must be ignored once sold
  assert.equal(getDaysInInventory(car, new Date("2027-01-01")), 20);
});

test("getPaymentStatus: not overdue for cash sales or unsold cars", () => {
  assert.deepEqual(getPaymentStatus({ ...emptyCar, status: "sold", saleType: "cash" }), {
    isOverdue: false,
    paymentsBehind: 0,
    amountOverdue: 0,
  });
  assert.deepEqual(getPaymentStatus({ ...emptyCar, status: "available" }), {
    isOverdue: false,
    paymentsBehind: 0,
    amountOverdue: 0,
  });
});

test("getPaymentStatus: flags a finance sale behind schedule", () => {
  const car = {
    ...emptyCar,
    status: "sold",
    saleType: "finance",
    paymentStartDate: "2026-01-01",
    monthlyPayment: "200",
    numberOfPayments: "12",
    paymentsReceived: "1",
  };
  // 5 months elapsed by reference date (Jan through May inclusive of due date)
  const result = getPaymentStatus(car, new Date("2026-05-02"));
  assert.equal(result.isOverdue, true);
  assert.equal(result.paymentsBehind, 4);
  assert.equal(result.amountOverdue, 800);
});

test("getPaymentStatus: not overdue when caught up", () => {
  const car = {
    ...emptyCar,
    status: "sold",
    saleType: "finance",
    paymentStartDate: "2026-01-01",
    monthlyPayment: "200",
    numberOfPayments: "12",
    paymentsReceived: "5",
  };
  const result = getPaymentStatus(car, new Date("2026-05-02"));
  assert.equal(result.isOverdue, false);
  assert.equal(result.paymentsBehind, 0);
});

test("getPaymentStatus: month-boundary dates are read timezone-independently (UTC getters)", () => {
  // Regression test: date-only strings like "2026-01-01" parse as UTC midnight.
  // Reading components with local getters (getFullYear/getMonth/getDate) instead of
  // UTC getters would under-count elapsed months in timezones west of UTC
  // (e.g. America/New_York), because "2026-03-01" UTC midnight falls on
  // Feb 28 local time there. Using UTC getters on both sides keeps the
  // result identical regardless of the runtime's local timezone.
  const car = {
    ...emptyCar,
    status: "sold",
    saleType: "finance",
    paymentStartDate: "2026-01-01",
    monthlyPayment: "200",
    numberOfPayments: "12",
    paymentsReceived: "0",
  };
  // Jan 1 -> Mar 1 reference date: 3 full months elapsed (Jan, Feb, Mar due dates).
  const result = getPaymentStatus(car, new Date("2026-03-01"));
  assert.equal(result.isOverdue, true);
  assert.equal(result.paymentsBehind, 3);
  assert.equal(result.amountOverdue, 600);
});

test("getCostBreakdown totals and averages each cost category across cars", () => {
  const cars = [
    { ...emptyCar, auctionPrice: "1000", repairCost: "100" },
    { ...emptyCar, auctionPrice: "3000", repairCost: "300" },
  ];
  const breakdown = getCostBreakdown(cars);
  const auction = breakdown.find((row) => row.key === "auctionPrice");
  assert.equal(auction.total, 4000);
  assert.equal(auction.average, 2000);
  const repair = breakdown.find((row) => row.key === "repairCost");
  assert.equal(repair.total, 400);
  assert.equal(repair.average, 200);
});

test("getProfitByMonth groups sold cars by sold month, sorted ascending", () => {
  const cars = [
    { ...emptyCar, status: "sold", saleType: "cash", soldDate: "2026-03-15", soldPrice: "9000", auctionPrice: "6000" },
    { ...emptyCar, status: "sold", saleType: "cash", soldDate: "2026-01-10", soldPrice: "8000", auctionPrice: "5000" },
    { ...emptyCar, status: "available" }, // ignored, not sold
  ];
  const byMonth = getProfitByMonth(cars);
  assert.deepEqual(byMonth.map((row) => row.month), ["2026-01", "2026-03"]);
  assert.equal(byMonth[0].profit, 3000);
  assert.equal(byMonth[1].profit, 3000);
});

test("getProfitByMonth buckets a first-of-month sale date timezone-independently (UTC getters)", () => {
  // Regression test: "2026-03-01" parses as UTC midnight. Reading the month key with
  // local getters (getFullYear/getMonth) instead of UTC getters would bucket this sale
  // into "2026-02" in timezones west of UTC (e.g. America/New_York), since UTC
  // midnight on Mar 1 is still Feb 28 local time there. UTC getters keep the bucket
  // fixed at "2026-03" regardless of the runtime's local timezone.
  const cars = [
    { ...emptyCar, status: "sold", saleType: "cash", soldDate: "2026-03-01", soldPrice: "9000", auctionPrice: "6000" },
  ];
  const byMonth = getProfitByMonth(cars);
  assert.equal(byMonth.length, 1);
  assert.equal(byMonth[0].month, "2026-03");
  assert.equal(byMonth[0].profit, 3000);
});

test("getAgingInventory sorts unsold cars by days descending and flags stale ones", () => {
  const cars = [
    { ...emptyCar, status: "available", purchaseDate: "2026-06-01" },
    { ...emptyCar, status: "listed", purchaseDate: "2026-04-01" },
    { ...emptyCar, status: "sold", purchaseDate: "2026-01-01", soldDate: "2026-01-05" },
  ];
  const aging = getAgingInventory(cars, 45, new Date("2026-06-20"));
  assert.equal(aging.length, 2); // sold car excluded
  assert.equal(aging[0].days > aging[1].days, true);
  assert.equal(aging[0].isStale, true); // ~80 days
  assert.equal(aging[1].isStale, false); // ~19 days
});
