# Telegram AI Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Telegram bot, backed by a Supabase Edge Function and Claude, that lets the user create a vehicle from a text message and log an expense from a receipt photo, with confirmation and disambiguation built in.

**Architecture:** A single Supabase Edge Function (`telegram-webhook`, Deno/TypeScript) receives every Telegram update. Pure decision logic (which field is still missing, how to fold an expense into a car's cost data, how to build a new car record) lives in small, unit-tested modules with zero I/O. Thin client wrappers talk to Telegram, Claude, and Supabase. A new `bot_pending_actions` table holds multi-turn conversation state between stateless invocations.

**Tech Stack:** Supabase Edge Functions (Deno), `@supabase/supabase-js` (via `npm:` specifier), the Anthropic Messages API (via `fetch`, no SDK), the Telegram Bot API (via `fetch`). No changes to the existing Vite/React frontend.

## Global Constraints

- Supabase project: `nmxbnvmpoupdwcvqzsaj` ("Flip car tracker") — the same project the dashboard already uses.
- No changes to the existing `public.cars` table's shape or the frontend's Supabase calls.
- The only schema addition is `public.bot_pending_actions`, with RLS enabled and no policies (service-role-only access).
- The bot only acts on updates from the chat ID in the `TELEGRAM_AUTHORIZED_CHAT_ID` secret — anything else is silently ignored (`200 OK`, no reply).
- Every save (new car, expense) requires an explicit "yes" confirmation from the user first — never auto-save.
- Expense category options are exactly these 10 keys (mirrors `COST_FIELDS` in `src/lib/carCalculations.js`, excluding `auctionPrice`): `repairCost`, `partsCost`, `transportCost`, `adminFees`, `titleFees`, `taxes`, `detailingCost`, `advertisingCost`, `repoCost`, `miscCost`.
- A new car's `data` must match the frontend's `emptyCar` shape (all fields present, empty string where not applicable) so the dashboard renders it identically to a car created through the UI.
- No automated tests for the I/O wrapper modules (Telegram/Claude/Supabase clients) — they're thin enough to verify via `deno check` (type-checking) and the final manual Telegram test. Pure logic modules get real `deno test` unit tests.

---

### Task 1: Install Deno, create and apply the `bot_pending_actions` migration

**Files:**
- Create: `supabase/migrations/20260705120000_create_bot_pending_actions.sql`

**Interfaces:**
- Produces (consumed by later tasks): the `public.bot_pending_actions` table with columns `id` (uuid, PK), `chat_id` (text), `kind` (text), `payload` (jsonb), `created_at` (timestamptz).

- [ ] **Step 1: Install the Deno CLI**

Run: `curl -fsSL https://deno.land/install.sh | sh`
Expected: installs to `~/.deno`, prints the install location and a note to add it to `PATH`.

Then run: `~/.deno/bin/deno --version`
Expected: prints a Deno version (e.g. `deno 2.x.x`), confirming the install worked. Use this full path (or add `~/.deno/bin` to `PATH` for the rest of this session) for every `deno` command in this plan.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260705120000_create_bot_pending_actions.sql`:

```sql
create table public.bot_pending_actions (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.bot_pending_actions enable row level security;
```

- [ ] **Step 3: Apply the migration to the remote project**

Use the `apply_migration` tool with:
- `project_id`: `nmxbnvmpoupdwcvqzsaj`
- `name`: `create_bot_pending_actions`
- `query`: the exact SQL from Step 2

- [ ] **Step 4: Verify the table exists**

Use the `list_tables` tool with `project_id: nmxbnvmpoupdwcvqzsaj`, `schemas: ["public"]`, `verbose: true`.
Expected: the result includes `public.bot_pending_actions` with `rls_enabled: true` and columns `id`, `chat_id`, `kind`, `payload`, `created_at`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260705120000_create_bot_pending_actions.sql
git commit -m "feat: add bot_pending_actions table for Telegram bot conversation state"
```

---

### Task 2: `costFields.ts` — expense category constants (pure, tested)

**Files:**
- Create: `supabase/functions/telegram-webhook/lib/costFields.ts`
- Test: `supabase/functions/telegram-webhook/lib/costFields.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3 and 6): `EXPENSE_COST_FIELDS: { key: string; label: string }[]` (10 entries, excludes `auctionPrice`), `isValidExpenseCategory(key: string | null | undefined) -> boolean`, `getExpenseCategoryLabel(key: string) -> string`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/telegram-webhook/lib/costFields.test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EXPENSE_COST_FIELDS, getExpenseCategoryLabel, isValidExpenseCategory } from "./costFields.ts";

Deno.test("EXPENSE_COST_FIELDS has exactly 10 categories, excluding auctionPrice", () => {
  assertEquals(EXPENSE_COST_FIELDS.length, 10);
  assertEquals(
    EXPENSE_COST_FIELDS.some((field) => field.key === "auctionPrice"),
    false,
  );
});

Deno.test("isValidExpenseCategory accepts known keys and rejects unknown/null/undefined", () => {
  assertEquals(isValidExpenseCategory("partsCost"), true);
  assertEquals(isValidExpenseCategory("auctionPrice"), false);
  assertEquals(isValidExpenseCategory("notARealCategory"), false);
  assertEquals(isValidExpenseCategory(null), false);
  assertEquals(isValidExpenseCategory(undefined), false);
});

Deno.test("getExpenseCategoryLabel returns the human label for a known key, or the key itself otherwise", () => {
  assertEquals(getExpenseCategoryLabel("partsCost"), "Parts");
  assertEquals(getExpenseCategoryLabel("detailingCost"), "Detailing / Cleaning");
  assertEquals(getExpenseCategoryLabel("unknownKey"), "unknownKey");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/telegram-webhook/lib/costFields.test.ts`
Expected: FAIL — `Module not found` for `./costFields.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/telegram-webhook/lib/costFields.ts`:

```typescript
export interface CostField {
  key: string;
  label: string;
}

export const EXPENSE_COST_FIELDS: CostField[] = [
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

export function isValidExpenseCategory(key: string | null | undefined): boolean {
  if (!key) return false;
  return EXPENSE_COST_FIELDS.some((field) => field.key === key);
}

export function getExpenseCategoryLabel(key: string): string {
  const field = EXPENSE_COST_FIELDS.find((f) => f.key === key);
  return field ? field.label : key;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/telegram-webhook/lib/costFields.test.ts`
Expected: PASS — 3 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/costFields.ts supabase/functions/telegram-webhook/lib/costFields.test.ts
git commit -m "feat: add expense cost category constants"
```

---

### Task 3: `expenseLogic.ts` — expense state-machine logic (pure, tested)

**Files:**
- Create: `supabase/functions/telegram-webhook/lib/expenseLogic.ts`
- Test: `supabase/functions/telegram-webhook/lib/expenseLogic.test.ts`

**Interfaces:**
- Consumes from Task 2: `EXPENSE_COST_FIELDS` from `./costFields.ts`.
- Produces (consumed by Task 6): `ExpenseDraft` type (`{ carId: string | null; candidateCars: { id: string; year: string; model: string }[]; amount: number | null; category: string | null }`), `getNextMissingField(draft: ExpenseDraft) -> "car" | "amount" | "category" | null`, `applyExpenseToCarData(carData: Record<string, unknown>, category: string, amount: number) -> Record<string, unknown>`, `formatCarDisambiguationList(cars: {id,year,model}[]) -> string`, `formatCategoryDisambiguationList() -> string`, `parseListSelection(text: string, optionCount: number) -> number | null`, `parseYesNo(text: string) -> "yes" | "no" | null`, `parseAmount(text: string) -> number | null`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/telegram-webhook/lib/expenseLogic.test.ts`:

```typescript
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyExpenseToCarData,
  formatCarDisambiguationList,
  formatCategoryDisambiguationList,
  getNextMissingField,
  parseAmount,
  parseListSelection,
  parseYesNo,
  type ExpenseDraft,
} from "./expenseLogic.ts";

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    carId: "car-1",
    candidateCars: [],
    amount: 220,
    category: "partsCost",
    ...overrides,
  };
}

Deno.test("getNextMissingField: car missing when carId is null", () => {
  assertEquals(getNextMissingField(draft({ carId: null })), "car");
});

Deno.test("getNextMissingField: amount missing when carId is set but amount is null", () => {
  assertEquals(getNextMissingField(draft({ amount: null })), "amount");
});

Deno.test("getNextMissingField: category missing when carId and amount are set but category is null", () => {
  assertEquals(getNextMissingField(draft({ category: null })), "category");
});

Deno.test("getNextMissingField: null (nothing missing) when everything is set", () => {
  assertEquals(getNextMissingField(draft()), null);
});

Deno.test("applyExpenseToCarData adds to an existing numeric string value", () => {
  const result = applyExpenseToCarData({ partsCost: "100" }, "partsCost", 50);
  assertEquals(result.partsCost, 150);
});

Deno.test("applyExpenseToCarData treats a missing/empty field as 0", () => {
  const result = applyExpenseToCarData({ partsCost: "" }, "partsCost", 75);
  assertEquals(result.partsCost, 75);
});

Deno.test("applyExpenseToCarData preserves other fields unchanged", () => {
  const result = applyExpenseToCarData({ partsCost: "10", model: "Mustang" }, "partsCost", 5);
  assertEquals(result.model, "Mustang");
});

Deno.test("formatCarDisambiguationList numbers each car starting at 1", () => {
  const list = formatCarDisambiguationList([
    { id: "a", year: "2018", model: "Mustang" },
    { id: "b", year: "2020", model: "Mustang GT" },
  ]);
  assertEquals(list, "1) 2018 Mustang\n2) 2020 Mustang GT");
});

Deno.test("formatCategoryDisambiguationList lists all 10 categories numbered", () => {
  const list = formatCategoryDisambiguationList();
  assertEquals(list.split("\n").length, 10);
  assertEquals(list.split("\n")[0], "1) Repairs / Labor");
});

Deno.test("parseListSelection accepts a valid in-range number", () => {
  assertEquals(parseListSelection("2", 3), 2);
});

Deno.test("parseListSelection rejects out-of-range, non-numeric, or decimal input", () => {
  assertEquals(parseListSelection("0", 3), null);
  assertEquals(parseListSelection("4", 3), null);
  assertEquals(parseListSelection("abc", 3), null);
  assertEquals(parseListSelection("1.5", 3), null);
});

Deno.test("parseYesNo recognizes common yes/no variants and rejects anything else", () => {
  assertEquals(parseYesNo("yes"), "yes");
  assertEquals(parseYesNo("Y"), "yes");
  assertEquals(parseYesNo("si"), "yes");
  assertEquals(parseYesNo("no"), "no");
  assertEquals(parseYesNo("cancel"), "no");
  assertEquals(parseYesNo("maybe"), null);
});

Deno.test("parseAmount extracts a positive number, ignoring currency symbols", () => {
  assertEquals(parseAmount("$220"), 220);
  assertEquals(parseAmount("220.50"), 220.5);
  assertEquals(parseAmount("not a number"), null);
  assertEquals(parseAmount("-5"), null);
  assertEquals(parseAmount("0"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/telegram-webhook/lib/expenseLogic.test.ts`
Expected: FAIL — `Module not found` for `./expenseLogic.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/telegram-webhook/lib/expenseLogic.ts`:

```typescript
import { EXPENSE_COST_FIELDS } from "./costFields.ts";

export interface ExpenseDraft {
  carId: string | null;
  candidateCars: { id: string; year: string; model: string }[];
  amount: number | null;
  category: string | null;
}

export type MissingField = "car" | "amount" | "category" | null;

export function getNextMissingField(draft: ExpenseDraft): MissingField {
  if (!draft.carId) return "car";
  if (draft.amount === null || draft.amount === undefined) return "amount";
  if (!draft.category) return "category";
  return null;
}

export function applyExpenseToCarData(
  carData: Record<string, unknown>,
  category: string,
  amount: number,
): Record<string, unknown> {
  const currentValue = Number(carData[category] || 0);
  return {
    ...carData,
    [category]: currentValue + amount,
  };
}

export function formatCarDisambiguationList(cars: { id: string; year: string; model: string }[]): string {
  return cars.map((car, index) => `${index + 1}) ${car.year} ${car.model}`).join("\n");
}

export function formatCategoryDisambiguationList(): string {
  return EXPENSE_COST_FIELDS.map((field, index) => `${index + 1}) ${field.label}`).join("\n");
}

export function parseListSelection(text: string, optionCount: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (parsed < 1 || parsed > optionCount) return null;
  return parsed;
}

export function parseYesNo(text: string): "yes" | "no" | null {
  const normalized = text.trim().toLowerCase();
  if (["yes", "y", "si", "sí", "confirm", "confirmo"].includes(normalized)) return "yes";
  if (["no", "n", "cancel", "cancelar"].includes(normalized)) return "no";
  return null;
}

export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/telegram-webhook/lib/expenseLogic.test.ts`
Expected: PASS — 13 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/expenseLogic.ts supabase/functions/telegram-webhook/lib/expenseLogic.test.ts
git commit -m "feat: add expense draft state-machine logic"
```

---

### Task 4: `carDraft.ts` — new car record builder (pure, tested)

**Files:**
- Create: `supabase/functions/telegram-webhook/lib/carDraft.ts`
- Test: `supabase/functions/telegram-webhook/lib/carDraft.test.ts`

**Interfaces:**
- Produces (consumed by Task 6): `CarPurchaseDraft` type (`{ model: string | null; year: string | null; purchasePrice: number | null; purchaseDate: string | null }`), `isCarPurchaseDraftComplete(draft: CarPurchaseDraft) -> boolean`, `buildNewCarRecord(draft: CarPurchaseDraft) -> Record<string, unknown>` (throws if incomplete).

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/telegram-webhook/lib/carDraft.test.ts`:

