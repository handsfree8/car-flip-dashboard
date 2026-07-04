# Inventory Dashboard Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the car-flip dashboard search/filter/sort on the vehicle grid, a reorganized detail form, and a new Reports tab, while extracting the money/business logic out of `App.jsx` into a tested library module.

**Architecture:** `App.jsx` becomes a thin orchestrator holding Supabase state and a two-tab layout (Inventario / Reportes). All money/date business logic moves to `src/lib/carCalculations.js` (pure, unit-tested with Node's built-in test runner). CSV export lives in `src/lib/exportCsv.js`. The grid, the detail form, the KPI cards, and the new reports view each become their own component under `src/components/`.

**Tech Stack:** React 19 + Vite, Tailwind CSS, framer-motion, lucide-react icons, Supabase JS client. No new dependencies. Tests use Node's built-in `node:test` + `node:assert/strict` (Node v26 is installed, no framework needed).

## Global Constraints

- No changes to the Supabase schema — the `cars` table keeps its `id` / `data` / `created_at` shape.
- No new npm dependencies.
- No router — tab switching is local React state.
- No automated tests for React components (no test-renderer installed); verify components via `npx eslint <file>` after creation and via full manual browser QA in the final task, per the design spec's Verification section.
- Pure logic in `src/lib/` gets real `node:test` unit tests (this is the one place classic TDD applies in this plan).
- Spanish UI copy stays Spanish where it already is; new UI copy should match the existing bilingual style of the app (labels in English, a few sentences in Spanish), consistent with current `App.jsx` content.

---

### Task 1: `src/lib/carCalculations.js` — extract + add business logic, with tests

**Files:**
- Create: `src/lib/carCalculations.js`
- Test: `src/lib/carCalculations.test.js`
- Modify: `package.json` (add a `test` script)

**Interfaces:**
- Produces (consumed by later tasks): `emptyCar` (object), `money(value) -> string`, `numberValue(value) -> number`, `COST_FIELDS` (array of `{ key, label }`), `getInvestment(car) -> number`, `isSold(car) -> boolean`, `getEstimatedValue(car) -> number`, `getExpectedSaleValue(car) -> number`, `getCollectedSoFar(car) -> number`, `getBalanceRemaining(car) -> number`, `getExpectedProfit(car) -> number`, `getInventoryEquity(car) -> number`, `getCollectedProfit(car) -> number`, `getBreakEvenPayment(car) -> number | "N/A"`, `rowToCar(row) -> car`, `getDaysInInventory(car, referenceDate = new Date()) -> number | null`, `getPaymentStatus(car, referenceDate = new Date()) -> { isOverdue, paymentsBehind, amountOverdue }`, `getCostBreakdown(cars) -> [{ key, label, total, average }]`, `getProfitByMonth(cars) -> [{ month, label, profit }]`, `getAgingInventory(cars, thresholdDays = 45, referenceDate = new Date()) -> [{ car, days, isStale }]`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/carCalculations.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  money,
  numberValue,
  getInvestment,
  isSold,
  getEstimatedValue,
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
```

- [ ] **Step 2: Add the test script to `package.json`**

Modify `package.json` — add to `"scripts"`:

```json
    "test": "node --test src/lib"
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './carCalculations.js'`

- [ ] **Step 4: Write the implementation**

Create `src/lib/carCalculations.js`:

```javascript
export const emptyCar = {
  id: null,
  model: "",
  year: "",
  photo: "",
  status: "available",
  estimatedMarketValue: "",
  askingPrice: "",
  saleType: "cash",
  auctionPrice: "",
  repairCost: "",
  adminFees: "",
  transportCost: "",
  partsCost: "",
  detailingCost: "",
  titleFees: "",
  taxes: "",
  advertisingCost: "",
  miscCost: "",
  soldPrice: "",
  purchaseDate: "",
  soldDate: "",
  downPayment: "",
  monthlyPayment: "",
  numberOfPayments: "",
  paymentsReceived: "",
  paymentStartDate: "",
  lateFeesCollected: "",
  repoCost: "",
  financingNotes: "",
  notes: "",
};

export const COST_FIELDS = [
  { key: "auctionPrice", label: "Auction Purchase Price" },
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

export function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function numberValue(value) {
  return Number(value || 0);
}

export function getInvestment(car) {
  return COST_FIELDS.reduce((sum, field) => sum + numberValue(car[field.key]), 0);
}

export function isSold(car) {
  return car.status === "sold";
}

export function getEstimatedValue(car) {
  return numberValue(car.estimatedMarketValue || car.askingPrice);
}

export function getExpectedSaleValue(car) {
  if (!isSold(car)) {
    return getEstimatedValue(car);
  }

  if (car.saleType === "finance") {
    return (
      numberValue(car.downPayment) +
      numberValue(car.monthlyPayment) * numberValue(car.numberOfPayments) +
      numberValue(car.lateFeesCollected)
    );
  }
  return numberValue(car.soldPrice);
}

export function getCollectedSoFar(car) {
  if (!isSold(car)) return 0;

  if (car.saleType === "finance") {
    return (
      numberValue(car.downPayment) +
      numberValue(car.monthlyPayment) * numberValue(car.paymentsReceived) +
      numberValue(car.lateFeesCollected)
    );
  }
  return numberValue(car.soldPrice);
}

export function getBalanceRemaining(car) {
  if (!isSold(car)) return 0;
  if (car.saleType !== "finance") return 0;
  return Math.max(getExpectedSaleValue(car) - getCollectedSoFar(car), 0);
}

export function getExpectedProfit(car) {
  return getExpectedSaleValue(car) - getInvestment(car);
}

export function getInventoryEquity(car) {
  if (isSold(car)) return 0;
  return getEstimatedValue(car) - getInvestment(car);
}

export function getCollectedProfit(car) {
  return getCollectedSoFar(car) - getInvestment(car);
}

export function getBreakEvenPayment(car) {
  if (car.saleType !== "finance") return "N/A";
  const monthly = numberValue(car.monthlyPayment);
  const remainingAfterDown = getInvestment(car) - numberValue(car.downPayment);
  if (remainingAfterDown <= 0) return 0;
  if (monthly <= 0) return "N/A";
  return Math.ceil(remainingAfterDown / monthly);
}

export function rowToCar(row) {
  return { ...emptyCar, ...row.data, id: row.id };
}

function daysBetween(start, end) {
  const diffMs = end.getTime() - start.getTime();
  return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
}

export function getDaysInInventory(car, referenceDate = new Date()) {
  if (!car.purchaseDate) return null;
  const start = new Date(car.purchaseDate);
  if (Number.isNaN(start.getTime())) return null;

  const end = isSold(car) && car.soldDate ? new Date(car.soldDate) : referenceDate;
  if (Number.isNaN(end.getTime())) return null;

  return daysBetween(start, end);
}

const NOT_OVERDUE = { isOverdue: false, paymentsBehind: 0, amountOverdue: 0 };

export function getPaymentStatus(car, referenceDate = new Date()) {
  if (!isSold(car) || car.saleType !== "finance") return NOT_OVERDUE;
  if (!car.paymentStartDate) return NOT_OVERDUE;

  const start = new Date(car.paymentStartDate);
  if (Number.isNaN(start.getTime())) return NOT_OVERDUE;

  const monthly = numberValue(car.monthlyPayment);
  const totalPayments = numberValue(car.numberOfPayments);
  if (monthly <= 0 || totalPayments <= 0) return NOT_OVERDUE;

  const monthsElapsed =
    (referenceDate.getFullYear() - start.getFullYear()) * 12 +
    (referenceDate.getMonth() - start.getMonth()) +
    (referenceDate.getDate() >= start.getDate() ? 1 : 0);

  const expectedPayments = Math.min(Math.max(monthsElapsed, 0), totalPayments);
  const received = numberValue(car.paymentsReceived);
  const paymentsBehind = Math.max(expectedPayments - received, 0);

  if (paymentsBehind <= 0) return NOT_OVERDUE;

  return {
    isOverdue: true,
    paymentsBehind,
    amountOverdue: paymentsBehind * monthly,
  };
}

export function getCostBreakdown(cars) {
  return COST_FIELDS.map((field) => {
    const total = cars.reduce((sum, car) => sum + numberValue(car[field.key]), 0);
    const average = cars.length > 0 ? total / cars.length : 0;
    return { key: field.key, label: field.label, total, average };
  });
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function getProfitByMonth(cars) {
  const totals = new Map();

  cars.forEach((car) => {
    if (!isSold(car) || !car.soldDate) return;
    const date = new Date(car.soldDate);
    if (Number.isNaN(date.getTime())) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    totals.set(key, (totals.get(key) || 0) + getExpectedProfit(car));
  });

  return Array.from(totals.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, profit]) => ({ month, label: formatMonthLabel(month), profit }));
}

export function getAgingInventory(cars, thresholdDays = 45, referenceDate = new Date()) {
  return cars
    .filter((car) => !isSold(car))
    .map((car) => ({ car, days: getDaysInInventory(car, referenceDate) }))
    .filter((entry) => entry.days !== null)
    .sort((a, b) => b.days - a.days)
    .map((entry) => ({ ...entry, isStale: entry.days > thresholdDays }));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green, e.g. `# pass 21` (exact count may vary slightly, 0 failures required).

- [ ] **Step 6: Commit**

```bash
git add src/lib/carCalculations.js src/lib/carCalculations.test.js package.json
git commit -m "feat: extract car calculation logic into tested lib module"
```

---

### Task 2: Remove debug `console.log` from `src/lib/supabase.js`

**Files:**
- Modify: `src/lib/supabase.js`

**Interfaces:** none (no exported behavior changes).

- [ ] **Step 1: Remove the leaking debug line**

In `src/lib/supabase.js`, delete this line (it logs Supabase URL/key to the browser console on every load):

```javascript
console.log(import.meta.env);
```

The file should read:

```javascript
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

- [ ] **Step 2: Verify with lint**

Run: `npx eslint src/lib/supabase.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.js
git commit -m "fix: stop logging env config to the browser console"
```

---

### Task 3: `src/lib/exportCsv.js` — CSV export, with tests

**Files:**
- Create: `src/lib/exportCsv.js`
- Test: `src/lib/exportCsv.test.js`

**Interfaces:**
- Consumes from Task 1: `getInvestment`, `getExpectedSaleValue`, `getCollectedSoFar`, `getBalanceRemaining`, `getExpectedProfit`, `getCollectedProfit`, `getDaysInInventory` (all from `./carCalculations.js`).
- Produces: `carsToCsv(cars) -> string`, `downloadCarsCsv(cars, filename = "inventory.csv") -> void`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/exportCsv.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './exportCsv.js'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/exportCsv.js`:

```javascript
import {
  getInvestment,
  getExpectedSaleValue,
  getCollectedSoFar,
  getBalanceRemaining,
  getExpectedProfit,
  getCollectedProfit,
  getDaysInInventory,
} from "./carCalculations.js";

const HEADERS = [
  "Model",
  "Year",
  "Status",
  "Sale Type",
  "Purchase Date",
  "Sold Date",
  "Investment",
  "Expected Sale Value",
  "Collected So Far",
  "Balance Remaining",
  "Expected Profit",
  "Collected Profit",
  "Days In Inventory",
];

function escapeCell(value) {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function carRow(car) {
  return [
    car.model || "",
    car.year || "",
    car.status || "",
    car.saleType || "",
    car.purchaseDate || "",
    car.soldDate || "",
    getInvestment(car),
    getExpectedSaleValue(car),
    getCollectedSoFar(car),
    getBalanceRemaining(car),
    getExpectedProfit(car),
    getCollectedProfit(car),
    getDaysInInventory(car) ?? "",
  ];
}

export function carsToCsv(cars) {
  const rows = [HEADERS, ...cars.map(carRow)];
  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadCarsCsv(cars, filename = "inventory.csv") {
  const csv = carsToCsv(cars);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all tests green, no failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportCsv.js src/lib/exportCsv.test.js
git commit -m "feat: add CSV export for the vehicle inventory"
```

---

### Task 4: `src/components/SummaryCards.jsx` — extract the KPI cards

**Files:**
- Create: `src/components/SummaryCards.jsx`

**Interfaces:**
- Consumes: `Card`, `CardContent` from `@/components/ui/card`; `money` from `@/lib/carCalculations` (Task 1).
- Produces: default export `SummaryCards({ summary })` where `summary` has shape `{ cars, financedCars, availableCars, invested, expected, collected, balance, expectedProfit, collectedProfit }` (matches the `summary` object already computed in `App.jsx`'s `useMemo`, unchanged).

- [ ] **Step 1: Create the component**

Create `src/components/SummaryCards.jsx`:

```jsx
import { Car, DollarSign, CreditCard, CalendarDays, FileText, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { money } from "@/lib/carCalculations";

export default function SummaryCards({ summary }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
      <SummaryCard title="Cars" value={summary.cars} icon={<Car />} />
      <SummaryCard title="Invested" value={money(summary.invested)} icon={<DollarSign />} />
      <SummaryCard title="Collected" value={money(summary.collected)} icon={<CreditCard />} />
      <SummaryCard title="Balance Pending" value={money(summary.balance)} icon={<CalendarDays />} />
      <SummaryCard title="Expected Revenue" value={money(summary.expected)} icon={<FileText />} />
      <SummaryCard
        title="Expected Profit"
        value={money(summary.expectedProfit)}
        icon={<Wrench />}
        highlight={summary.expectedProfit >= 0}
      />
      <SummaryCard
        title="Profit Collected"
        value={money(summary.collectedProfit)}
        icon={<DollarSign />}
        highlight={summary.collectedProfit >= 0}
      />
      <SummaryCard title="Financed Cars" value={summary.financedCars} icon={<CreditCard />} />
      <SummaryCard title="Available Cars" value={summary.availableCars} icon={<Car />} />
    </section>
  );
}

function SummaryCard({ title, value, icon, highlight }) {
  return (
    <Card className="rounded-3xl border border-purple-100 bg-white shadow-md">
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div className="rounded-2xl bg-[#efe6f8] p-3 text-[#5b2a86] [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#7d3fb2]">{title}</p>
          <p
            className={`break-words text-xl font-black sm:text-2xl ${
              highlight === true ? "text-emerald-600" : highlight === false ? "text-red-600" : "text-[#221433]"
            }`}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify with lint**

Run: `npx eslint src/components/SummaryCards.jsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SummaryCards.jsx
git commit -m "refactor: extract SummaryCards component"
```

---

### Task 5: `src/components/VehicleGrid.jsx` — search, filter, sort, aging/overdue badges

**Files:**
- Create: `src/components/VehicleGrid.jsx`

**Interfaces:**
- Consumes from Task 1 (`@/lib/carCalculations`): `money`, `getExpectedProfit`, `getInventoryEquity`, `getBalanceRemaining`, `getDaysInInventory`, `getPaymentStatus`.
- Consumes: `motion` from `framer-motion`, icons `Car`, `ImagePlus` from `lucide-react`.
- Produces: default export `VehicleGrid({ cars, selectedCarId, onSelectCar })`.

- [ ] **Step 1: Create the component**

Create `src/components/VehicleGrid.jsx`:

```jsx
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Car, ImagePlus } from "lucide-react";
import {
  money,
  getExpectedProfit,
  getInventoryEquity,
  getBalanceRemaining,
  getDaysInInventory,
  getPaymentStatus,
} from "@/lib/carCalculations";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "available", label: "Available" },
  { value: "listed", label: "Listed" },
  { value: "sold", label: "Sold" },
];

