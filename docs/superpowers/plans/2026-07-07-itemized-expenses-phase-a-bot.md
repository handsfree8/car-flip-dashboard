# Itemized Expenses — Phase A (data model + bot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Telegram bot log an itemized expense from plain text (article + part cost + optional labor), storing it as a line item on the car AND incrementing the existing category totals, all behind the existing yes/no confirmation.

**Architecture:** The agent (`interpretMessage`) gains a second tool `log_expense` and the car inventory for matching; its result becomes a 3-way union (`car_purchase | expense | reply`). A new pure `expenseItem.ts` implements the apply rule and confirmation formatting. `handleTextMessage` routes the `expense` variant into the EXISTING expense disambiguation/confirm state machine, extended to carry `description` and `labor`.

**Tech Stack:** Deno (Supabase Edge Function), TypeScript, Anthropic Messages API (`claude-sonnet-5`), Telegram Bot API. Tests via `Deno.test`.

## Global Constraints

- Runtime: Deno / Supabase Edge Functions, under `supabase/functions/telegram-webhook/`.
- Model id stays `claude-sonnet-5` (existing `MODEL` constant) — do not change it. It is a valid current Anthropic model id.
- Augment, not replace: a line item is appended to `data.expenses` AND increments category totals (part→its category, labor→`repairCost`). Never remove or rewrite the flat category totals — `getInvestment` depends on them.
- Category keys are the 10 in `EXPENSE_COST_FIELDS` (costFields.ts): repairCost, partsCost, transportCost, adminFees, titleFees, taxes, detailingCost, advertisingCost, repoCost, miscCost.
- Every expense write passes through `expense_confirm` + `parseYesNo === "yes"`; tools are non-side-effecting extraction only.
- Conversational replies in the user's language; fixed action/confirmation messages in ENGLISH.
- The photo receipt flow stays as-is (category bump only) — do not change `handleReceiptPhoto`/`readReceipt`.
- Verify pure logic with `deno test`; wrappers/handlers with `deno check --node-modules-dir=none` (repo-root `node_modules` collides with Deno npm resolution). Prefix commands with `export PATH="$HOME/.deno/bin:$PATH"`.

---

### Task 1: `expenseItem.ts` — line-item model + apply rule (pure)

**Files:**
- Create: `supabase/functions/telegram-webhook/lib/expenseItem.ts`
- Test: `supabase/functions/telegram-webhook/lib/expenseItem.test.ts`

**Interfaces:**
- Consumes: `getExpenseCategoryLabel` from `./costFields.ts`.
- Produces:
  - `interface ExpenseLineItem { id: string; description: string; category: string; amount: number; labor: number; date: string }`
  - `applyExpenseItemToCarData(carData: Record<string, unknown>, item: ExpenseLineItem): Record<string, unknown>`
  - `formatExpenseItemConfirmation(carLabel: string, description: string, category: string, amount: number, labor: number): string`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/telegram-webhook/lib/expenseItem.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/expenseItem.test.ts`
Expected: FAIL — module `./expenseItem.ts` not found.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/telegram-webhook/lib/expenseItem.ts`:
```ts
import { getExpenseCategoryLabel } from "./costFields.ts";

export interface ExpenseLineItem {
  id: string;
  description: string;
  category: string;
  amount: number;
  labor: number;
  date: string;
}

// Appends the line item and rolls its costs into the flat category totals:
// the part cost into the item's own category, and any labor into repairCost
// ("Repairs / Labor"). Reads run against the in-progress result so a
// repairCost-category item with labor accumulates correctly. Input is not mutated.
export function applyExpenseItemToCarData(
  carData: Record<string, unknown>,
  item: ExpenseLineItem,
): Record<string, unknown> {
  const existing = Array.isArray(carData.expenses) ? (carData.expenses as unknown[]) : [];
  const result: Record<string, unknown> = { ...carData, expenses: [...existing, item] };
  result[item.category] = Number(result[item.category] || 0) + item.amount;
  if (item.labor > 0) {
    result.repairCost = Number(result.repairCost || 0) + item.labor;
  }
  return result;
}

export function formatExpenseItemConfirmation(
  carLabel: string,
  description: string,
  category: string,
  amount: number,
  labor: number,
): string {
  const total = amount + labor;
  const laborPart = labor > 0 ? ` + Labor: $${labor}` : "";
  return (
    `Add to the ${carLabel}:\n` +
    `• ${description} — ${getExpenseCategoryLabel(category)}: $${amount}${laborPart} = $${total}\n` +
    `Confirm? (yes/no)`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/expenseItem.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/expenseItem.ts supabase/functions/telegram-webhook/lib/expenseItem.test.ts
git commit -m "feat: add itemized expense line-item model and apply rule"
```