```typescript
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildNewCarRecord, isCarPurchaseDraftComplete, type CarPurchaseDraft } from "./carDraft.ts";

const completeDraft: CarPurchaseDraft = {
  model: "Ford Mustang",
  year: "2018",
  purchasePrice: 8500,
  purchaseDate: "2026-07-03",
};

Deno.test("isCarPurchaseDraftComplete: true when model, year, and purchasePrice are all present", () => {
  assertEquals(isCarPurchaseDraftComplete(completeDraft), true);
});

Deno.test("isCarPurchaseDraftComplete: false when model is missing", () => {
  assertEquals(isCarPurchaseDraftComplete({ ...completeDraft, model: null }), false);
});

Deno.test("isCarPurchaseDraftComplete: false when year is missing", () => {
  assertEquals(isCarPurchaseDraftComplete({ ...completeDraft, year: null }), false);
});

Deno.test("isCarPurchaseDraftComplete: false when purchasePrice is missing", () => {
  assertEquals(isCarPurchaseDraftComplete({ ...completeDraft, purchasePrice: null }), false);
});

Deno.test("isCarPurchaseDraftComplete: true even when purchaseDate is missing (not required)", () => {
  assertEquals(isCarPurchaseDraftComplete({ ...completeDraft, purchaseDate: null }), true);
});

Deno.test("buildNewCarRecord maps the draft onto the full emptyCar-shaped record", () => {
  const record = buildNewCarRecord(completeDraft);
  assertEquals(record.model, "Ford Mustang");
  assertEquals(record.year, "2018");
  assertEquals(record.auctionPrice, "8500");
  assertEquals(record.purchaseDate, "2026-07-03");
  assertEquals(record.status, "available");
  assertEquals(record.saleType, "cash");
  assertEquals(record.repairCost, "");
  assertEquals(record.notes, "");
  assertEquals("id" in record, false);
});

Deno.test("buildNewCarRecord defaults purchaseDate to an empty string when not provided", () => {
  const record = buildNewCarRecord({ ...completeDraft, purchaseDate: null });
  assertEquals(record.purchaseDate, "");
});

Deno.test("buildNewCarRecord throws when the draft is incomplete", () => {
  assertThrows(() => buildNewCarRecord({ ...completeDraft, model: null }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/telegram-webhook/lib/carDraft.test.ts`
