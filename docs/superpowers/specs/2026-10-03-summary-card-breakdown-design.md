# Summary cards with click-to-breakdown

Date: 2026-10-03
Status: Approved

## Goal

Make each of the 9 KPI summary cards (Cars, Invested, Collected, Balance
Pending, Expected Revenue, Expected Profit, Profit Collected, Financed Cars,
Available Cars) clickable. Clicking a card opens a centered modal showing the
per-car breakdown behind that number — each contributing car and its value —
sorted high to low, with a footer total that matches the card exactly.

## Why

The cards show portfolio totals but hide where each number comes from. Users
want to audit/understand each figure (e.g. "which cars make up my $115k
invested?"). The breakdown is computed with the SAME functions that produce the
totals, so the modal total always ties out to the card.

## Interaction

- Each card becomes a button with a subtle hover affordance (lift/ring) and is
  keyboard-focusable.
- Clicking opens `MetricBreakdownModal` for that metric (same overlay +
  framer-motion + Escape/click-outside behavior as the existing `VehicleModal`).
- The modal shows a title, a scrollable list of rows (car label + its value for
  that metric), and a footer line with the total.

## Metric definitions

Two kinds: **money** (per-car dollar contribution, footer = sum) and **count**
(a list of the cars in that group, footer = "N cars", with a relevant secondary
figure per row).

| Card key | Kind | Per-car value / inclusion | Row secondary | Sort |
|---|---|---|---|---|
| `cars` | count | all cars | status + profit-or-equity | profit-or-equity desc |
| `invested` | money | `getInvestment(car)` (all cars) | — | value desc |
| `collected` | money | `getCollectedSoFar(car)` (all cars) | — | value desc |
| `balance` | money | `getBalanceRemaining(car)`, include only `> 0` | — | value desc |
| `expected` | money | `getExpectedSaleValue(car)` (all cars) | — | value desc |
| `expectedProfit` | money (signed) | `getExpectedProfit(car)` (all cars) | — | value desc |
| `collectedProfit` | money (signed) | `getCollectedProfit(car)` (all cars) | — | value desc |
| `financedCars` | count | `isSold(car) && saleType==="finance"` | balance remaining | balance desc |
| `availableCars` | count | `!isSold(car)` | estimated equity | equity desc |

- Signed money metrics color the value emerald when `>= 0`, amber when `< 0`
  (matching the card highlight convention).
- Money footer total = sum of the displayed rows (for `balance` that equals the
  card because excluded rows contribute 0).
- Count footer = `"<n> car"` / `"<n> cars"`.

## Components / changes

- `src/lib/summaryBreakdown.js` (new, pure, unit-tested):
  - `buildMetricBreakdown(metricKey, cars)` →
    `{ title, kind, rows: [{ id, label, value, display, sublabel?, highlight? }], footerLabel, footerValue }`.
  - `rows` already sorted; `display` is the formatted string (via `money` or a
    count's secondary). `value` is the raw number (for totals/sorting/tests).
  - Reuses `carCalculations.js` (`getInvestment`, `getCollectedSoFar`,
    `getBalanceRemaining`, `getExpectedSaleValue`, `getExpectedProfit`,
    `getCollectedProfit`, `getInventoryEquity`, `getCarProfitOrEquity`,
    `isSold`, `money`). No new math.
  - A car label helper: `` `${year} ${model}`.trim() || "Untitled" ``.
- `src/components/MetricBreakdownModal.jsx` (new): overlay + card (reuse
  `VehicleModal`'s overlay/animation/escape/click-outside pattern, no
  `layoutId`), renders the rows list and footer. Empty `rows` → a friendly
  "No cars contribute to this yet." line.
- `src/components/SummaryCards.jsx` (modify): accept `cars` prop; keep internal
  `openMetric` state; each card is a `<button>` carrying its `metricKey`; render
  one `MetricBreakdownModal` driven by `openMetric`.
- `src/App.jsx` (modify): pass `cars` to `<SummaryCards cars={cars} summary={summary} />`.

## Consistency guarantee

Because `buildMetricBreakdown` sums the exact per-car functions that
`App.jsx`'s `summary` memo already uses, the modal footer equals the card value
for the same `cars` array. A unit test asserts this tie-out for the money
metrics.

## Testing

- Unit (`summaryBreakdown.test.js`, Node test runner like the existing lib
  tests): for a small fixture of cars — rows sorted desc; money footer == sum ==
  the corresponding `summary` aggregate; `balance` excludes zero rows;
  `financedCars`/`availableCars` include exactly the right cars; count footer
  pluralization.
- Visual (browser preview): click each card → correct breakdown, footer ties to
  the card, Escape/click-outside closes, looks right on mobile width.

## Out of scope

- Editing values from the modal (read-only).
- Drilling from a breakdown row into the car's detail modal (possible later).
- Changing the card layout or the numbers themselves.