---

### Task 2: `claudeClient.ts` — `log_expense` tool + `expense` result variant

**Files:**
- Modify: `supabase/functions/telegram-webhook/lib/claudeClient.ts`
- Test: `supabase/functions/telegram-webhook/lib/claudeClient.test.ts` (extend)

**Interfaces:**
- Consumes: existing `CarPurchaseExtraction`, constants, `apiKey` closure.
- Produces:
  - `interface ExpenseExtraction { matchedCarIds: string[]; description: string | null; amount: number | null; labor: number | null; category: string | null }`
  - `InterpretResult` extended with `| { kind: "expense"; data: ExpenseExtraction }`.
  - `interpretMessage(messageText: string, today: string, cars?: { id: string; year: string; model: string }[]): Promise<InterpretResult>` — now accepts the inventory (defaults to `[]`) and exposes the `log_expense` tool.

- [ ] **Step 1: Extend the test**

In `supabase/functions/telegram-webhook/lib/claudeClient.test.ts`, add:
```ts
Deno.test("parseInterpretResponse returns expense for a log_expense tool_use block", () => {
  const content = [
    {
      type: "tool_use",
      name: "log_expense",
      input: { matchedCarIds: ["car-1"], description: "ABS sensor", amount: 300, labor: 80, category: "partsCost" },
    },
  ];
  const result = parseInterpretResponse(content);
  assertEquals(result.kind, "expense");
  if (result.kind === "expense") {
    assertEquals(result.data.description, "ABS sensor");
    assertEquals(result.data.matchedCarIds, ["car-1"]);
    assertEquals(result.data.labor, 80);
  }
});

Deno.test("parseInterpretResponse still returns car_purchase for extract_car_purchase", () => {
  const content = [
    { type: "tool_use", name: "extract_car_purchase", input: { model: "Ford Mustang", year: "2018", purchasePrice: 8500, purchaseDate: "2026-07-07" } },
  ];
  assertEquals(parseInterpretResponse(content).kind, "car_purchase");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/claudeClient.test.ts`
Expected: FAIL — the `log_expense` block currently returns `car_purchase` (parser does not branch on tool name yet).

- [ ] **Step 3: Add the `ExpenseExtraction` type and extend the union + parser**

In `claudeClient.ts`, after the `ReceiptExtraction` interface add:
```ts
export interface ExpenseExtraction {
  matchedCarIds: string[];
  description: string | null;
  amount: number | null;
  labor: number | null;
  category: string | null;
}
```

Change the `InterpretResult` type to:
```ts
export type InterpretResult =
  | { kind: "car_purchase"; data: CarPurchaseExtraction }
  | { kind: "expense"; data: ExpenseExtraction }
  | { kind: "reply"; text: string };
```

Replace the `toolUse` branch inside `parseInterpretResponse` (the `if (toolUse) { ... }` block) with:
```ts
  if (toolUse) {
    if (toolUse.name === "log_expense") {
      return { kind: "expense", data: toolUse.input as unknown as ExpenseExtraction };
    }
    return { kind: "car_purchase", data: toolUse.input as unknown as CarPurchaseExtraction };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/claudeClient.test.ts`
Expected: PASS (6 tests: the 4 existing + 2 new).

- [ ] **Step 5: Add the `log_expense` tool and inventory to `interpretMessage`**

Update the `AGENT_SYSTEM_PROMPT` constant — replace it with:
```ts
const AGENT_SYSTEM_PROMPT =
  "You are the assistant for a car-flip inventory Telegram bot. You help the user with: " +
  "(1) registering a car they bought, (2) deleting a car, (3) logging expenses spent on a car they own. " +
  "If the message clearly describes buying a car (with model, year, and price), call extract_car_purchase. " +
  "If the message describes spending money on a part, repair, service, or fee for a car they already own " +
  "(with or without a receipt), call log_expense: put the part/item cost in amount, any separately-mentioned " +
  "labor in labor (else null), a short item name in description, your best category guess in category, and the " +
  "ids of any inventory cars that could match in matchedCarIds. Otherwise, reply with a short, friendly message " +
  "in the SAME language the user wrote in. If intent is unclear or key info is missing, ask one brief clarifying " +
  "question instead of guessing. Never reply with the literal word \"unknown\". For thanks or greetings, respond " +
  "warmly and briefly. If asked what you can do, list the three capabilities in one or two sentences. Keep replies concise.";
```