Expected: FAIL — `Module not found` for `./carDraft.ts`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/telegram-webhook/lib/carDraft.ts`:

```typescript
export interface CarPurchaseDraft {
  model: string | null;
  year: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
}

export function isCarPurchaseDraftComplete(draft: CarPurchaseDraft): boolean {
  return Boolean(draft.model) && Boolean(draft.year) && draft.purchasePrice !== null && draft.purchasePrice !== undefined;
}

const EMPTY_CAR_DATA_TEMPLATE: Record<string, string> = {
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

export function buildNewCarRecord(draft: CarPurchaseDraft): Record<string, unknown> {
  if (!isCarPurchaseDraftComplete(draft)) {
    throw new Error("Cannot build a car record from an incomplete draft");
  }
  return {
    ...EMPTY_CAR_DATA_TEMPLATE,
    model: draft.model,
    year: draft.year,
    auctionPrice: String(draft.purchasePrice),
    purchaseDate: draft.purchaseDate ?? "",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/telegram-webhook/lib/carDraft.test.ts`
Expected: PASS — 8 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/carDraft.ts supabase/functions/telegram-webhook/lib/carDraft.test.ts
git commit -m "feat: add new car record builder"
```

---

### Task 5: I/O client wrappers — Telegram, Claude, Supabase

**Files:**
- Create: `supabase/functions/telegram-webhook/lib/telegramClient.ts`
- Create: `supabase/functions/telegram-webhook/lib/claudeClient.ts`
- Create: `supabase/functions/telegram-webhook/lib/supabaseClient.ts`

**Interfaces:**
- Produces (consumed by Task 6):
  - `createTelegramClient(botToken: string) -> { sendMessage(chatId: string, text: string): Promise<void>; downloadPhoto(fileId: string): Promise<Uint8Array> }`
  - `createClaudeClient(apiKey: string) -> { extractCarPurchase(messageText: string, today: string): Promise<{ model, year, purchasePrice, purchaseDate }>; readReceipt(imageBase64: string, mediaType: string, captionText: string, cars: {id,year,model}[]): Promise<{ matchedCarIds: string[]; amount: number | null; category: string | null }> }`
  - `createAppSupabaseClient(url: string, serviceRoleKey: string) -> { getPendingAction(chatId): Promise<PendingAction | null>; setPendingAction(chatId, kind, payload): Promise<void>; clearPendingAction(chatId): Promise<void>; listCars(): Promise<{id, data}[]>; insertCar(carData): Promise<string>; updateCarData(carId, carData): Promise<void> }`, and the `PendingAction` type (`{ id: string; chatId: string; kind: string; payload: Record<string, unknown> }`).

These are network-calling wrappers with no meaningful branching logic — verified via `deno check` (type-checking), not unit tests, per this plan's global constraints.

- [ ] **Step 1: Create the Telegram client**

Create `supabase/functions/telegram-webhook/lib/telegramClient.ts`:

```typescript
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const TELEGRAM_FILE_BASE = "https://api.telegram.org/file/bot";

export function createTelegramClient(botToken: string) {
  const base = `${TELEGRAM_API_BASE}${botToken}`;

  async function sendMessage(chatId: string, text: string): Promise<void> {
    const response = await fetch(`${base}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
    }
  }

  async function downloadPhoto(fileId: string): Promise<Uint8Array> {
    const fileInfoResponse = await fetch(`${base}/getFile?file_id=${fileId}`);
    if (!fileInfoResponse.ok) {
      throw new Error(`Telegram getFile failed: ${fileInfoResponse.status}`);
    }
    const fileInfo = await fileInfoResponse.json();
    const filePath = fileInfo.result.file_path;
    const fileResponse = await fetch(`${TELEGRAM_FILE_BASE}${botToken}/${filePath}`);
    if (!fileResponse.ok) {
      throw new Error(`Telegram file download failed: ${fileResponse.status}`);
    }
    const buffer = await fileResponse.arrayBuffer();
    return new Uint8Array(buffer);
  }

  return { sendMessage, downloadPhoto };
}
```

- [ ] **Step 2: Create the Claude client**

Create `supabase/functions/telegram-webhook/lib/claudeClient.ts`:

```typescript
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-5";

