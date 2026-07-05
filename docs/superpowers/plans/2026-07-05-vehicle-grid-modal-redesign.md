# Vehicle Grid & Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split grid/form layout on the Inventario tab with a full-width, larger vehicle grid and a shared-element "zoom" modal for the vehicle detail form.

**Architecture:** `VehicleGrid.jsx` gets bigger 3-column cards with a futuristic hover treatment and a `framer-motion` `layoutId` per card. A new `VehicleModal.jsx` wraps the existing, unchanged `VehicleForm.jsx` in an animated overlay that shares a `layoutId` with whichever card (or the "Add Vehicle" button) was clicked, so `framer-motion` animates the modal growing from that exact origin. `App.jsx` drops the two-column layout for a single full-width grid card and renders the modal once, controlled by the existing `selectedCarId` state.

**Tech Stack:** React 19 + Vite, Tailwind CSS, `framer-motion` (already installed, `^12.38.0` — no new dependencies), `lucide-react` icons.

## Global Constraints

- No changes to the Supabase schema or call shapes.
- No new npm dependencies — all animation uses `framer-motion`, already installed.
- No changes to `VehicleForm.jsx`'s internal content (its 4 sub-tabs and all fields stay exactly as they are) — only its container changes.
- No automated tests for React components (no test-renderer installed) — verify via `eslint` + `npm run build` (all touched files are already wired into the running app) and manual browser QA in the final task.
- The zoom animation must originate from the clicked element (a vehicle card, or the "Add Vehicle" button for a new vehicle) — not a generic center-of-screen fade.
- Card grid: 3 columns on large screens (`lg:grid-cols-3`), collapsing responsively on smaller screens.

---

### Task 1: Redesign `VehicleGrid.jsx` — bigger cards, futuristic hover, shared-element `layoutId`

**Files:**
- Modify: `src/components/VehicleGrid.jsx`

**Interfaces:**
- No prop signature changes — stays `VehicleGrid({ cars, selectedCarId, onSelectCar })`.
- Produces (consumed by Task 3): each rendered card now carries `layoutId={`vehicle-card-${car.id}`}`, which `VehicleModal` (Task 2) must match when opening for that same car.

- [ ] **Step 1: Replace the grid container and card markup**

In `src/components/VehicleGrid.jsx`, replace this block:

