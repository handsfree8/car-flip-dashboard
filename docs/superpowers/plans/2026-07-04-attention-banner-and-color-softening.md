# Attention Banner & Color Softening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group loss/overdue/aging vehicles into one persistent "Necesita Atención" banner, and replace the red used everywhere else in the dashboard (KPIs, vehicle grid, reports) with a calmer amber, so red is reserved exclusively for that banner.

**Architecture:** Two new pure functions in `src/lib/carCalculations.js` (`getCarProfitOrEquity`, `getVehiclesAtLoss`) back a new `src/components/AttentionBanner.jsx`, rendered once in `App.jsx` between the KPI cards and the tab switcher so it's visible on both tabs. Existing red Tailwind classes (`text-red-600`, `bg-red-500`) in `SummaryCards.jsx`, `VehicleGrid.jsx`, and `ReportsPanel.jsx` are swapped to amber (`text-amber-700`, `bg-amber-500`); the banner itself keeps `red-*` classes.

**Tech Stack:** React 19 + Vite, Tailwind CSS (amber palette already available, no config change), plain JS/JSX. No new dependencies.

## Global Constraints

- No changes to the Supabase schema or call shapes.
- No new npm dependencies.
- No router — the banner's expand/collapse is local component state.
- No automated tests for React components (no test-renderer installed) — verify via `npx eslint <file>` after each change and `npm run build` once the file is wired into the running app tree (all four touched components are already imported by `App.jsx` from a prior plan, so `npm run build` is a meaningful check after every task in this plan, not just the last one).
- Pure logic in `src/lib/carCalculations.js` gets real `node:test` unit tests.
- A vehicle can appear in more than one attention category at once (e.g. both "at a loss" and "inventario viejo") — do not deduplicate.
- Red (`red-*` Tailwind classes) may only appear in `AttentionBanner.jsx` after this plan. Everywhere else, replace `text-red-600` → `text-amber-700` and `bg-red-500` → `bg-amber-500`. Green (`emerald-*`) is unchanged.

---

### Task 1: `getCarProfitOrEquity` and `getVehiclesAtLoss` in `carCalculations.js`

**Files:**
- Modify: `src/lib/carCalculations.js` (append after `getAgingInventory`, currently ending at line 219)
- Modify: `src/lib/carCalculations.test.js` (append new tests, add two names to the existing import block at the top)

**Interfaces:**
- Consumes: `isSold`, `getExpectedProfit`, `getInventoryEquity` (already defined in this file).
- Produces (consumed by Task 2 and Task 5): `getCarProfitOrEquity(car) -> number`, `getVehiclesAtLoss(cars) -> [{ car, amount }]` (sorted most-negative first).

- [ ] **Step 1: Write the failing tests**

In `src/lib/carCalculations.test.js`, replace this line in the import block at the top of the file:

```javascript
  getAgingInventory,
  emptyCar,
} from "./carCalculations.js";
```

with:

```javascript
  getAgingInventory,
  getCarProfitOrEquity,
  getVehiclesAtLoss,
  emptyCar,
} from "./carCalculations.js";
```

Then append these two tests at the end of `src/lib/carCalculations.test.js`:

```javascript
test("getCarProfitOrEquity uses expected profit when sold, equity when not", () => {
  const sold = { ...emptyCar, status: "sold", saleType: "cash", soldPrice: "8000", auctionPrice: "5000" };
  assert.equal(getCarProfitOrEquity(sold), 3000);

  const available = { ...emptyCar, status: "available", estimatedMarketValue: "9000", auctionPrice: "6000" };
  assert.equal(getCarProfitOrEquity(available), 3000);
});

test("getVehiclesAtLoss returns only negative entries, worst first", () => {
  const cars = [
    { ...emptyCar, status: "sold", saleType: "cash", soldPrice: "4000", auctionPrice: "5000" }, // -1000
    { ...emptyCar, status: "available", estimatedMarketValue: "1000", auctionPrice: "4000" }, // -3000
    { ...emptyCar, status: "sold", saleType: "cash", soldPrice: "9000", auctionPrice: "5000" }, // +4000, excluded
  ];
  const atLoss = getVehiclesAtLoss(cars);
  assert.equal(atLoss.length, 2);
  assert.equal(atLoss[0].amount, -3000);
  assert.equal(atLoss[1].amount, -1000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `getCarProfitOrEquity is not defined` (or similar `ReferenceError`/import error).

- [ ] **Step 3: Write the implementation**

Append to the end of `src/lib/carCalculations.js`:

```javascript
export function getCarProfitOrEquity(car) {
  return isSold(car) ? getExpectedProfit(car) : getInventoryEquity(car);
}