export interface CarPurchaseExtraction {
  model: string | null;
  year: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
}

export interface ReceiptExtraction {
  matchedCarIds: string[];
  amount: number | null;
  category: string | null;
}

export function createClaudeClient(apiKey: string) {
  async function callTool(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Anthropic API failed: ${response.status} ${await response.text()}`);
    }
    const result = await response.json();
    const toolUse = (result.content as Array<Record<string, unknown>>)?.find(
      (block) => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error("Anthropic response did not include a tool_use block");
    }
    return toolUse.input as Record<string, unknown>;
  }

  async function extractCarPurchase(messageText: string, today: string): Promise<CarPurchaseExtraction> {
    const input = await callTool({
      model: MODEL,
      max_tokens: 1024,
      tools: [
        {
          name: "extract_car_purchase",
          description:
            "Extract the details of a car purchase described in a free-form message. Use null for any field that cannot be determined from the message.",
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
      ],
      tool_choice: { type: "tool", name: "extract_car_purchase" },
      messages: [{ role: "user", content: messageText }],
    });
    return input as unknown as CarPurchaseExtraction;
  }

  async function readReceipt(
    imageBase64: string,
    mediaType: string,
    captionText: string,
    cars: { id: string; year: string; model: string }[],
  ): Promise<ReceiptExtraction> {
    const carList = cars.map((car) => `- id: ${car.id}, ${car.year} ${car.model}`).join("\n");
    const input = await callTool({
      model: MODEL,
      max_tokens: 1024,
      tools: [
        {
          name: "read_receipt",
          description:
            "Read a receipt photo and match it to one of the given vehicles based on the accompanying message and the vehicle list. Return every vehicle id that could plausibly match if more than one is a real candidate; return an empty array if none match.",
          input_schema: {
            type: "object",
            properties: {
              matchedCarIds: {
                type: "array",
                items: { type: "string" },
                description: "IDs of vehicles from the provided list that could match the message/receipt.",
              },
              amount: { type: ["number", "null"], description: "The total amount on the receipt in US dollars." },
              category: {
                type: ["string", "null"],
                description:
                  "One of: repairCost, partsCost, transportCost, adminFees, titleFees, taxes, detailingCost, advertisingCost, repoCost, miscCost. Null if unclear.",
              },
            },
            required: ["matchedCarIds", "amount", "category"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "read_receipt" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            {
              type: "text",
              text: `Message from the user: "${captionText}"\n\nVehicles currently in inventory:\n${carList}`,
            },
          ],
        },
      ],
    });
    return input as unknown as ReceiptExtraction;
  }

  return { extractCarPurchase, readReceipt };
}
```

- [ ] **Step 3: Create the Supabase client**

Create `supabase/functions/telegram-webhook/lib/supabaseClient.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

export interface PendingAction {
  id: string;
  chatId: string;
  kind: string;
  payload: Record<string, unknown>;
}

export function createAppSupabaseClient(url: string, serviceRoleKey: string) {
  const client = createClient(url, serviceRoleKey);

  async function getPendingAction(chatId: string): Promise<PendingAction | null> {
    const { data, error } = await client
      .from("bot_pending_actions")
      .select("id, chat_id, kind, payload")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`getPendingAction failed: ${error.message}`);
    if (!data) return null;
    return { id: data.id, chatId: data.chat_id, kind: data.kind, payload: data.payload };
  }

  async function setPendingAction(chatId: string, kind: string, payload: Record<string, unknown>): Promise<void> {
    await clearPendingAction(chatId);
    const { error } = await client.from("bot_pending_actions").insert([{ chat_id: chatId, kind, payload }]);
    if (error) throw new Error(`setPendingAction failed: ${error.message}`);
  }

  async function clearPendingAction(chatId: string): Promise<void> {
    const { error } = await client.from("bot_pending_actions").delete().eq("chat_id", chatId);
    if (error) throw new Error(`clearPendingAction failed: ${error.message}`);
  }

  async function listCars(): Promise<{ id: string; data: Record<string, unknown> }[]> {
    const { data, error } = await client.from("cars").select("id, data");
    if (error) throw new Error(`listCars failed: ${error.message}`);
    return data ?? [];
  }

  async function insertCar(carData: Record<string, unknown>): Promise<string> {
    const { data, error } = await client.from("cars").insert([{ data: carData }]).select("id").single();
    if (error) throw new Error(`insertCar failed: ${error.message}`);
    return data.id;
  }

  async function updateCarData(carId: string, carData: Record<string, unknown>): Promise<void> {
    const { error } = await client.from("cars").update({ data: carData }).eq("id", carId);
    if (error) throw new Error(`updateCarData failed: ${error.message}`);
  }

  return { getPendingAction, setPendingAction, clearPendingAction, listCars, insertCar, updateCarData };
}
```

- [ ] **Step 4: Verify with type-checking**

Run: `deno check supabase/functions/telegram-webhook/lib/telegramClient.ts`
Expected: no type errors.

Run: `deno check supabase/functions/telegram-webhook/lib/claudeClient.ts`
Expected: no type errors.

Run: `deno check supabase/functions/telegram-webhook/lib/supabaseClient.ts`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/telegramClient.ts supabase/functions/telegram-webhook/lib/claudeClient.ts supabase/functions/telegram-webhook/lib/supabaseClient.ts
git commit -m "feat: add Telegram, Claude, and Supabase client wrappers"
```

---

### Task 6: `handlers.ts` + `index.ts` — orchestration

**Files:**
- Create: `supabase/functions/telegram-webhook/lib/handlers.ts`
- Create: `supabase/functions/telegram-webhook/index.ts`

**Interfaces:**
- Consumes from Tasks 2-5: everything exported by `costFields.ts`, `expenseLogic.ts`, `carDraft.ts`, `telegramClient.ts`, `claudeClient.ts`, `supabaseClient.ts` (all under `./lib/` relative to `index.ts`, or `./` relative to `handlers.ts` — see imports below).
- Produces: `handleUpdate(deps: { telegram, claude, supabase, chatId: string, message: Record<string, unknown> }) -> Promise<void>`, used by `index.ts`'s `Deno.serve` handler.

- [ ] **Step 1: Create the orchestration handlers**

Create `supabase/functions/telegram-webhook/lib/handlers.ts`:

```typescript
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import type { createTelegramClient } from "./telegramClient.ts";
import type { createClaudeClient } from "./claudeClient.ts";
import type { createAppSupabaseClient, PendingAction } from "./supabaseClient.ts";
import { buildNewCarRecord, isCarPurchaseDraftComplete, type CarPurchaseDraft } from "./carDraft.ts";
import {
  applyExpenseToCarData,
  formatCarDisambiguationList,
  formatCategoryDisambiguationList,
  getNextMissingField,
  parseAmount,
  parseListSelection,
  parseYesNo,
  type ExpenseDraft,
} from "./expenseLogic.ts";
import { EXPENSE_COST_FIELDS, getExpenseCategoryLabel } from "./costFields.ts";

type TelegramClient = ReturnType<typeof createTelegramClient>;
type ClaudeClient = ReturnType<typeof createClaudeClient>;
type SupabaseClient = ReturnType<typeof createAppSupabaseClient>;

interface Deps {
  telegram: TelegramClient;
  claude: ClaudeClient;
  supabase: SupabaseClient;
  chatId: string;
  message: Record<string, unknown>;
}

export async function handleUpdate(deps: Deps): Promise<void> {
  const { telegram, supabase, chatId, message } = deps;
  const pending = await supabase.getPendingAction(chatId);

  if (pending) {
    await resolvePending(deps, pending);
    return;
  }

  const photos = message.photo as Array<Record<string, unknown>> | undefined;
  if (photos && photos.length > 0) {
    await handleReceiptPhoto(deps, photos);
    return;
  }

  const text = message.text as string | undefined;
  if (text) {
    await handleTextMessage(deps, text);
    return;
  }

  await telegram.sendMessage(
    chatId,
    "I can only handle a text message describing a car purchase, or a photo of a receipt mentioning which car it's for.",
  );
}

async function handleTextMessage(deps: Deps, text: string): Promise<void> {
  const { telegram, claude, supabase, chatId } = deps;
  const today = new Date().toISOString().slice(0, 10);
  const extraction = await claude.extractCarPurchase(text, today);

  const draft: CarPurchaseDraft = {
    model: extraction.model,
    year: extraction.year,
    purchasePrice: extraction.purchasePrice,
    purchaseDate: extraction.purchaseDate,
  };

  if (!isCarPurchaseDraftComplete(draft)) {
    await telegram.sendMessage(
      chatId,
      'I couldn\'t tell the model, year, and purchase price from that. Please tell me again, e.g. "I bought a 2018 Ford Mustang for $8,500".',
    );
    return;
  }

  await supabase.setPendingAction(chatId, "new_car_confirm", draft as unknown as Record<string, unknown>);
  await telegram.sendMessage(
    chatId,
    `Got it: ${draft.year} ${draft.model}, purchased for $${draft.purchasePrice} on ${draft.purchaseDate}. Confirm? (yes/no)`,
  );
}

async function handleReceiptPhoto(deps: Deps, photos: Array<Record<string, unknown>>): Promise<void> {
  const { telegram, claude, supabase, chatId, message } = deps;
  const caption = (message.caption as string | undefined) ?? "";
  const largestPhoto = photos[photos.length - 1];
  const fileId = String(largestPhoto.file_id);

  const fileBytes = await telegram.downloadPhoto(fileId);
  const imageBase64 = encodeBase64(fileBytes);

  const cars = await supabase.listCars();
  const carSummaries = cars.map((car) => ({
    id: car.id,
    year: String((car.data as Record<string, unknown>).year ?? ""),
    model: String((car.data as Record<string, unknown>).model ?? ""),
  }));

  const extraction = await claude.readReceipt(imageBase64, "image/jpeg", caption, carSummaries);

  const candidateCars = carSummaries.filter((car) => extraction.matchedCarIds.includes(car.id));
  const draft: ExpenseDraft = {
    carId: candidateCars.length === 1 ? candidateCars[0].id : null,
    candidateCars,
    amount: extraction.amount,
    category: extraction.category,
  };

  await advanceExpenseDraft(deps, draft);
}

async function advanceExpenseDraft(deps: Deps, draft: ExpenseDraft): Promise<void> {
  const { telegram, supabase, chatId } = deps;
  const missing = getNextMissingField(draft);

  if (missing === "car") {
    if (draft.candidateCars.length === 0) {
      await telegram.sendMessage(
        chatId,
        "I couldn't find a matching vehicle. Please mention the year and model more clearly.",
      );
      return;
    }
    await supabase.setPendingAction(chatId, "car_disambiguation", draft as unknown as Record<string, unknown>);
    await telegram.sendMessage(chatId, `Which vehicle is this for?\n${formatCarDisambiguationList(draft.candidateCars)}`);
    return;
  }

  if (missing === "amount") {
    await supabase.setPendingAction(chatId, "amount_clarification", draft as unknown as Record<string, unknown>);
    await telegram.sendMessage(chatId, "How much was the expense?");
    return;
  }

  if (missing === "category") {
    await supabase.setPendingAction(chatId, "category_disambiguation", draft as unknown as Record<string, unknown>);
    await telegram.sendMessage(chatId, `Which category does this belong to?\n${formatCategoryDisambiguationList()}`);
    return;
  }

  const car = (await supabase.listCars()).find((entry) => entry.id === draft.carId);
  const carLabel = car
    ? `${(car.data as Record<string, unknown>).year} ${(car.data as Record<string, unknown>).model}`
    : "the selected vehicle";

  await supabase.setPendingAction(chatId, "expense_confirm", draft as unknown as Record<string, unknown>);
  await telegram.sendMessage(
    chatId,
    `$${draft.amount} for ${getExpenseCategoryLabel(draft.category!)} on the ${carLabel}. Confirm? (yes/no)`,
  );
}

async function resolvePending(deps: Deps, pending: PendingAction): Promise<void> {
  const { telegram, supabase, chatId, message } = deps;
  const text = ((message.text as string | undefined) ?? "").trim();

  switch (pending.kind) {
    case "new_car_confirm": {
      const answer = parseYesNo(text);
      if (answer === null) {
        await telegram.sendMessage(chatId, "Please reply yes or no.");
        return;
      }
      await supabase.clearPendingAction(chatId);
      if (answer === "no") {
        await telegram.sendMessage(chatId, "Cancelled.");
        return;
      }
      const draft = pending.payload as unknown as CarPurchaseDraft;
      const carData = buildNewCarRecord(draft);
      await supabase.insertCar(carData);
      await telegram.sendMessage(chatId, `Saved: ${draft.year} ${draft.model}.`);
      return;
    }

    case "car_disambiguation": {
      const draft = pending.payload as unknown as ExpenseDraft;
      const selection = parseListSelection(text, draft.candidateCars.length);
      if (selection === null) {
        await telegram.sendMessage(chatId, `Please reply with a number from 1 to ${draft.candidateCars.length}.`);
        return;
      }
      await supabase.clearPendingAction(chatId);
      const updatedDraft: ExpenseDraft = { ...draft, carId: draft.candidateCars[selection - 1].id };
      await advanceExpenseDraft(deps, updatedDraft);
      return;
    }

    case "amount_clarification": {
      const draft = pending.payload as unknown as ExpenseDraft;
      const amount = parseAmount(text);
      if (amount === null) {
        await telegram.sendMessage(chatId, "Please reply with just the amount, e.g. 220 or $220.");
        return;
      }
      await supabase.clearPendingAction(chatId);
      const updatedDraft: ExpenseDraft = { ...draft, amount };
      await advanceExpenseDraft(deps, updatedDraft);
      return;
    }

    case "category_disambiguation": {
      const draft = pending.payload as unknown as ExpenseDraft;
      const selection = parseListSelection(text, EXPENSE_COST_FIELDS.length);
      if (selection === null) {
        await telegram.sendMessage(chatId, `Please reply with a number from 1 to ${EXPENSE_COST_FIELDS.length}.`);
        return;
      }
      await supabase.clearPendingAction(chatId);
      const updatedDraft: ExpenseDraft = { ...draft, category: EXPENSE_COST_FIELDS[selection - 1].key };
      await advanceExpenseDraft(deps, updatedDraft);
      return;
    }

    case "expense_confirm": {
      const answer = parseYesNo(text);
      if (answer === null) {
        await telegram.sendMessage(chatId, "Please reply yes or no.");
        return;
      }
      await supabase.clearPendingAction(chatId);
      if (answer === "no") {
        await telegram.sendMessage(chatId, "Cancelled.");
        return;
      }
      const draft = pending.payload as unknown as ExpenseDraft;
      const cars = await supabase.listCars();
      const car = cars.find((entry) => entry.id === draft.carId);
      if (!car) {
        await telegram.sendMessage(chatId, "That vehicle no longer exists, cancelling.");
        return;
      }
      const updatedData = applyExpenseToCarData(car.data, draft.category!, draft.amount!);
      await supabase.updateCarData(draft.carId!, updatedData);
      await telegram.sendMessage(chatId, `Saved: $${draft.amount} added to ${getExpenseCategoryLabel(draft.category!)}.`);
      return;
    }

    default: {
      await supabase.clearPendingAction(chatId);
      await telegram.sendMessage(chatId, "Something went wrong with that request, please start again.");
      return;
    }
  }
}
```

- [ ] **Step 2: Create the entrypoint**

Create `supabase/functions/telegram-webhook/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createTelegramClient } from "./lib/telegramClient.ts";
import { createClaudeClient } from "./lib/claudeClient.ts";
import { createAppSupabaseClient } from "./lib/supabaseClient.ts";
import { handleUpdate } from "./lib/handlers.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_AUTHORIZED_CHAT_ID = Deno.env.get("TELEGRAM_AUTHORIZED_CHAT_ID")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const telegram = createTelegramClient(TELEGRAM_BOT_TOKEN);
const claude = createClaudeClient(ANTHROPIC_API_KEY);
const supabase = createAppSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response("OK", { status: 200 });
  }

  const message = update.message as Record<string, unknown> | undefined;
  if (!message) {
    return new Response("OK", { status: 200 });
  }

  const chat = message.chat as Record<string, unknown> | undefined;
  const chatId = String(chat?.id ?? "");

  if (!chatId || chatId !== TELEGRAM_AUTHORIZED_CHAT_ID) {
    return new Response("OK", { status: 200 });
  }

  try {
    await handleUpdate({ telegram, claude, supabase, chatId, message });
  } catch (error) {
    console.error("handleUpdate failed:", error);
    try {
      await telegram.sendMessage(chatId, "Something went wrong, please try again.");
    } catch {
      // Ignore secondary failure — the root cause is already logged above.
    }
  }

  return new Response("OK", { status: 200 });
});
```

- [ ] **Step 3: Verify with type-checking**

Run: `deno check supabase/functions/telegram-webhook/lib/handlers.ts`
Expected: no type errors.

Run: `deno check supabase/functions/telegram-webhook/index.ts`
Expected: no type errors.

- [ ] **Step 4: Re-run the full pure-logic test suite**

Run: `deno test supabase/functions/telegram-webhook/lib/`
Expected: all tests from Tasks 2-4 still pass (24 passed, 0 failed), confirming this task didn't break the modules it imports from.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/handlers.ts supabase/functions/telegram-webhook/index.ts
git commit -m "feat: wire up Telegram webhook orchestration"
```

