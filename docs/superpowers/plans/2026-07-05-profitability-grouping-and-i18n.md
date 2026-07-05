# Profitability Grouping & English Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the vehicle grid into "Profitable" and "Non-Profitable" sections, and translate every remaining Spanish string in the UI to English.

**Architecture:** `VehicleGrid.jsx` partitions its already-filtered/sorted car list into two arrays using the existing `getCarProfitOrEquity` sign check, and renders each through a new local `VehicleGroup` helper (extracted to avoid duplicating the card markup). Every other task in this plan is a pure text/copy change — no logic, no new components, no new dependencies.

**Tech Stack:** React 19 + Vite, Tailwind CSS. No new dependencies.

## Global Constraints

- No changes to the Supabase schema or call shapes.
- No new npm dependencies.
- Translation tasks are text-only — the exact JSX structure, class names, and logic around each string must stay unchanged; only the visible copy changes.
- A vehicle is "Profitable" when `getCarProfitOrEquity(car) >= 0`, "Non-Profitable" when it's negative — the same sign check that already colors each card's profit text emerald/amber.
- If a profitability group has zero cars (after the existing search/status/sale-type filters), that whole section (header + grid) does not render.
- No automated tests for React components (no test-renderer installed) — verify via `eslint` + `npm run build` (all touched files are already wired into the running app) and manual browser QA in the final task.

---

### Task 1: Group `VehicleGrid.jsx` into Profitable / Non-Profitable sections

**Files:**
- Modify: `src/components/VehicleGrid.jsx` (full file replacement — most of the file is unchanged, but the card-rendering JSX is extracted into a new local component)

**Interfaces:**
- No prop signature changes — stays `VehicleGrid({ cars, selectedCarId, onSelectCar })`.
- Adds a local (non-exported) helper `VehicleGroup({ title, cars, selectedCarId, onSelectCar })`, used only inside this file.

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/components/VehicleGrid.jsx` with:

```jsx
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Car, ImagePlus } from "lucide-react";
import {
  money,
  getCarProfitOrEquity,
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
    return sorted.sort((a, b) => getCarProfitOrEquity(b) - getCarProfitOrEquity(a));
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

  const profitableCars = visibleCars.filter((car) => getCarProfitOrEquity(car) >= 0);
  const nonProfitableCars = visibleCars.filter((car) => getCarProfitOrEquity(car) < 0);

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
          <p className="text-sm">Click Add Vehicle to get started.</p>
        </div>
      ) : visibleCars.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-purple-200 p-8 text-center text-[#5b2a86]">
          <Car className="mx-auto mb-3 h-10 w-10" />
          <p className="font-bold">No vehicles match your filters</p>
        </div>
      ) : (
        <div className="space-y-8">
          {profitableCars.length > 0 && (
            <VehicleGroup
              title="Profitable"
              cars={profitableCars}
              selectedCarId={selectedCarId}
              onSelectCar={onSelectCar}
            />
          )}
          {nonProfitableCars.length > 0 && (
            <VehicleGroup
              title="Non-Profitable"
              cars={nonProfitableCars}
              selectedCarId={selectedCarId}
              onSelectCar={onSelectCar}
            />
          )}
        </div>
      )}
    </>
  );
}