```jsx
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
                      getCarProfitOrEquity(car) >= 0 ? "text-emerald-600" : "text-amber-700"
                    }`}
                  >
                    {money(getCarProfitOrEquity(car))}{" "}
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
```

with:

```jsx
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCars.map((car) => {
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
                        Atrasado · {paymentStatus.paymentsBehind} pago(s)
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
```

Note: only the grid container's column classes and the card's JSX changed. The rest of the file (imports, `STATUS_OPTIONS`, `SALE_TYPE_OPTIONS`, `SORT_OPTIONS`, `matchesSearch`, `sortCars`, the toolbar, and the two empty-state blocks) stays exactly as it is — do not touch them.

- [ ] **Step 2: Verify with lint and build**

Run: `npx eslint src/components/VehicleGrid.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (this file is already imported by `App.jsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/VehicleGrid.jsx
git commit -m "feat: redesign vehicle grid with bigger cards, futuristic hover, and shared layoutId"
```

---

### Task 2: `src/components/VehicleModal.jsx` — the shared-element zoom modal

**Files:**
- Create: `src/components/VehicleModal.jsx`

**Interfaces:**
- Consumes: `VehicleForm` (default export, unchanged) from `@/components/VehicleForm`; `AnimatePresence`, `motion` from `framer-motion`; `X` icon from `lucide-react`.
- Produces (consumed by Task 3): default export `VehicleModal({ open, form, formTotals, onChange, onSave, onDelete, onClose, saving, originLayoutId })`.
  - `open` (boolean): whether the modal is mounted/visible.
  - `form`, `formTotals`, `onChange`, `onSave`, `onDelete`, `saving`: passed straight through to `VehicleForm` unchanged.
  - `onClose()`: called when the user closes the modal (X button, backdrop click, or Escape) — never called while `saving` is `true`.
  - `originLayoutId` (string): the `layoutId` to share with the element that triggered the open (a card's `vehicle-card-${car.id}` from Task 1, or `"vehicle-card-new"` for a new vehicle).

This component is not wired into `App.jsx` yet — that happens in Task 3.

- [ ] **Step 1: Create the component**

Create `src/components/VehicleModal.jsx`:

```jsx
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import VehicleForm from "@/components/VehicleForm";

export default function VehicleModal({
  open,
  form,
  formTotals,
  onChange,
  onSave,
  onDelete,
  onClose,
  saving,
  originLayoutId,
}) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, saving, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="vehicle-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md"
        >
          <motion.div
            layoutId={originLayoutId}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-purple-100 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-full bg-[#efe6f8] p-2 text-[#5b2a86] transition hover:bg-purple-100 disabled:opacity-60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <VehicleForm
              form={form}
              formTotals={formTotals}
              onChange={onChange}
              onSave={onSave}
              onDelete={onDelete}
              saving={saving}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify with lint**

Run: `npx eslint src/components/VehicleModal.jsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/VehicleModal.jsx
git commit -m "feat: add VehicleModal with shared-element zoom animation"
```

---

### Task 3: Wire the modal into `App.jsx` and remove the split layout

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes from Task 1: `VehicleGrid` cards now carry `layoutId={`vehicle-card-${car.id}`}` (no prop changes to `VehicleGrid` itself).
- Consumes from Task 2: default export `VehicleModal` from `@/components/VehicleModal`, props `{ open, form, formTotals, onChange, onSave, onDelete, onClose, saving, originLayoutId }`.
- `VehicleForm` is no longer imported or rendered directly in `App.jsx` — it now only renders inside `VehicleModal`.

- [ ] **Step 1: Replace the import block**

Replace:

```javascript
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
  getBreakEvenPayment,
} from "@/lib/carCalculations";
import SummaryCards from "@/components/SummaryCards";
import VehicleGrid from "@/components/VehicleGrid";
import VehicleForm from "@/components/VehicleForm";
import ReportsPanel from "@/components/ReportsPanel";
import AttentionBanner from "@/components/AttentionBanner";
```

with:

```javascript
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Cloud, RefreshCw } from "lucide-react";
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
  getBreakEvenPayment,
} from "@/lib/carCalculations";
import SummaryCards from "@/components/SummaryCards";
import VehicleGrid from "@/components/VehicleGrid";
import VehicleModal from "@/components/VehicleModal";
import ReportsPanel from "@/components/ReportsPanel";
import AttentionBanner from "@/components/AttentionBanner";
```

(`Car` is dropped from the `lucide-react` import because the placeholder block that used it is removed in Step 3; `VehicleForm` is dropped because it's no longer rendered directly; `motion` and `VehicleModal` are added.)

- [ ] **Step 2: Add the close handler**

Right after the existing `handleSelectCarFromAttention` function:

```javascript
  function handleSelectCarFromAttention(car) {
    handleSelectCar(car);
    setActiveTab("inventory");
  }
```

add:

```javascript

  function handleCloseModal() {
    setSelectedCarId(null);
    setForm(emptyCar);
  }
```

- [ ] **Step 3: Replace the "Add Vehicle" button and the Inventario/Reports layout**

Replace this entire block (from the "Add Vehicle" button through the end of the component):

```jsx
              <Button onClick={handleNewCar} className="rounded-2xl bg-white px-5 py-6 text-base font-bold text-[#4b2179] shadow-lg hover:bg-purple-50">
                <Plus className="mr-2 h-5 w-5" /> Add Vehicle
              </Button>
            </div>
          </div>
        </header>

        <SummaryCards summary={summary} />

        <AttentionBanner cars={cars} onSelectCar={handleSelectCarFromAttention} />

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

with:

```jsx
              <motion.div layoutId="vehicle-card-new">
                <Button onClick={handleNewCar} className="rounded-2xl bg-white px-5 py-6 text-base font-bold text-[#4b2179] shadow-lg hover:bg-purple-50">
                  <Plus className="mr-2 h-5 w-5" /> Add Vehicle
                </Button>
              </motion.div>
            </div>
          </div>
        </header>

        <SummaryCards summary={summary} />

        <AttentionBanner cars={cars} onSelectCar={handleSelectCarFromAttention} />

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
          <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
            <CardContent className="p-4 sm:p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black text-[#3b1b6d]">Vehicle Grid</h2>
                <span className="rounded-full bg-[#efe6f8] px-3 py-1 text-sm font-bold text-[#5b2a86]">{cars.length} cars</span>
              </div>
              <VehicleGrid cars={cars} selectedCarId={selectedCarId} onSelectCar={handleSelectCar} />
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-[2rem] border border-purple-100 bg-white/90 shadow-lg">
            <CardContent className="p-4 sm:p-5 md:p-6">
              <ReportsPanel cars={cars} />
            </CardContent>
          </Card>
        )}
      </div>

      <VehicleModal
        open={Boolean(selectedCarId)}
        form={form}
        formTotals={formTotals}
        onChange={handleChange}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={handleCloseModal}
        saving={saving}
        originLayoutId={selectedCarId === "new" ? "vehicle-card-new" : `vehicle-card-${selectedCarId}`}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify with lint, build, and the full test suite**

Run: `npx eslint src/App.jsx`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds — this is the real integration check (confirms `VehicleModal`'s props resolve correctly and no stale references to the removed `VehicleForm` import or `Car` icon remain).

Run: `npm test`
Expected: 30/30 passing (unaffected by this task, confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: replace split grid/form layout with full-width grid and zoom modal"
```

---

### Task 4: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use the existing `.claude/launch.json` "dev" config to start the app.

- [ ] **Step 2: Verify the grid**

Confirm the Inventario tab now shows a single full-width card containing the "Vehicle Grid" header, toolbar, and a 3-column grid of noticeably bigger cards (no side panel). Hover over a few cards — confirm lift, colored glow shadow, image zoom-in, and border color change to violet.

- [ ] **Step 3: Verify opening the modal from a card**

Click a vehicle card. Confirm the modal animates growing from that card's position/size toward the center of the screen (not a generic centered fade), with a dark, blurred backdrop behind it. Confirm the form inside is unchanged (same 4 sub-tabs, same fields).

- [ ] **Step 4: Verify opening the modal from "Add Vehicle"**

Click "Add Vehicle" in the top header. Confirm the modal animates growing from that button's position.

- [ ] **Step 5: Verify closing**

Confirm all three close paths work: the X button, clicking the dark backdrop outside the modal, and pressing Escape.

- [ ] **Step 6: Verify save/delete behavior**

Change a field and save — confirm the modal stays open showing the updated state. Delete a vehicle — confirm the modal closes and returns to the grid.

- [ ] **Step 7: Verify responsiveness**

Check the grid at desktop, tablet, and mobile widths — confirm it collapses to fewer columns without breaking, and the modal remains usable (scrollable) on small screens.

- [ ] **Step 8: Record results**

Report to the user which of the above passed, and flag anything that didn't match expectations.