---

### Task 7: Deploy the Edge Function and configure credentials

**Files:** none (deployment + configuration only).

**Interfaces:**
- Consumes from Tasks 1-6: the full `supabase/functions/telegram-webhook/` directory tree and the applied `bot_pending_actions` migration.

- [ ] **Step 1: Guide the user through obtaining credentials**

This step requires direct back-and-forth with the user — it cannot be scripted, since each value is unique to their own Telegram/Anthropic accounts:

1. Tell the user to open Telegram, search for **@BotFather**, and send `/newbot`, following its prompts (choosing a name and a username ending in `bot`). BotFather replies with an HTTP API token — ask the user to paste it into the chat.
2. Tell the user to send any message (e.g. "hello") to their new bot.
3. Fetch `https://api.telegram.org/bot<TOKEN>/getUpdates` (substituting the real token) — either ask the user to open that URL in their browser and paste back the JSON, or fetch it directly if the token has already been shared. The `chat.id` field in the response (under `message.chat.id`) is the value for `TELEGRAM_AUTHORIZED_CHAT_ID`.
4. Tell the user to create an API key at console.anthropic.com and paste it into the chat.

- [ ] **Step 2: Deploy the Edge Function**

Read the current contents of these six files and use the `deploy_edge_function` tool with `project_id: nmxbnvmpoupdwcvqzsaj`, `name: telegram-webhook`, `entrypoint_path: index.ts`, `verify_jwt: false` (this function is a Telegram webhook — Telegram cannot send a Supabase JWT, and the function implements its own authorization via the `TELEGRAM_AUTHORIZED_CHAT_ID` check), and `files` set to:
- `index.ts` (contents from Task 6, Step 2)
- `lib/telegramClient.ts` (from Task 5)
- `lib/claudeClient.ts` (from Task 5)
- `lib/supabaseClient.ts` (from Task 5)
- `lib/carDraft.ts` (from Task 4)
- `lib/expenseLogic.ts` (from Task 3)
- `lib/costFields.ts` (from Task 2)
- `lib/handlers.ts` (from Task 6)