const SALE_TYPE_OPTIONS = [
  { value: "all", label: "All Sale Types" },
  { value: "cash", label: "Cash" },
  { value: "finance", label: "Credit" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "year", label: "Year" },
  { value: "profit", label: "Profit (High to Low)" },
  { value: "aging", label: "Days In Inventory" },
];

function matchesSearch(car, query) {
  if (!query) return true;
  const haystack = `${car.model || ""} ${car.year || ""}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sortCars(cars, sortBy) {
  const sorted = [...cars];
  if (sortBy === "year") {
    return sorted.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  }
  if (sortBy === "profit") {
    return sorted.sort((a, b) => {
      const profitA = a.status === "sold" ? getExpectedProfit(a) : getInventoryEquity(a);
      const profitB = b.status === "sold" ? getExpectedProfit(b) : getInventoryEquity(b);
      return profitB - profitA;
    });
  }
  if (sortBy === "aging") {
    return sorted.sort((a, b) => (getDaysInInventory(b) ?? -1) - (getDaysInInventory(a) ?? -1));
  }
  return sorted; // "recent" — keep incoming (Supabase created_at desc) order
}

export default function VehicleGrid({ cars, selectedCarId, onSelectCar }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saleTypeFilter, setSaleTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  const visibleCars = useMemo(() => {
    const filtered = cars.filter((car) => {
      if (statusFilter !== "all" && car.status !== statusFilter) return false;
      if (saleTypeFilter !== "all" && car.saleType !== saleTypeFilter) return false;
      return matchesSearch(car, search);
    });
    return sortCars(filtered, sortBy);
  }, [cars, search, statusFilter, saleTypeFilter, sortBy]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search model or year..."
          className="min-w-0 flex-1 rounded-2xl border border-purple-100 bg-white px-4 py-2 text-sm font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-2xl border border-purple-100 bg-white px-3 py-2 text-sm font-semibold text-[#221433] outline-none focus:border-[#7d3fb2]"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={saleTypeFilter}
          onChange={(event) => setSaleTypeFilter(event.target.value)}
          className="rounded-2xl border border-purple-100 bg-white px-3 py-2 text-sm font-semibold text-[#221433] outline-none focus:border-[#7d3fb2]"
        >
          {SALE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          className="rounded-2xl border border-purple-100 bg-white px-3 py-2 text-sm font-semibold text-[#221433] outline-none focus:border-[#7d3fb2]"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {cars.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-purple-200 p-8 text-center text-[#5b2a86]">
          <Car className="mx-auto mb-3 h-10 w-10" />
          <p className="font-bold">No cars yet</p>
          <p className="text-sm">Click Add Vehicle para empezar.</p>
        </div>
      ) : visibleCars.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-purple-200 p-8 text-center text-[#5b2a86]">
          <Car className="mx-auto mb-3 h-10 w-10" />
          <p className="font-bold">No hay carros que coincidan con el filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          {visibleCars.map((car) => {
            const days = getDaysInInventory(car);
            const paymentStatus = getPaymentStatus(car);
            return (
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                key={car.id}
                onClick={() => onSelectCar(car)}
                className={`overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition ${
                  selectedCarId === car.id
                    ? "border-[#5b2a86] ring-4 ring-purple-100"
                    : "border-purple-100 hover:border-[#7d3fb2]"
                }`}
              >
                <div className="aspect-[4/3] bg-[#efe6f8]">
                  {car.photo ? (
                    <img src={car.photo} alt={car.model || "Car"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#7d3fb2]">
                      <ImagePlus className="h-9 w-9" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 font-black text-[#221433]">
                    {car.year} {car.model || "Untitled Vehicle"}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase text-[#7d3fb2]">
                    {car.status === "sold" ? (car.saleType === "finance" ? "Credit Sale" : "Cash Sale") : "Available / Not Sold"}
                  </p>
                  <p
                    className={`mt-1 text-sm font-black ${
                      getExpectedProfit(car) >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {money(car.status === "sold" ? getExpectedProfit(car) : getInventoryEquity(car))}{" "}
                    {car.status === "sold" ? "expected" : "estimated equity"}
                  </p>
                  {car.saleType === "finance" && car.status === "sold" && (
                    <p className="text-xs text-slate-500">{money(getBalanceRemaining(car))} balance</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {car.status !== "sold" && days !== null && (
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-[#5b2a86]">
                        {days}d in inventory
                      </span>
                    )}
                    {paymentStatus.isOverdue && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        Atrasado · {paymentStatus.paymentsBehind} pago(s)
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify with lint**

Run: `npx eslint src/components/VehicleGrid.jsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/VehicleGrid.jsx
git commit -m "feat: add search/filter/sort and aging/overdue badges to vehicle grid"
```

---

### Task 6: `src/components/VehicleForm.jsx` — reorganize detail form into sub-tabs

**Files:**
- Create: `src/components/VehicleForm.jsx`

**Interfaces:**
- Consumes from Task 1: `money`, `getInvestment`, `getEstimatedValue`, `getInventoryEquity` (from `@/lib/carCalculations`).
- Consumes: `Button` from `@/components/ui/button`.
- Produces: default export `VehicleForm({ form, formTotals, onChange, onSave, onDelete, saving })` where:
  - `form` is a car object (same shape as `emptyCar`).
  - `formTotals` is `{ investment, expected, collected, balance, expectedProfit, collectedProfit, breakEvenPayment, roi }` (same shape App.jsx already computes today).
  - `onChange(field, value)` updates a single form field.
  - `onSave()` / `onDelete()` are called with no arguments.
  - `saving` is a boolean disabling the action buttons.

- [ ] **Step 1: Create the component**

Create `src/components/VehicleForm.jsx`:

```jsx
import { useRef, useState } from "react";
import { Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, getInvestment, getEstimatedValue, getInventoryEquity } from "@/lib/carCalculations";

const SUB_TABS = [
  { value: "info", label: "Info" },
  { value: "costs", label: "Costos" },
  { value: "sale", label: "Venta / Financiamiento" },
  { value: "notes", label: "Notas" },
];

export default function VehicleForm({ form, formTotals, onChange, onSave, onDelete, saving }) {
  const [activeSubTab, setActiveSubTab] = useState("info");
  const fileInputRef = useRef(null);

  function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      onChange("photo", reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-start">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-48 w-full overflow-hidden rounded-3xl border-2 border-dashed border-purple-200 bg-[#efe6f8] sm:h-56 md:h-44 md:w-56 md:flex-none"
        >
          {form.photo ? (
            <img src={form.photo} alt="Vehicle" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-[#5b2a86]">
              <Upload className="mb-2 h-8 w-8" />
              <span className="text-sm font-bold">Upload Image</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-[#3b1b6d]/85 p-2 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
            Click to change image
          </div>
        </button>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase text-[#7d3fb2]">Vehicle Details</p>
          <h2 className="break-words text-2xl font-black text-[#3b1b6d] sm:text-3xl">
            {form.year} {form.model || "New Vehicle"}
          </h2>
          <p
            className={`mt-2 text-lg font-black sm:text-xl ${
              formTotals.expectedProfit >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            Expected Profit: {money(formTotals.expectedProfit)}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <MiniTotal title="Investment" value={money(formTotals.investment)} />
        <MiniTotal title="Collected" value={money(formTotals.collected)} />
        <MiniTotal title="Balance" value={money(formTotals.balance)} />
        <MiniTotal title="ROI" value={`${formTotals.roi.toFixed(1)}%`} />
      </section>

      <div className="flex flex-wrap gap-2 border-b border-purple-100 pb-2">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveSubTab(tab.value)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              activeSubTab === tab.value
                ? "bg-[#5b2a86] text-white"
                : "bg-[#efe6f8] text-[#5b2a86] hover:bg-purple-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === "info" && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          <Input label="Model" value={form.model} onChange={(v) => onChange("model", v)} />
          <Input label="Year" value={form.year} onChange={(v) => onChange("year", v)} />
          <Input label="Purchase Date" type="date" value={form.purchaseDate} onChange={(v) => onChange("purchaseDate", v)} />
          <Input label="Sold Date" type="date" value={form.soldDate} onChange={(v) => onChange("soldDate", v)} />
          <StatusSelect label="Vehicle Status" value={form.status} onChange={(v) => onChange("status", v)} />
          <Select label="Sale Type" value={form.saleType} onChange={(v) => onChange("saleType", v)} />
          {form.status !== "sold" && (
            <>
              <Input
                label="Estimated Market Value"
                type="number"
                value={form.estimatedMarketValue}
                onChange={(v) => onChange("estimatedMarketValue", v)}
              />
              <Input label="Asking Price / List Price" type="number" value={form.askingPrice} onChange={(v) => onChange("askingPrice", v)} />
            </>
          )}
        </section>
      )}

      {activeSubTab === "costs" && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
            <Input label="Auction Purchase Price" type="number" value={form.auctionPrice} onChange={(v) => onChange("auctionPrice", v)} />
            <Input label="Repairs / Labor" type="number" value={form.repairCost} onChange={(v) => onChange("repairCost", v)} />
            <Input label="Parts" type="number" value={form.partsCost} onChange={(v) => onChange("partsCost", v)} />
            <Input label="Transport / Tow" type="number" value={form.transportCost} onChange={(v) => onChange("transportCost", v)} />
            <Input label="Admin / Auction Fees" type="number" value={form.adminFees} onChange={(v) => onChange("adminFees", v)} />
            <Input label="Title / Registration" type="number" value={form.titleFees} onChange={(v) => onChange("titleFees", v)} />
            <Input label="Taxes" type="number" value={form.taxes} onChange={(v) => onChange("taxes", v)} />
            <Input label="Detailing / Cleaning" type="number" value={form.detailingCost} onChange={(v) => onChange("detailingCost", v)} />
            <Input label="Ads / Marketplace" type="number" value={form.advertisingCost} onChange={(v) => onChange("advertisingCost", v)} />
            <Input label="Repo / Recovery Cost" type="number" value={form.repoCost} onChange={(v) => onChange("repoCost", v)} />
            <Input label="Miscellaneous" type="number" value={form.miscCost} onChange={(v) => onChange("miscCost", v)} />
          </section>
          {form.status !== "sold" && (
            <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
              <MiniTotal title="Money Invested" value={money(getInvestment(form))} />
              <MiniTotal title="Estimated Value" value={money(getEstimatedValue(form))} />
              <MiniTotal title="Estimated Equity" value={money(getInventoryEquity(form))} />
            </section>
          )}
        </>
      )}

      {activeSubTab === "sale" && (
        <>
          {form.status !== "sold" ? (
            <p className="rounded-3xl bg-[#f7f4fb] p-4 text-sm text-[#5b2a86]">
              Este vehículo aún no está vendido. Cambia el estatus a "Sold" en la pestaña Info para capturar los datos de venta.
            </p>
          ) : form.saleType === "cash" ? (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
              <Input label="Sold Price" type="number" value={form.soldPrice} onChange={(v) => onChange("soldPrice", v)} />
              <MiniTotal title="Cash Profit" value={money(formTotals.expectedProfit)} />
            </section>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
                <Input label="Down Payment" type="number" value={form.downPayment} onChange={(v) => onChange("downPayment", v)} />
                <Input label="Monthly Payment" type="number" value={form.monthlyPayment} onChange={(v) => onChange("monthlyPayment", v)} />
                <Input label="Number of Payments" type="number" value={form.numberOfPayments} onChange={(v) => onChange("numberOfPayments", v)} />
                <Input label="Payments Received" type="number" value={form.paymentsReceived} onChange={(v) => onChange("paymentsReceived", v)} />
                <Input label="Payment Start Date" type="date" value={form.paymentStartDate} onChange={(v) => onChange("paymentStartDate", v)} />
                <Input label="Late Fees Collected" type="number" value={form.lateFeesCollected} onChange={(v) => onChange("lateFeesCollected", v)} />
              </section>

              <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                <MiniTotal title="Total Contract" value={money(formTotals.expected)} />
                <MiniTotal title="Balance Remaining" value={money(formTotals.balance)} />
                <MiniTotal title="Break Even Payment #" value={formTotals.breakEvenPayment} />
                <MiniTotal title="Profit If Fully Paid" value={money(formTotals.expectedProfit)} />
                <MiniTotal title="Profit Today" value={money(formTotals.collectedProfit)} />
              </section>

              <div className="mt-4">
                <Textarea label="Financing Notes" value={form.financingNotes} onChange={(v) => onChange("financingNotes", v)} />
              </div>
            </>
          )}
        </>
      )}

      {activeSubTab === "notes" && <Textarea label="General Notes" value={form.notes} onChange={(v) => onChange("notes", v)} />}

      <section className="sticky bottom-2 z-10 flex flex-col gap-3 rounded-3xl border border-purple-100 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row">
        <Button disabled={saving} onClick={onSave} className="rounded-2xl bg-[#5b2a86] py-6 text-base font-bold hover:bg-[#3b1b6d] disabled:opacity-60">
          <Save className="mr-2 h-5 w-5" /> {saving ? "Saving..." : "Save Vehicle"}
        </Button>
        <Button
          disabled={saving}
          onClick={onDelete}
          variant="outline"
          className="rounded-2xl border-red-200 py-6 text-base font-bold text-red-600 hover:text-red-700 disabled:opacity-60"
        >
          <Trash2 className="mr-2 h-5 w-5" /> Delete
        </Button>
      </section>
    </div>
  );
}

function MiniTotal({ title, value }) {
  return (
    <div className="rounded-3xl bg-[#efe6f8] p-4">
      <p className="text-sm font-bold text-[#7d3fb2]">{title}</p>
      <p className="mt-1 break-words text-lg font-black text-[#3b1b6d] sm:text-xl">{value}</p>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-[#7d3fb2]">{label}</label>
      <input
        type={type}
        value={value}
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-base font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100 md:text-sm"
      />
    </div>
  );
}

function Select({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-[#7d3fb2]">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-base font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100 md:text-sm"
      >
        <option value="cash">Cash Sale</option>
        <option value="finance">Credit / Monthly Payments</option>
      </select>
    </div>
  );
}

function StatusSelect({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-[#7d3fb2]">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-purple-100 bg-white px-4 py-3 text-base font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100 md:text-sm"
      >
        <option value="available">Available / Not Sold Yet</option>
        <option value="listed">Listed For Sale</option>
        <option value="sold">Sold</option>
      </select>
    </div>
  );
}

function Textarea({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-[#7d3fb2]">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 w-full resize-none rounded-2xl border border-purple-100 bg-white px-4 py-3 text-base font-semibold text-[#221433] outline-none transition focus:border-[#7d3fb2] focus:ring-4 focus:ring-purple-100 md:text-sm"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify with lint**

Run: `npx eslint src/components/VehicleForm.jsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/VehicleForm.jsx
git commit -m "refactor: reorganize vehicle detail form into sub-tabs"
```

---

### Task 7: `src/components/ReportsPanel.jsx` — new Reports tab

**Files:**
- Create: `src/components/ReportsPanel.jsx`

**Interfaces:**
- Consumes from Task 1: `money`, `getCostBreakdown`, `getProfitByMonth`, `getAgingInventory`, `getPaymentStatus`, `getBalanceRemaining` (from `@/lib/carCalculations`).
- Consumes from Task 3: `downloadCarsCsv` (from `@/lib/exportCsv`).
- Consumes: `Button` from `@/components/ui/button`, icon `Download` from `lucide-react`.
- Produces: default export `ReportsPanel({ cars })`.

- [ ] **Step 1: Create the component**

Create `src/components/ReportsPanel.jsx`:

```jsx
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  money,
  getCostBreakdown,
  getProfitByMonth,
  getAgingInventory,
  getPaymentStatus,
  getBalanceRemaining,
} from "@/lib/carCalculations";
import { downloadCarsCsv } from "@/lib/exportCsv";

export default function ReportsPanel({ cars }) {
  const costBreakdown = getCostBreakdown(cars);
  const profitByMonth = getProfitByMonth(cars);
  const aging = getAgingInventory(cars);
  const overdue = cars.filter((car) => getPaymentStatus(car).isOverdue);

  const maxCost = Math.max(1, ...costBreakdown.map((row) => row.total));
  const maxProfit = Math.max(1, ...profitByMonth.map((row) => Math.abs(row.profit)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-[#3b1b6d]">Reportes</h2>
        <Button
          onClick={() => downloadCarsCsv(cars)}
          className="rounded-2xl bg-[#5b2a86] px-4 py-5 text-sm font-bold text-white hover:bg-[#3b1b6d]"
        >
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <section className="rounded-3xl border border-purple-100 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Desglose de Costos (Total)</h3>
        <div className="space-y-2">
          {costBreakdown.map((row) => (
            <div key={row.key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-xs font-bold text-[#5b2a86]">{row.label}</span>
              <div className="h-3 flex-1 rounded-full bg-[#f7f4fb]">
                <div
                  className="h-3 rounded-full bg-[#7d3fb2]"
                  style={{ width: `${(row.total / maxCost) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs font-bold text-[#221433]">{money(row.total)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-purple-100 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Ganancia por Mes</h3>
        {profitByMonth.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">Aún no hay carros vendidos.</p>
        ) : (
          <div className="flex items-end gap-3 overflow-x-auto pb-2">
            {profitByMonth.map((row) => (
              <div key={row.month} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-lg ${row.profit >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                  style={{ height: `${Math.max((Math.abs(row.profit) / maxProfit) * 120, 4)}px` }}
                />
                <span className="text-[10px] font-bold text-[#5b2a86]">{row.label}</span>
                <span className="text-[10px] font-bold text-[#221433]">{money(row.profit)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-purple-100 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Inventario Envejecido</h3>
        {aging.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">No hay carros disponibles en inventario.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase text-[#7d3fb2]">
                <th className="pb-2">Vehicle</th>
                <th className="pb-2">Days</th>
              </tr>
            </thead>
            <tbody>
              {aging.map(({ car, days, isStale }) => (
                <tr key={car.id} className={isStale ? "text-red-600" : "text-[#221433]"}>
                  <td className="py-1 font-bold">
                    {car.year} {car.model || "Untitled Vehicle"}
                  </td>
                  <td className="py-1 font-bold">{days}d{isStale ? " · Stale" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-3xl border border-purple-100 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Pagos Atrasados</h3>
        {overdue.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">No hay pagos atrasados.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase text-[#7d3fb2]">
                <th className="pb-2">Vehicle</th>
                <th className="pb-2">Pagos Atrasados</th>
                <th className="pb-2">Monto Atrasado</th>
                <th className="pb-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((car) => {
                const status = getPaymentStatus(car);
                return (
                  <tr key={car.id} className="text-red-600">
                    <td className="py-1 font-bold">
                      {car.year} {car.model || "Untitled Vehicle"}
                    </td>
                    <td className="py-1 font-bold">{status.paymentsBehind}</td>
                    <td className="py-1 font-bold">{money(status.amountOverdue)}</td>
                    <td className="py-1 font-bold">{money(getBalanceRemaining(car))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify with lint**

Run: `npx eslint src/components/ReportsPanel.jsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReportsPanel.jsx
git commit -m "feat: add Reports tab with cost breakdown, profit by month, aging, and overdue payments"
```

---

### Task 8: Rewrite `src/App.jsx` as the orchestrator

**Files:**
- Modify: `src/App.jsx` (full rewrite)

**Interfaces:**
- Consumes: everything produced in Tasks 1, 4, 5, 6, 7 — `emptyCar`, `rowToCar`, `getInvestment`, `getExpectedSaleValue`, `getCollectedSoFar`, `getBalanceRemaining`, `getExpectedProfit`, `getBreakEvenPayment` from `@/lib/carCalculations`; `SummaryCards` from `@/components/SummaryCards`; `VehicleGrid` from `@/components/VehicleGrid`; `VehicleForm` from `@/components/VehicleForm`; `ReportsPanel` from `@/components/ReportsPanel`.
- Produces: default export `CarSalesInventoryDashboard()` (unchanged export name/shape, so `main.jsx` doesn't need to change).

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/App.jsx` with:

```jsx
import { useEffect, useMemo, useState } from "react";
import { Plus, Cloud, RefreshCw, Car } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  emptyCar,
  rowToCar,
  getInvestment,
  getExpectedSaleValue,
  getCollectedSoFar,
  getBalanceRemaining,
  getExpectedProfit,
  getBreakEvenPayment,
} from "@/lib/carCalculations";
import SummaryCards from "@/components/SummaryCards";
import VehicleGrid from "@/components/VehicleGrid";
import VehicleForm from "@/components/VehicleForm";
import ReportsPanel from "@/components/ReportsPanel";

const TABS = [
  { value: "inventory", label: "Inventario" },
  { value: "reports", label: "Reportes" },
];

export default function CarSalesInventoryDashboard() {
  const [cars, setCars] = useState([]);
  const [selectedCarId, setSelectedCarId] = useState(null);
  const [form, setForm] = useState(emptyCar);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");

  useEffect(() => {
    loadCarsFromSupabase();
  }, []);

  async function loadCarsFromSupabase() {
    setLoading(true);
    setStatus("Loading from Supabase...");

    const { data, error } = await supabase
      .from("cars")
      .select("id, data, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`Supabase error: ${error.message}`);
      setLoading(false);
      return;
    }

    setCars((data || []).map(rowToCar));
    setStatus("Synced with Supabase");
    setLoading(false);
  }

  const formTotals = useMemo(() => {
    const investment = getInvestment(form);
    const expected = getExpectedSaleValue(form);
    const collected = getCollectedSoFar(form);
    const expectedProfit = expected - investment;
    const collectedProfit = collected - investment;
    const roi = investment > 0 ? (expectedProfit / investment) * 100 : 0;

    return {
      investment,
      expected,
      collected,
      balance: getBalanceRemaining(form),
      expectedProfit,
      collectedProfit,
      breakEvenPayment: getBreakEvenPayment(form),
      roi,
    };
  }, [form]);

  const summary = useMemo(() => {
    const invested = cars.reduce((sum, car) => sum + getInvestment(car), 0);
    const expected = cars.reduce((sum, car) => sum + getExpectedSaleValue(car), 0);
    const collected = cars.reduce((sum, car) => sum + getCollectedSoFar(car), 0);
    const balance = cars.reduce((sum, car) => sum + getBalanceRemaining(car), 0);

    return {
      cars: cars.length,
      financedCars: cars.filter((car) => car.status === "sold" && car.saleType === "finance").length,
      availableCars: cars.filter((car) => car.status !== "sold").length,
      invested,
      expected,
      collected,
      balance,
      expectedProfit: expected - invested,
      collectedProfit: collected - invested,
    };
  }, [cars]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleNewCar() {
    setSelectedCarId("new");
    setForm({ ...emptyCar, id: null });
    setStatus("New vehicle ready");
    setActiveTab("inventory");
  }

  function handleSelectCar(car) {
    setSelectedCarId(car.id);
    setForm(car);
  }

  async function handleSave() {
    setSaving(true);
    setStatus("Saving to Supabase...");

    const { id, ...carData } = form;

    if (!id) {
      const { data, error } = await supabase
        .from("cars")
        .insert([{ data: carData }])
        .select("id, data, created_at")
        .single();

      if (error) {
        setStatus(`Save error: ${error.message}`);
        setSaving(false);
        return;
      }

      const savedCar = rowToCar(data);
      setCars((prev) => [savedCar, ...prev]);
      setForm(savedCar);
      setSelectedCarId(savedCar.id);
      setStatus("Vehicle saved to Supabase");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("cars")
      .update({ data: carData })
      .eq("id", id)
      .select("id, data, created_at")
      .single();

    if (error) {
      setStatus(`Update error: ${error.message}`);
      setSaving(false);
      return;
    }

    const updatedCar = rowToCar(data);
    setCars((prev) => prev.map((car) => (car.id === updatedCar.id ? updatedCar : car)));
    setForm(updatedCar);
    setStatus("Vehicle updated in Supabase");
    setSaving(false);
  }

  async function handleDelete() {
    if (!form.id) {
      setSelectedCarId(null);
      setForm(emptyCar);
      return;
    }

    setSaving(true);
    setStatus("Deleting from Supabase...");

    const { error } = await supabase.from("cars").delete().eq("id", form.id);

    if (error) {
      setStatus(`Delete error: ${error.message}`);
      setSaving(false);
      return;
    }

    setCars((prev) => prev.filter((car) => car.id !== form.id));
    setSelectedCarId(null);
    setForm(emptyCar);
    setStatus("Vehicle deleted");
    setSaving(false);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f4fb] p-3 text-[#221433] sm:p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#3b1b6d] via-[#5b2a86] to-[#7d3fb2] p-5 text-white shadow-xl sm:p-6 md:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-purple-100">
                <Cloud className="h-4 w-4" /> Rose Legacy Auto Tracker · Supabase Connected
              </p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl md:text-5xl">Inventory & Profit Dashboard</h1>
              <p className="mt-3 max-w-3xl text-sm text-purple-100 sm:text-base">
                Controla carros vendidos cash o a crédito, pagos recibidos, balance pendiente y ganancia real desde la nube.
              </p>
              <p className="mt-2 text-xs font-semibold text-purple-100 sm:text-sm">{loading ? "Loading..." : status}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
              <Button onClick={loadCarsFromSupabase} className="rounded-2xl bg-[#efe6f8] px-5 py-6 text-base font-bold text-[#4b2179] shadow-lg hover:bg-white">
                <RefreshCw className="mr-2 h-5 w-5" /> Refresh
              </Button>
              <Button onClick={handleNewCar} className="rounded-2xl bg-white px-5 py-6 text-base font-bold text-[#4b2179] shadow-lg hover:bg-purple-50">
                <Plus className="mr-2 h-5 w-5" /> Add Vehicle
              </Button>
            </div>
          </div>
        </header>

        <SummaryCards summary={summary} />

        <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-black transition ${
                activeTab === tab.value ? "bg-[#5b2a86] text-white" : "text-[#5b2a86] hover:bg-[#efe6f8]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "inventory" ? (
          <main className="grid gap-4 md:gap-6 xl:grid-cols-[0.9fr_1.4fr]">
            <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
              <CardContent className="p-4 sm:p-5 md:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-black text-[#3b1b6d]">Vehicle Grid</h2>
                  <span className="rounded-full bg-[#efe6f8] px-3 py-1 text-sm font-bold text-[#5b2a86]">{cars.length} cars</span>
                </div>
                <VehicleGrid cars={cars} selectedCarId={selectedCarId} onSelectCar={handleSelectCar} />
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
              <CardContent className="p-4 sm:p-5 md:p-6">
                {!selectedCarId ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl bg-[#f7f4fb] p-8 text-center md:min-h-[520px]">
                    <Car className="mb-4 h-12 w-12 text-[#7d3fb2]" />
                    <h2 className="text-2xl font-black text-[#3b1b6d]">Select or add a vehicle</h2>
                    <p className="mt-2 max-w-sm text-[#5b2a86]">Haz click en un carro del grid o agrega uno nuevo para llenar el formulario.</p>
                  </div>
                ) : (
                  <VehicleForm
                    form={form}
                    formTotals={formTotals}
                    onChange={handleChange}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    saving={saving}
                  />
                )}
              </CardContent>
            </Card>
          </main>
        ) : (
          <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
            <CardContent className="p-4 sm:p-5 md:p-6">
              <ReportsPanel cars={cars} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify with lint and build**

Run: `npx eslint src/App.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (`✓ built in ...`), no type/import errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: rewire App.jsx to orchestrate tabs and extracted components"
```

---

### Task 9: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use the preview tool to start the `dev` script (create `.claude/launch.json` if it doesn't exist, pointing `npm run dev` at the Vite port from `vite.config.js`).

- [ ] **Step 2: Check for console/build errors**

Load the page, check browser console output. Expected: no errors (a Supabase connection error in the status line is acceptable if no `.env` credentials are configured in this environment — that is pre-existing behavior, not something this plan changes).

- [ ] **Step 3: Verify tab switching**

Click "Reportes", confirm the panel renders (empty states if `cars` is empty are fine — "Aún no hay carros vendidos.", "No hay carros disponibles en inventario.", "No hay pagos atrasados."). Click back to "Inventario", confirm the grid + form area returns.

- [ ] **Step 4: Verify the vehicle grid toolbar**

With "Add Vehicle", create 2-3 in-memory vehicles with different `model`, `year`, `status`, and `saleType` values (even if Supabase save fails without credentials, the grid list itself is populated from local `cars` state after a successful insert — if Supabase isn't reachable in this environment, verify the toolbar controls render and change `search`/`statusFilter`/`saleTypeFilter`/`sortBy` state without errors instead, e.g. via the browser console evaluating the rendered `<select>` elements).

- [ ] **Step 5: Verify the form sub-tabs**

Select or create a vehicle, click through Info / Costos / Venta / Notas, confirm each section shows the right fields and typing into a field (e.g. Model) still updates the header title live.

- [ ] **Step 6: Verify CSV export**

On the Reportes tab, click "Exportar CSV" and confirm a file download is triggered (check via `preview_network` or browser download prompt) without a thrown error, even with zero cars (should download a header-only CSV).

- [ ] **Step 7: Record results**

Report to the user which of the above passed, and explicitly flag if Supabase credentials were missing in this environment so full save/delete round-trip testing wasn't possible end-to-end.