Replace the `interpretMessage` function signature and body with:
```ts
  async function interpretMessage(
    messageText: string,
    today: string,
    cars: { id: string; year: string; model: string }[] = [],
  ): Promise<InterpretResult> {
    const inventory = cars.length
      ? cars.map((car) => `- id: ${car.id}, ${car.year} ${car.model}`).join("\n")
      : "(no cars in inventory)";
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: `${AGENT_SYSTEM_PROMPT}\n\nCurrent inventory (match expenses to one of these car ids):\n${inventory}`,
        tools: [
          {
            name: "extract_car_purchase",
            description:
              "Extract the details of a car purchase the user describes. Only call this when the message clearly describes buying a car AND includes the model, year, and purchase price.",
            input_schema: {
              type: "object",
              properties: {
                model: { type: ["string", "null"], description: "The vehicle's make and model, e.g. 'Ford Mustang'" },
                year: { type: ["string", "null"], description: "The model year, e.g. '2018'" },
                purchasePrice: { type: ["number", "null"], description: "The purchase price in US dollars" },
                purchaseDate: {
                  type: ["string", "null"],
                  description: `The purchase date in YYYY-MM-DD format. If the message says "today" or omits a date, use ${today}.`,
                },
              },
              required: ["model", "year", "purchasePrice", "purchaseDate"],
            },
          },
          {
            name: "log_expense",
            description:
              "Log money spent on a car the user already owns (a part, repair, service, or fee), with or without a receipt.",
            input_schema: {
              type: "object",
              properties: {
                matchedCarIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "IDs from the inventory that the expense could belong to (empty if none clearly match).",
                },
                description: { type: ["string", "null"], description: "Short item/service name, e.g. 'ABS sensor'." },
                amount: { type: ["number", "null"], description: "The part/item cost in USD, excluding labor." },
                labor: { type: ["number", "null"], description: "The labor cost in USD if mentioned, else null." },
                category: {
                  type: ["string", "null"],
                  description:
                    "One of: repairCost, partsCost, transportCost, adminFees, titleFees, taxes, detailingCost, advertisingCost, repoCost, miscCost. Null if unclear.",
                },
              },
              required: ["matchedCarIds", "description", "amount", "labor", "category"],
            },
          },
        ],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: messageText }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Anthropic API failed: ${response.status} ${await response.text()}`);
    }
    const result = await response.json();
    return parseInterpretResponse(result.content as Array<Record<string, unknown>>);
  }