- [ ] **Step 3: Set the Edge Function secrets**

This cannot be done via the available Supabase tools (no secrets-management tool is exposed) — tell the user to go to their Supabase Dashboard → the "Flip car tracker" project → **Edge Functions → Secrets** (or **Project Settings → Edge Functions**), and add three secrets using the values gathered in Step 1:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_AUTHORIZED_CHAT_ID`
- `ANTHROPIC_API_KEY`

- [ ] **Step 4: Register the Telegram webhook**

Use the `get_project_url` tool with `project_id: nmxbnvmpoupdwcvqzsaj` to get the project's base URL, then run (substituting the real bot token and the project URL):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "<PROJECT_URL>/functions/v1/telegram-webhook"}'
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`.

- [ ] **Step 5: Confirm deployment**

Use the `get_edge_function` tool with `project_id: nmxbnvmpoupdwcvqzsaj`, `function_slug: telegram-webhook` (or the tool's equivalent identifier parameter) to confirm the function is deployed and active.

---

### Task 8: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Test creating a new car**

Ask the user to send their bot a message like: `"I bought a 2018 Ford Mustang for $8500 on 2026-07-03"`.
Expected: the bot replies asking for confirmation with those exact details. The user replies `"yes"`.
Expected: the bot confirms it saved the car. Use the `list_tables`/`execute_sql` tool (`select id, data from cars order by created_at desc limit 1`) with `project_id: nmxbnvmpoupdwcvqzsaj` to confirm a new row exists with `model: "Ford Mustang"`, `year: "2018"`, `auctionPrice: "8500"`, `status: "available"`.

- [ ] **Step 2: Test logging an expense from a receipt photo**

Ask the user to send a real receipt photo to the bot with a caption mentioning the vehicle from Step 1 (e.g. `"parts for the Mustang"`).
Expected: the bot either asks a clarifying question (if the category or amount isn't clear from the photo) or goes straight to a confirmation summary. Walk the user through answering any clarifying questions, then confirm with `"yes"`.
Expected: the bot confirms the amount was saved. Use `execute_sql` (`select data from cars where id = '<car id from Step 1>'`) to confirm the relevant cost field increased by the expected amount.

- [ ] **Step 3: Test rejecting an unauthorized user**

If feasible, ask the user to have a different Telegram account (or ask a friend) send a message to the bot.
Expected: no reply at all from the bot, and no new rows in `bot_pending_actions` or `cars` for that interaction.

- [ ] **Step 4: Test cancelling a confirmation**

Ask the user to describe a car purchase, then reply `"no"` to the confirmation.
Expected: the bot confirms cancellation, and no new row appears in `cars`.

- [ ] **Step 5: Record results**

Report to the user which of the above passed, and flag anything that didn't match expectations.