function VehicleGroup({ title, cars, selectedCarId, onSelectCar }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-base font-black text-[#3b1b6d]">{title}</h3>
        <span className="rounded-full bg-[#efe6f8] px-2 py-0.5 text-xs font-bold text-[#5b2a86]">
          {cars.length} cars
        </span>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cars.map((car) => {
          const days = getDaysInInventory(car);
          const paymentStatus = getPaymentStatus(car);
          return (
            <motion.button
              layoutId={`vehicle-card-${car.id}`}
              whileHover={{ y: -8, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              key={car.id}
              type="button"
              onClick={() => onSelectCar(car)}
              className={`group relative overflow-hidden rounded-3xl border bg-gradient-to-b from-white to-[#f7f2ff] text-left shadow-sm transition-shadow duration-300 hover:shadow-[0_20px_50px_-12px_rgba(139,92,246,0.45)] ${
                selectedCarId === car.id
                  ? "border-[#5b2a86] ring-4 ring-purple-100"
                  : "border-purple-100 hover:border-[#a879ff]"
              }`}
            >
              <div className="relative h-48 overflow-hidden bg-[#efe6f8] sm:h-56">
                {car.photo ? (
                  <img
                    src={car.photo}
                    alt={car.model || "Car"}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[#7d3fb2]">
                    <ImagePlus className="h-12 w-12" />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
              <div className="p-5">
                <p className="line-clamp-1 text-lg font-black text-[#221433]">
                  {car.year} {car.model || "Untitled Vehicle"}
                </p>
                <p className="mt-1 text-xs font-bold uppercase text-[#7d3fb2]">
                  {car.status === "sold" ? (car.saleType === "finance" ? "Credit Sale" : "Cash Sale") : "Available / Not Sold"}
                </p>
                <p
                  className={`mt-2 text-base font-black ${
                    getCarProfitOrEquity(car) >= 0 ? "text-emerald-600" : "text-amber-700"
                  }`}
                >
                  {money(getCarProfitOrEquity(car))}{" "}
                  {car.status === "sold" ? "expected" : "estimated equity"}
                </p>
                {car.saleType === "finance" && car.status === "sold" && (
                  <p className="text-xs text-slate-500">{money(getBalanceRemaining(car))} balance</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {car.status !== "sold" && days !== null && (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-[#5b2a86]">
                      {days}d in inventory
                    </span>
                  )}
                  {paymentStatus.isOverdue && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                      Overdue · {paymentStatus.paymentsBehind} payment(s)
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify with lint and build**

Run: `npx eslint src/components/VehicleGrid.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (this file is already imported by `App.jsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/VehicleGrid.jsx
git commit -m "feat: split vehicle grid into profitable and non-profitable sections"
```

---

### Task 2: Translate `AttentionBanner.jsx` to English

**Files:**
- Modify: `src/components/AttentionBanner.jsx`

**Interfaces:** No signature changes — `AttentionBanner({ cars, onSelectCar })` and its internal helpers are unchanged except for the literal strings below.

- [ ] **Step 1: Replace the "All Clear" state text**

Replace:

```jsx
        <CheckCircle2 className="h-5 w-5" /> Todo en orden
```

with:

```jsx
        <CheckCircle2 className="h-5 w-5" /> All Clear
```

- [ ] **Step 2: Replace the collapsed-banner count text**

Replace:

```jsx
          <AlertTriangle className="h-5 w-5" /> {totalCount} carro{totalCount === 1 ? "" : "s"} necesitan atención
```

with:

```jsx
          <AlertTriangle className="h-5 w-5" /> {totalCount} vehicle{totalCount === 1 ? "" : "s"} need attention
```

- [ ] **Step 3: Replace the three section titles and the two detail strings**

Replace:

```jsx
            <AttentionSection title="Con pérdida">
```

with:

```jsx
            <AttentionSection title="At a Loss">
```

Replace:

```jsx
            <AttentionSection title="Pagos atrasados">
```

with:

```jsx
            <AttentionSection title="Overdue Payments">
```

Replace:

```jsx
                    detail={`${status.paymentsBehind} pago(s) · ${money(status.amountOverdue)}`}
```

with:

```jsx
                    detail={`${status.paymentsBehind} payment(s) · ${money(status.amountOverdue)}`}
```

Replace:

```jsx
            <AttentionSection title="Inventario viejo">
```

with:

```jsx
            <AttentionSection title="Aging Inventory">
```

Replace:

```jsx
              {staleInventory.map(({ car, days }) => (
                <AttentionRow key={car.id} car={car} detail={`${days}d en inventario`} onSelectCar={onSelectCar} />
              ))}
```

with:

```jsx
              {staleInventory.map(({ car, days }) => (
                <AttentionRow key={car.id} car={car} detail={`${days}d in inventory`} onSelectCar={onSelectCar} />
              ))}
```

- [ ] **Step 4: Verify with lint and build**

Run: `npx eslint src/components/AttentionBanner.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/AttentionBanner.jsx
git commit -m "i18n: translate AttentionBanner to English"
```

---

### Task 3: Translate `ReportsPanel.jsx` to English

**Files:**
- Modify: `src/components/ReportsPanel.jsx`

**Interfaces:** No signature changes — `ReportsPanel({ cars })` is unchanged except for the literal strings below.

- [ ] **Step 1: Replace the header title and export button**

Replace:

```jsx
        <h2 className="text-xl font-black text-[#3b1b6d]">Reportes</h2>
        <Button
          onClick={() => downloadCarsCsv(cars)}
          className="rounded-2xl bg-[#5b2a86] px-4 py-5 text-sm font-bold text-white hover:bg-[#3b1b6d]"
        >
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
```

with:

```jsx
        <h2 className="text-xl font-black text-[#3b1b6d]">Reports</h2>
        <Button
          onClick={() => downloadCarsCsv(cars)}
          className="rounded-2xl bg-[#5b2a86] px-4 py-5 text-sm font-bold text-white hover:bg-[#3b1b6d]"
        >
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
```

- [ ] **Step 2: Replace the cost breakdown section title**

Replace:

```jsx
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Desglose de Costos (Total)</h3>
```

with:

```jsx
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Cost Breakdown (Total)</h3>
```

- [ ] **Step 3: Replace the "Profit by Month" section title and empty state**

Replace:

```jsx
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Ganancia por Mes</h3>
        {profitByMonth.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">Aún no hay carros vendidos.</p>
```

with:

```jsx
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Profit by Month</h3>
        {profitByMonth.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">No cars sold yet.</p>
```

- [ ] **Step 4: Replace the "Aging Inventory" section title and empty state**

Replace:

```jsx
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Inventario Envejecido</h3>
        {aging.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">No hay carros disponibles en inventario.</p>
```

with:

```jsx
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Aging Inventory</h3>
        {aging.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">No available vehicles in inventory.</p>
```

- [ ] **Step 5: Replace the "Overdue Payments" section title, table headers, and empty state**

Replace:

```jsx
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
```

with:

```jsx
        <h3 className="mb-3 text-lg font-black text-[#3b1b6d]">Overdue Payments</h3>
        {overdue.length === 0 ? (
          <p className="text-sm text-[#5b2a86]">No overdue payments.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs font-bold uppercase text-[#7d3fb2]">
                <th className="pb-2">Vehicle</th>
                <th className="pb-2">Payments Behind</th>
                <th className="pb-2">Amount Overdue</th>
                <th className="pb-2">Balance</th>
              </tr>
            </thead>
```

- [ ] **Step 6: Verify with lint and build**

Run: `npx eslint src/components/ReportsPanel.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/ReportsPanel.jsx
git commit -m "i18n: translate ReportsPanel to English"
```

---

### Task 4: Translate `App.jsx` to English

**Files:**
- Modify: `src/App.jsx`

**Interfaces:** No signature changes — `CarSalesInventoryDashboard()` default export is unchanged except for the literal strings below.

- [ ] **Step 1: Replace the tab labels**

Replace:

```javascript
const TABS = [
  { value: "inventory", label: "Inventario" },
  { value: "reports", label: "Reportes" },
];
```

with:

```javascript
const TABS = [
  { value: "inventory", label: "Inventory" },
  { value: "reports", label: "Reports" },
];
```

- [ ] **Step 2: Replace the header subtitle**

Replace:

```jsx
              <p className="mt-3 max-w-3xl text-sm text-purple-100 sm:text-base">
                Controla carros vendidos cash o a crédito, pagos recibidos, balance pendiente y ganancia real desde la nube.
              </p>
```

with:

```jsx
              <p className="mt-3 max-w-3xl text-sm text-purple-100 sm:text-base">
                Track cars sold cash or on credit, payments received, pending balance, and real profit — all from the cloud.
              </p>
```

- [ ] **Step 3: Verify with lint and build**

Run: `npx eslint src/App.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "i18n: translate App.jsx tabs and header subtitle to English"
```

---

### Task 5: Translate `VehicleForm.jsx` to English

**Files:**
- Modify: `src/components/VehicleForm.jsx`

**Interfaces:** No signature changes — `VehicleForm({ form, formTotals, onChange, onSave, onDelete, saving })` is unchanged except for the literal strings below.

- [ ] **Step 1: Replace the sub-tab labels**

Replace:

```javascript
const SUB_TABS = [
  { value: "info", label: "Info" },
  { value: "costs", label: "Costos" },
  { value: "sale", label: "Venta / Financiamiento" },
  { value: "notes", label: "Notas" },
];
```

with:

```javascript
const SUB_TABS = [
  { value: "info", label: "Info" },
  { value: "costs", label: "Costs" },
  { value: "sale", label: "Sale / Financing" },
  { value: "notes", label: "Notes" },
];
```

- [ ] **Step 2: Replace the "not sold yet" message**

Replace:

```jsx
            <p className="rounded-3xl bg-[#f7f4fb] p-4 text-sm text-[#5b2a86]">
              Este vehículo aún no está vendido. Cambia el estatus a "Sold" en la pestaña Info para capturar los datos de venta.
            </p>
```

with:

```jsx
            <p className="rounded-3xl bg-[#f7f4fb] p-4 text-sm text-[#5b2a86]">
              This vehicle hasn't been sold yet. Change the status to "Sold" on the Info tab to capture the sale details.
            </p>
```

- [ ] **Step 3: Verify with lint and build**

Run: `npx eslint src/components/VehicleForm.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/VehicleForm.jsx
git commit -m "i18n: translate VehicleForm sub-tabs and not-sold message to English"
```

---

### Task 6: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use the existing `.claude/launch.json` "dev" config to start the app.

- [ ] **Step 2: Verify the profitability grouping**

With real or test data loaded (at least one profitable and one non-profitable vehicle), confirm the Inventario/Inventory tab shows a "Profitable" section followed by a "Non-Profitable" section, each with a correct count badge, and containing exactly the cars whose profit/equity sign matches. Filter down to only profitable cars (e.g. via a search term) and confirm the "Non-Profitable" section disappears entirely rather than showing empty.

- [ ] **Step 3: Verify English text everywhere**

Click through every screen — Inventory tab, Reports tab, the attention banner (both collapsed and expanded, and its zero-items "All Clear" state if reachable), and the vehicle detail modal (all four sub-tabs, plus the "not sold yet" message on the Sale/Financing tab for an unsold vehicle) — and confirm no Spanish text remains anywhere.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: 30/30 passing (this plan touches no files with `node:test` coverage, so this just confirms nothing else broke).

- [ ] **Step 5: Record results**

Report to the user which of the above passed, and flag anything that didn't match expectations.