export function getVehiclesAtLoss(cars) {
  return cars
    .map((car) => ({ car, amount: getCarProfitOrEquity(car) }))
    .filter((entry) => entry.amount < 0)
    .sort((a, b) => a.amount - b.amount);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green (30/30: the 28 existing plus these 2), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/carCalculations.js src/lib/carCalculations.test.js
git commit -m "feat: add getCarProfitOrEquity and getVehiclesAtLoss"
```

---

### Task 2: Dedup `VehicleGrid.jsx` onto `getCarProfitOrEquity` and recolor to amber

**Files:**
- Modify: `src/components/VehicleGrid.jsx`

**Interfaces:**
- Consumes from Task 1: `getCarProfitOrEquity` (from `@/lib/carCalculations`).
- No prop/export changes — `VehicleGrid({ cars, selectedCarId, onSelectCar })` signature is unchanged.

- [ ] **Step 1: Update the import**

In `src/components/VehicleGrid.jsx`, replace this import block:

```javascript
import {
  money,
  getExpectedProfit,
  getInventoryEquity,
  getBalanceRemaining,
  getDaysInInventory,
  getPaymentStatus,
} from "@/lib/carCalculations";
```

with:

```javascript
import {
  money,
  getCarProfitOrEquity,
  getBalanceRemaining,
  getDaysInInventory,
  getPaymentStatus,
} from "@/lib/carCalculations";
```

- [ ] **Step 2: Simplify the "profit" sort comparator**

Replace this block in `sortCars`:

```javascript
  if (sortBy === "profit") {
    return sorted.sort((a, b) => {
      const profitA = a.status === "sold" ? getExpectedProfit(a) : getInventoryEquity(a);
      const profitB = b.status === "sold" ? getExpectedProfit(b) : getInventoryEquity(b);
      return profitB - profitA;
    });
  }
```

with:

```javascript
  if (sortBy === "profit") {
    return sorted.sort((a, b) => getCarProfitOrEquity(b) - getCarProfitOrEquity(a));
  }
```

- [ ] **Step 3: Simplify and recolor the per-card profit line**

Replace this block in the card render:

```jsx
                  <p
                    className={`mt-1 text-sm font-black ${
                      getExpectedProfit(car) >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {money(car.status === "sold" ? getExpectedProfit(car) : getInventoryEquity(car))}{" "}
                    {car.status === "sold" ? "expected" : "estimated equity"}
                  </p>
```

with:

```jsx
                  <p
                    className={`mt-1 text-sm font-black ${
                      getCarProfitOrEquity(car) >= 0 ? "text-emerald-600" : "text-amber-700"
                    }`}
                  >
                    {money(getCarProfitOrEquity(car))}{" "}
                    {car.status === "sold" ? "expected" : "estimated equity"}
                  </p>
```

Note: the "Atrasado" badge (`text-red-600` / `bg-red-50`, a few lines below) stays red — that badge is redundant with the new attention banner's "Pagos atrasados" section, but the plan's scope for `VehicleGrid.jsx` recoloring is limited to the profit/equity line per the design spec. Do not change the "Atrasado" badge in this task.

- [ ] **Step 4: Verify with lint and build**

Run: `npx eslint src/components/VehicleGrid.jsx`
Expected: no errors (confirms `getExpectedProfit`/`getInventoryEquity` removal didn't leave unused-import warnings, since both are gone from the import list entirely).

Run: `npm run build`
Expected: build succeeds (this file is already imported by `App.jsx`, so the build exercises the real change).

- [ ] **Step 5: Commit**

```bash
git add src/components/VehicleGrid.jsx
git commit -m "refactor: dedup vehicle grid profit calc and soften negative color to amber"
```

---

### Task 3: Recolor `SummaryCards.jsx` to amber

**Files:**
- Modify: `src/components/SummaryCards.jsx`

**Interfaces:** No signature changes — `SummaryCards({ summary })` and the internal `SummaryCard({ title, value, icon, highlight })` are unchanged.

- [ ] **Step 1: Recolor the negative-highlight branch**

Replace this line in the `SummaryCard` helper:

```javascript
              highlight === true ? "text-emerald-600" : highlight === false ? "text-red-600" : "text-[#221433]"
```

with:

```javascript
              highlight === true ? "text-emerald-600" : highlight === false ? "text-amber-700" : "text-[#221433]"
```

- [ ] **Step 2: Verify with lint and build**

Run: `npx eslint src/components/SummaryCards.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/SummaryCards.jsx
git commit -m "style: soften negative KPI highlight from red to amber"
```

---

### Task 4: Recolor `ReportsPanel.jsx` to amber

**Files:**
- Modify: `src/components/ReportsPanel.jsx`

**Interfaces:** No signature changes — `ReportsPanel({ cars })` is unchanged.

- [ ] **Step 1: Recolor the "Ganancia por Mes" bars**

Replace:

```javascript
                  className={`w-full rounded-t-lg ${row.profit >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
```

with:

```javascript
                  className={`w-full rounded-t-lg ${row.profit >= 0 ? "bg-emerald-500" : "bg-amber-500"}`}
```

- [ ] **Step 2: Recolor the "Inventario Envejecido" stale rows**

Replace:

```jsx
                <tr key={car.id} className={isStale ? "text-red-600" : "text-[#221433]"}>
```

with:

```jsx
                <tr key={car.id} className={isStale ? "text-amber-700" : "text-[#221433]"}>
```

- [ ] **Step 3: Recolor the "Pagos Atrasados" table**

Replace:

```jsx
                  <tr key={car.id} className="text-red-600">
```

with:

```jsx
                  <tr key={car.id} className="text-amber-700">
```

- [ ] **Step 4: Verify with lint and build**

Run: `npx eslint src/components/ReportsPanel.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportsPanel.jsx
git commit -m "style: soften Reports tab negative indicators from red to amber"
```

---

### Task 5: `src/components/AttentionBanner.jsx` — the new attention banner

**Files:**
- Create: `src/components/AttentionBanner.jsx`

**Interfaces:**
- Consumes from Task 1 (`@/lib/carCalculations`): `money`, `getVehiclesAtLoss`, `getPaymentStatus`, `getAgingInventory`.
- Consumes: icons `AlertTriangle`, `CheckCircle2`, `ChevronDown`, `ChevronUp` from `lucide-react`.
- Produces (consumed by Task 6): default export `AttentionBanner({ cars, onSelectCar })` where `onSelectCar(car)` is called when the user clicks a row in any expanded category.

This component is not wired into `App.jsx` yet — that happens in Task 6.

- [ ] **Step 1: Create the component**

Create `src/components/AttentionBanner.jsx`:

```jsx
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { money, getVehiclesAtLoss, getPaymentStatus, getAgingInventory } from "@/lib/carCalculations";

export default function AttentionBanner({ cars, onSelectCar }) {
  const [expanded, setExpanded] = useState(false);

  const vehiclesAtLoss = getVehiclesAtLoss(cars);
  const overdue = cars.filter((car) => getPaymentStatus(car).isOverdue);
  const staleInventory = getAgingInventory(cars).filter((entry) => entry.isStale);

  const totalCount = vehiclesAtLoss.length + overdue.length + staleInventory.length;

  if (totalCount === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
        <CheckCircle2 className="h-5 w-5" /> Todo en orden
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" /> {totalCount} carro{totalCount === 1 ? "" : "s"} necesitan atención
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-red-100 px-4 py-3">
          {vehiclesAtLoss.length > 0 && (
            <AttentionSection title="Con pérdida">
              {vehiclesAtLoss.map(({ car, amount }) => (
                <AttentionRow key={car.id} car={car} detail={money(amount)} onSelectCar={onSelectCar} />
              ))}
            </AttentionSection>
          )}

          {overdue.length > 0 && (
            <AttentionSection title="Pagos atrasados">
              {overdue.map((car) => {
                const status = getPaymentStatus(car);
                return (
                  <AttentionRow
                    key={car.id}
                    car={car}
                    detail={`${status.paymentsBehind} pago(s) · ${money(status.amountOverdue)}`}
                    onSelectCar={onSelectCar}
                  />
                );
              })}
            </AttentionSection>
          )}

          {staleInventory.length > 0 && (
            <AttentionSection title="Inventario viejo">
              {staleInventory.map(({ car, days }) => (
                <AttentionRow key={car.id} car={car} detail={`${days}d en inventario`} onSelectCar={onSelectCar} />
              ))}
            </AttentionSection>
          )}
        </div>
      )}
    </div>
  );
}

function AttentionSection({ title, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-black uppercase tracking-wide text-red-500">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function AttentionRow({ car, detail, onSelectCar }) {
  return (
    <button
      type="button"
      onClick={() => onSelectCar(car)}
      className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50"
    >
      <span>
        {car.year} {car.model || "Untitled Vehicle"}
      </span>
      <span>{detail}</span>
    </button>
  );
}
```

- [ ] **Step 2: Verify with lint**

Run: `npx eslint src/components/AttentionBanner.jsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AttentionBanner.jsx
git commit -m "feat: add AttentionBanner grouping losses, overdue payments, and aging inventory"
```

---

### Task 6: Wire `AttentionBanner` into `App.jsx`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes from Task 5: default export `AttentionBanner` from `@/components/AttentionBanner`, props `{ cars, onSelectCar }`.
- No changes to `CarSalesInventoryDashboard`'s own export.

- [ ] **Step 1: Import the component**

In `src/App.jsx`, add this import right after the existing `ReportsPanel` import:

```javascript
import ReportsPanel from "@/components/ReportsPanel";
import AttentionBanner from "@/components/AttentionBanner";
```

- [ ] **Step 2: Add the tab-switching selection handler**

Right after the existing `handleSelectCar` function:

```javascript
  function handleSelectCar(car) {
    setSelectedCarId(car.id);
    setForm(car);
  }
```

add:

```javascript

  function handleSelectCarFromAttention(car) {
    handleSelectCar(car);
    setActiveTab("inventory");
  }
```

- [ ] **Step 3: Render the banner between the KPI cards and the tab switcher**

Replace:

```jsx
        <SummaryCards summary={summary} />

        <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
```

with:

```jsx
        <SummaryCards summary={summary} />

        <AttentionBanner cars={cars} onSelectCar={handleSelectCarFromAttention} />

        <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
```

- [ ] **Step 4: Verify with lint, build, and the full test suite**

Run: `npx eslint src/App.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds — this is the real integration check for the whole plan (confirms `AttentionBanner`'s props and `carCalculations` imports all resolve correctly).

Run: `npm test`
Expected: 30/30 passing (unaffected by this task, confirms nothing broke).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: render AttentionBanner above the tab switcher in App.jsx"
```

---

### Task 7: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use the existing `.claude/launch.json` "dev" config (already present from the prior plan) to start the app.

- [ ] **Step 2: Verify colors**

With real or test data loaded: confirm KPI cards, vehicle grid cards, and the "Ganancia por Mes"/"Inventario Envejecido"/"Pagos Atrasados" sections in Reportes now show **amber** (not red) for negative/stale/overdue values. Confirm **green** (emerald) is unchanged for positive values.

- [ ] **Step 3: Verify the attention banner**

Confirm the banner appears between the KPI cards and the Inventario/Reportes tab switcher. Confirm it's visible identically on both tabs. Collapsed state shows "`N` carros necesitan atención" (or "Todo en orden" in green if there's nothing to flag). Click to expand — confirm it shows only the subsections that have items (with headers "Con pérdida" / "Pagos atrasados" / "Inventario viejo"), each row showing the car and its relevant number.

- [ ] **Step 4: Verify the click-through**

From the expanded banner (on the Reportes tab, to confirm the tab-switch works), click a car row. Confirm the app switches to the Inventario tab with that car's form open and populated.

- [ ] **Step 5: Record results**

Report to the user which of the above passed, and flag anything that didn't match expectations.