```

(The `return { extractCarPurchase, readReceipt, interpretMessage };` line is unchanged.)

- [ ] **Step 6: Type-check and re-run tests**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno check --node-modules-dir=none supabase/functions/telegram-webhook/lib/claudeClient.ts && deno test supabase/functions/telegram-webhook/lib/claudeClient.test.ts`
Expected: `Check …claudeClient.ts` clean; 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/claudeClient.ts supabase/functions/telegram-webhook/lib/claudeClient.test.ts
git commit -m "feat: add log_expense tool and expense variant to the agent"
```

---

### Task 3: `handlers.ts` + `expenseLogic.ts` — route and save itemized expenses

**Files:**
- Modify: `supabase/functions/telegram-webhook/lib/expenseLogic.ts`
- Modify: `supabase/functions/telegram-webhook/lib/handlers.ts`

**Interfaces:**
- Consumes: `interpretMessage(text, today, cars)` and the `expense` variant (Task 2); `applyExpenseItemToCarData`, `formatExpenseItemConfirmation`, `ExpenseLineItem` (Task 1); existing `advanceExpenseDraft`, `applyExpenseToCarData`, `getExpenseCategoryLabel`, `parseYesNo`.
- Produces: no new exports; extends `ExpenseDraft` and the `expense_confirm` behavior.

- [ ] **Step 1: Extend `ExpenseDraft` with optional line-item fields**

In `supabase/functions/telegram-webhook/lib/expenseLogic.ts`, change the `ExpenseDraft` interface to:
```ts
export interface ExpenseDraft {
  carId: string | null;
  candidateCars: { id: string; year: string; model: string }[];
  amount: number | null;
  category: string | null;
  description?: string | null;
  labor?: number | null;
}
```
(The optional fields are absent for the photo flow, so nothing else changes.)

- [ ] **Step 2: Import the line-item helpers into `handlers.ts`**

In `supabase/functions/telegram-webhook/lib/handlers.ts`, after the `import { isDeleteCommand } from "./intent.ts";` line add:
```ts
import { applyExpenseItemToCarData, formatExpenseItemConfirmation, type ExpenseLineItem } from "./expenseItem.ts";
```

- [ ] **Step 3: Replace `handleTextMessage` to list cars and route the expense variant**

Replace the entire `handleTextMessage` function with:
```ts
async function handleTextMessage(deps: Deps, text: string): Promise<void> {
  const { telegram, claude, supabase, chatId } = deps;
  if (isDeleteCommand(text)) {
    await startDeleteFlow(deps);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const cars = await supabase.listCars();
  const carSummaries = cars.map((car) => ({
    id: car.id,
    year: String((car.data as Record<string, unknown>).year ?? ""),
    model: String((car.data as Record<string, unknown>).model ?? ""),
  }));
  const interpreted = await claude.interpretMessage(text, today, carSummaries);

  if (interpreted.kind === "reply") {
    await telegram.sendMessage(chatId, interpreted.text);
    return;
  }

  if (interpreted.kind === "expense") {
    const expense = interpreted.data;
    const candidateCars = carSummaries.filter((car) => expense.matchedCarIds.includes(car.id));
    const draft: ExpenseDraft = {
      carId: candidateCars.length === 1 ? candidateCars[0].id : null,
      candidateCars,
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
      labor: expense.labor,
    };
    await advanceExpenseDraft(deps, draft);
    return;
  }

  const extraction = interpreted.data;
  const draft: CarPurchaseDraft = {
    model: extraction.model,
    year: extraction.year,
    purchasePrice: extraction.purchasePrice,
    purchaseDate: extraction.purchaseDate,
  };

  if (!isCarPurchaseDraftComplete(draft)) {
    await telegram.sendMessage(
      chatId,
      'Necesito el modelo, el año y el precio de compra. Por ejemplo: "compré un Ford Mustang 2018 en $8500".',
    );
    return;
  }

  await supabase.setPendingAction(chatId, "new_car_confirm", draft as unknown as Record<string, unknown>);
  await telegram.sendMessage(
    chatId,
    `Got it: ${draft.year} ${draft.model}, purchased for $${draft.purchasePrice} on ${draft.purchaseDate}. Confirm? (yes/no)`,
  );
}
```

- [ ] **Step 4: Show the itemized confirmation in `advanceExpenseDraft`**

In `advanceExpenseDraft`, replace the final block (from `const car = (await supabase.listCars())…` through the closing of the function) with:
```ts
  const car = (await supabase.listCars()).find((entry) => entry.id === draft.carId);
  const carLabel = car
    ? `${(car.data as Record<string, unknown>).year} ${(car.data as Record<string, unknown>).model}`
    : "the selected vehicle";

  await supabase.setPendingAction(chatId, "expense_confirm", draft as unknown as Record<string, unknown>);
  if (draft.description) {
    await telegram.sendMessage(
      chatId,
      formatExpenseItemConfirmation(carLabel, draft.description, draft.category!, draft.amount!, draft.labor ?? 0),
    );
  } else {
    await telegram.sendMessage(
      chatId,
      `$${draft.amount} for ${getExpenseCategoryLabel(draft.category!)} on the ${carLabel}. Confirm? (yes/no)`,
    );
  }
}
```

- [ ] **Step 5: Save a line item on confirm in the `expense_confirm` case**

In `resolvePending`, replace the body of `case "expense_confirm": { … }` (after the `if (!car) { … }` guard) — i.e. replace these two lines:
```ts
      const updatedData = applyExpenseToCarData(car.data, draft.category!, draft.amount!);
      await supabase.updateCarData(draft.carId!, updatedData);
      await telegram.sendMessage(chatId, `Saved: $${draft.amount} added to ${getExpenseCategoryLabel(draft.category!)}.`);
```
with:
```ts
      if (draft.description) {
        const item: ExpenseLineItem = {
          id: crypto.randomUUID(),
          description: draft.description,
          category: draft.category!,
          amount: draft.amount!,
          labor: draft.labor ?? 0,
          date: new Date().toISOString().slice(0, 10),
        };
        const updatedData = applyExpenseItemToCarData(car.data, item);
        await supabase.updateCarData(draft.carId!, updatedData);
        const total = item.amount + item.labor;
        const carLabel = `${(car.data as Record<string, unknown>).year} ${(car.data as Record<string, unknown>).model}`;
        await telegram.sendMessage(chatId, `Saved: ${item.description} ($${total}) on the ${carLabel}.`);
      } else {
        const updatedData = applyExpenseToCarData(car.data, draft.category!, draft.amount!);
        await supabase.updateCarData(draft.carId!, updatedData);
        await telegram.sendMessage(chatId, `Saved: $${draft.amount} added to ${getExpenseCategoryLabel(draft.category!)}.`);
      }
