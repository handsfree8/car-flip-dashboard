# Itemized expenses (line items with article, cost, and labor)

Date: 2026-07-07
Status: Approved (user delegated detailed decisions)

## Goal

Let the user log expenses as **itemized line items** — each with a description
(article), a part cost, and an optional labor cost — instead of only bumping an
opaque category total. Line items are captured by the Telegram bot from plain
text (no receipt photo required) and shown on the web dashboard as a per-car
expense table plus a cost-breakdown chart.

## Key decisions (locked)

- **Augment, do not replace.** Each logged expense is stored as a line item in a
  new `expenses` array on the car AND still increments the existing flat category
  totals. This keeps `getInvestment` / profit math (`src/lib/carCalculations.js`)
  correct with zero changes, and existing cars (no `expenses` array) keep working.
- **Labor is a per-item field.** A line item carries both `amount` (part cost) and
  `labor` (labor cost, optional/0). The part cost rolls into the item's category
  total; the labor cost rolls into `repairCost` (the "Repairs / Labor" category).
- **Confirmation always precedes a write** (money-affecting), reusing the existing
  expense confirm step.
- **Language:** conversational Spanish, fixed action/confirmation messages English
  (unchanged project rule).

## Data model (backward compatible)

Each car's `data` gains an optional `expenses` array:
```jsonc
expenses: [
  {
    "id": "<uuid>",
    "description": "ABS sensor",
    "category": "partsCost",      // one of the 10 EXPENSE_COST_FIELDS keys
    "amount": 300,                  // part cost (USD)
    "labor": 80,                    // labor cost (USD), 0 if none
    "date": "2026-07-07"           // YYYY-MM-DD
  }
]
```
Cars without the field are treated as `expenses: []`. Nothing else in the car
shape changes; the flat category totals remain the source of truth for
`getInvestment`.

### Applying a line item (shared rule)

Given a line item `{ category, amount, labor }`, applying it to a car:
1. Append the item (with generated `id` and `date`) to `data.expenses`.
2. `data[category] = Number(data[category] || 0) + amount`.
3. If `labor > 0`: `data.repairCost = Number(data.repairCost || 0) + labor`.

This is a pure function shared by the bot; the web only reads `expenses`.

## Phase A — data model + bot (Deno Edge Function)

The Telegram agent gains a third capability: logging an itemized expense from text.

- `claudeClient.ts`: `interpretMessage` receives the car list and exposes a second
  tool `log_expense` alongside `extract_car_purchase`, with `tool_choice: auto`.
  `log_expense` returns `{ matchedCarIds: string[], description: string,
  amount: number|null, labor: number|null, category: string|null }`.
  `InterpretResult` becomes a 3-way union: `car_purchase | expense | reply`.
  The `expense` variant carries the line-item fields above plus `matchedCarIds`.
- A new `ExpenseItemDraft` (extends the existing expense disambiguation) threads
  `description` and `labor` through the existing car/amount/category
  disambiguation + `expense_confirm` state machine. The confirmation message shows
  a mini table, e.g.:
  ```
  Add to the 2018 Ford Mustang EcoBoost Premium:
  • ABS sensor — Parts: $300 + Labor: $80 = $380
  Confirm? (yes/no)
  ```
- On `yes`, apply the line item via the shared rule (append to `expenses` +
  increment category totals) and `updateCarData`.
- The existing **photo** receipt flow is preserved. It may optionally be upgraded
  later to also produce a line item, but Phase A keeps it as-is (only text gains
  itemization) to limit scope; the photo path continues to bump category totals.
- `handleTextMessage` lists cars once and passes summaries to `interpretMessage`
  so the agent can match the car (one small extra query per text message).

Phase A ships working software: the bot captures itemized expenses end to end and
they are visible in the raw car data.

## Phase B — web dashboard (React app)

Reads the new `expenses` array; no bot dependency at runtime.

- **Expense table** in the car detail view (the modal that already shows a car):
  columns *Article · Category · Part · Labor · Total*, with a footer summing the
  column totals. Cars with no line items show a subtle "No itemized expenses yet"
  note (their category totals still render as today).
- **Cost breakdown chart:** a lightweight per-car bar chart of cost by category
  (built with CSS/SVG — no new chart dependency), reusing the existing
  `getCostBreakdown` logic where practical, to show where the money goes.
- The existing `VehicleForm` cost inputs stay as-is (they edit the category
  totals). The itemized table is a new read-only view fed by `expenses`.

Phase B ships working software: the dashboard renders the itemized table and chart.

## Components / changes (by phase)

Phase A (all under `supabase/functions/telegram-webhook/`):
- `lib/expenseItem.ts` (new, pure, unit-tested): the `ExpenseLineItem` type and
  `applyExpenseItemToCarData(carData, item)` implementing the shared apply rule;
  a `formatExpenseItemConfirmation(label, item)` helper for the mini-table message.
- `lib/claudeClient.ts`: add the `log_expense` tool + `expense` variant to
  `InterpretResult` / `parseInterpretResponse`.
- `lib/handlers.ts`: route the `expense` variant into the (extended) expense draft
  flow; apply the line item on confirm.
- Tests: `expenseItem.test.ts` (apply rule: category rollup, labor→repairCost,
  append semantics, backward-compat with missing `expenses`); parser test for the
  new `expense` branch.

Phase B (React app under `src/`):
- A new `ExpenseTable` component and a lightweight `CostBreakdownChart` component,
  rendered inside the existing car detail modal.
- Read `car.expenses` (default `[]`) via the existing `rowToCar`/`emptyCar` merge;
  add `expenses: []` to `emptyCar` so the field is always present.

## Safety

- The agent's tools remain non-side-effecting extraction tools (`extract_car_purchase`,
  `log_expense`); no tool writes to the DB directly. Every expense write still
  passes through `expense_confirm` + `parseYesNo === "yes"`.
- Only the authorized chat is served (unchanged gate).
- Backward compatible: `getInvestment` and all profit calcs are unchanged because
  category totals are still maintained.

## Testing

- Unit (Deno): `applyExpenseItemToCarData` — part→category, labor→repairCost,
  append to existing/empty `expenses`, immutability; `parseInterpretResponse`
  expense branch.
- `deno check` on changed wrappers/handlers; full `deno test` suite green.
- Live smoke (controller): "compré un sensor ABS por 300 y 80 de labor para el
  mustang ecoboost" → expense confirm with the mini table → on yes, a line item in
  `data.expenses` and `partsCost`/`repairCost` incremented.
- Web (Phase B): the detail modal shows the table + chart; a car with no items
  renders gracefully; totals match `getInvestment`.

## Out of scope

- Editing/deleting individual line items from the bot or web (add-only for now).
- Upgrading the photo receipt flow to emit line items (kept as category bump).
- Replacing the flat category-total model.
- Multi-currency.

## Implementation note

This spec is delivered as **two plans** (Phase A, then Phase B) so each produces
independently testable software. Phase A (data model + bot) ships first; Phase B
(web display) builds on the same `expenses` shape.