```

- [ ] **Step 6: Type-check**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno check --node-modules-dir=none supabase/functions/telegram-webhook/lib/handlers.ts`
Expected: `Check …handlers.ts` with no errors.

- [ ] **Step 7: Run the full lib suite (no regressions)**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/`
Expected: all existing tests plus Task 1's 7 and Task 2's 2 new tests PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/expenseLogic.ts supabase/functions/telegram-webhook/lib/handlers.ts
git commit -m "feat: log itemized expenses from text through the expense flow"
```

---

### Task 4: Deploy + smoke verification

**Files:** none (deployment + live checks).

- [ ] **Step 1: Deploy the function**

Redeploy `telegram-webhook` (entrypoint `index.ts`, `verify_jwt=false`) with the 10 source files: `index.ts` + `lib/{telegramClient,claudeClient,supabaseClient,carDraft,expenseLogic,costFields,intent,expenseItem,handlers}.ts`. (Test files are NOT deployed.) `index.ts` is unchanged.

- [ ] **Step 2: Smoke — itemized expense from text**

POST an itemized expense mentioning a real inventory car (use a model that exists, e.g. a Mustang) from the authorized chat:
```bash
curl -sS -X POST "https://nmxbnvmpoupdwcvqzsaj.supabase.co/functions/v1/telegram-webhook" \
  -H "Content-Type: application/json" \
  -d '{"update_id":999300,"message":{"message_id":9300,"from":{"id":7841617429,"is_bot":false,"first_name":"Test"},"chat":{"id":7841617429,"type":"private"},"date":1783300000,"text":"compré un sensor ABS por 300 dólares y 80 de labor para el mustang ecoboost premium"}}'
```
Then verify a pending row `kind='expense_confirm'` exists whose payload has `description` set and `labor=80`, OR (if the car matched ambiguously) a `car_disambiguation`/`category_disambiguation` row — confirm the flow advanced without error. Query `bot_pending_actions` for chat `7841617429`.

- [ ] **Step 3: Smoke — confirm writes a line item**

Drive the confirm by simulating the user's "yes" reply (only if step 2 left an `expense_confirm` row; if it stopped at a disambiguation, first reply with the appropriate number, then yes):
```bash
curl -sS -X POST "https://nmxbnvmpoupdwcvqzsaj.supabase.co/functions/v1/telegram-webhook" \
  -H "Content-Type: application/json" \
  -d '{"update_id":999301,"message":{"message_id":9301,"from":{"id":7841617429,"is_bot":false,"first_name":"Test"},"chat":{"id":7841617429,"type":"private"},"date":1783300000,"text":"yes"}}'
```
Then verify with SQL that the matched car's `data->'expenses'` now contains the "ABS sensor" item and that `partsCost` increased by 300 and `repairCost` by 80 versus before. Record the before/after totals.

- [ ] **Step 4: Record progress**

Update `.superpowers/sdd/progress.md` with the Phase A status (deployed + smoke result). Note: this is a real user-facing write — if the smoke test created a real line item on a real car, tell the user which car/amount so they can remove it if unwanted.

---

## Self-Review

- **Spec coverage:** line-item data model + apply rule augmenting category totals (Task 1) ✓; labor→repairCost, part→category (Task 1) ✓; `log_expense` tool + expense variant + inventory injection (Task 2) ✓; route expense through the existing disambiguation/confirm machine with description+labor threaded (Task 3) ✓; itemized confirmation mini-table (Task 1 formatter + Task 3 wiring) ✓; save appends line item + updates totals behind yes/no (Task 3 Step 5) ✓; photo flow untouched (no change to handleReceiptPhoto/readReceipt/applyExpenseToCarData) ✓; deploy + smoke incl. line-item write verification (Task 4) ✓.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `ExpenseLineItem` fields {id,description,category,amount,labor,date} used identically in Task 1 apply/format, Task 3 construction; `ExpenseExtraction` {matchedCarIds,description,amount,labor,category} produced in Task 2 and consumed in Task 3's draft build; `ExpenseDraft` optional `description`/`labor` added in Task 3 Step 1 and read in Steps 3–5; `interpretMessage(text, today, cars?)` defined in Task 2 and called with 3 args in Task 3; `applyExpenseItemToCarData(carData, item)` and `formatExpenseItemConfirmation(carLabel, description, category, amount, labor)` signatures match between Task 1 and Task 3.
- **Backward-compat check:** `getInvestment` unaffected (category totals still incremented); `emptyCar`/frontend not required for Phase A (a car with an `expenses` array still renders its totals). Phase B adds the frontend `expenses: []` default and display.
