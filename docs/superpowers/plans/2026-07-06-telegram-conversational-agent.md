# Telegram Conversational Agent Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the forced car-purchase extraction on free text with a single agent call that either extracts a car purchase or replies conversationally in the user's language, asking a clarifying question when unsure instead of returning a rigid "unknown".

**Architecture:** A new `interpretMessage` method on the Claude client calls the Messages API with the `extract_car_purchase` tool and `tool_choice: auto` plus a system prompt describing the bot's role. A pure `parseInterpretResponse` helper turns the API response into a discriminated union (`car_purchase` | `reply`). `handleTextMessage` routes on that union.

**Tech Stack:** Deno (Supabase Edge Function), TypeScript, Anthropic Messages API (`claude-sonnet-5`), Telegram Bot API. Tests via `Deno.test`.

## Global Constraints

- Runtime: Deno / Supabase Edge Functions, under `supabase/functions/telegram-webhook/`.
- Model id stays `claude-sonnet-5` (existing `MODEL` constant in `claudeClient.ts`) — do not change it.
- Anthropic call reuses existing constants `ANTHROPIC_API_URL`, `ANTHROPIC_VERSION`, `MODEL` and header shape (`x-api-key`, `anthropic-version`).
- Conversational replies are in the user's language (Claude detects). Fixed action/confirmation messages stay in ENGLISH and unchanged ("Got it: …", "Saved: …", "Deleted: …", "Confirm? (yes/no)", disambiguation lists).
- The agent has exactly ONE tool (`extract_car_purchase`); it must not gain any side-effecting tool. Car creation still passes through the existing `new_car_confirm` yes/no confirmation before any DB write.
- Keep `extractCarPurchase` and `readReceipt` unchanged (receipt flow is untouched).
- Verify pure logic with `deno test`; verify wrappers/handlers with `deno check` (run `export PATH="$HOME/.deno/bin:$PATH"` first; use `--node-modules-dir=none` when the file transitively imports `npm:` deps, because the repo-root `node_modules` collides with Deno npm resolution).

---

### Task 1: `claudeClient.ts` — `parseInterpretResponse` + `interpretMessage`

**Files:**
- Modify: `supabase/functions/telegram-webhook/lib/claudeClient.ts`
- Test: `supabase/functions/telegram-webhook/lib/claudeClient.test.ts` (new)

**Interfaces:**
- Consumes: existing `CarPurchaseExtraction` type and the module constants `ANTHROPIC_API_URL`, `ANTHROPIC_VERSION`, `MODEL`, and the `apiKey` closure variable in `createClaudeClient`.
- Produces:
  - Exported `type InterpretResult = { kind: "car_purchase"; data: CarPurchaseExtraction } | { kind: "reply"; text: string }`.
  - Exported pure `parseInterpretResponse(content: Array<Record<string, unknown>>): InterpretResult`.
  - `interpretMessage(messageText: string, today: string): Promise<InterpretResult>` on the object returned by `createClaudeClient`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/telegram-webhook/lib/claudeClient.test.ts`:
```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseInterpretResponse } from "./claudeClient.ts";

Deno.test("parseInterpretResponse returns car_purchase for a tool_use block", () => {
  const content = [
    {
      type: "tool_use",
      name: "extract_car_purchase",
      input: { model: "Ford Mustang", year: "2018", purchasePrice: 8500, purchaseDate: "2026-07-06" },
    },
  ];
  const result = parseInterpretResponse(content);
  assertEquals(result.kind, "car_purchase");
  if (result.kind === "car_purchase") {
    assertEquals(result.data.model, "Ford Mustang");
    assertEquals(result.data.purchasePrice, 8500);
  }
});

Deno.test("parseInterpretResponse returns reply for a text block", () => {
  const content = [{ type: "text", text: "¡De nada! 😊" }];
  assertEquals(parseInterpretResponse(content), { kind: "reply", text: "¡De nada! 😊" });
});

Deno.test("parseInterpretResponse concatenates and trims multiple text blocks", () => {
  const content = [{ type: "text", text: "  Hola" }, { type: "text", text: " mundo  " }];
  assertEquals(parseInterpretResponse(content), { kind: "reply", text: "Hola mundo" });
});

Deno.test("parseInterpretResponse falls back when there is no tool_use and no text", () => {
  const result = parseInterpretResponse([]);
  assertEquals(result.kind, "reply");
  if (result.kind === "reply") assertEquals(result.text.length > 0, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/claudeClient.test.ts`
Expected: FAIL — `parseInterpretResponse` is not exported from `claudeClient.ts`.

- [ ] **Step 3: Add the type, constants, and pure parser**

In `supabase/functions/telegram-webhook/lib/claudeClient.ts`, immediately AFTER the existing `ReceiptExtraction` interface (before `export function createClaudeClient`), add:
```ts
export type InterpretResult =
  | { kind: "car_purchase"; data: CarPurchaseExtraction }
  | { kind: "reply"; text: string };

const AGENT_FALLBACK_REPLY = "Perdona, no entendí. ¿Me lo puedes decir de otra forma?";

const AGENT_SYSTEM_PROMPT =
  "You are the assistant for a car-flip inventory Telegram bot. You help the user with three things: " +
  "(1) registering a car they bought, (2) deleting a car, and (3) logging expenses from receipt photos. " +
  "If the user's message clearly describes buying a car AND includes the model, year, and purchase price, " +
  "call the extract_car_purchase tool. Otherwise, reply with a short, friendly message in the SAME language " +
  "the user wrote in. If their intent is unclear, or a described car purchase is missing the model, year, or " +
  "price, ask one brief clarifying question instead of guessing. Never reply with the literal word \"unknown\". " +
  "For thanks or greetings, respond warmly and briefly. If they ask what you can do, list the three capabilities " +
  "in one or two sentences. Keep replies concise.";

export function parseInterpretResponse(content: Array<Record<string, unknown>>): InterpretResult {
  const blocks = content ?? [];
  const toolUse = blocks.find((block) => block.type === "tool_use");
  if (toolUse) {
    return { kind: "car_purchase", data: toolUse.input as unknown as CarPurchaseExtraction };
  }
  const text = blocks
    .filter((block) => block.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("")
    .trim();
  if (text) {
    return { kind: "reply", text };
  }
  return { kind: "reply", text: AGENT_FALLBACK_REPLY };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/claudeClient.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the `interpretMessage` method**

Inside `createClaudeClient`, AFTER the existing `readReceipt` function definition and BEFORE the `return { extractCarPurchase, readReceipt };` line, add:
```ts
  async function interpretMessage(messageText: string, today: string): Promise<InterpretResult> {
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
        system: AGENT_SYSTEM_PROMPT,
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

Then change the return line of `createClaudeClient` from:
```ts
  return { extractCarPurchase, readReceipt };
```
to:
```ts
  return { extractCarPurchase, readReceipt, interpretMessage };
```

- [ ] **Step 6: Type-check and re-run tests**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno check --node-modules-dir=none supabase/functions/telegram-webhook/lib/claudeClient.ts && deno test supabase/functions/telegram-webhook/lib/claudeClient.test.ts`
Expected: `Check …claudeClient.ts` with no errors, then 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/claudeClient.ts supabase/functions/telegram-webhook/lib/claudeClient.test.ts
git commit -m "feat: add interpretMessage agent call to Claude client"
```

---

### Task 2: `handlers.ts` — route free text through the agent

**Files:**
- Modify: `supabase/functions/telegram-webhook/lib/handlers.ts`

**Interfaces:**
- Consumes: `claude.interpretMessage(text, today)` returning `InterpretResult` (Task 1); existing `isDeleteCommand`, `startDeleteFlow`, `isCarPurchaseDraftComplete`, `CarPurchaseDraft`, `supabase.setPendingAction`.
- Produces: no new exported symbols; changes `handleTextMessage`'s internals only.

- [ ] **Step 1: Replace the body of `handleTextMessage`**

In `supabase/functions/telegram-webhook/lib/handlers.ts`, replace the entire `handleTextMessage` function (from `async function handleTextMessage` through its closing brace) with:
```ts
async function handleTextMessage(deps: Deps, text: string): Promise<void> {
  const { telegram, claude, supabase, chatId } = deps;
  if (isDeleteCommand(text)) {
    await startDeleteFlow(deps);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const interpreted = await claude.interpretMessage(text, today);

  if (interpreted.kind === "reply") {
    await telegram.sendMessage(chatId, interpreted.text);
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

- [ ] **Step 2: Type-check**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno check --node-modules-dir=none supabase/functions/telegram-webhook/lib/handlers.ts`
Expected: `Check …handlers.ts` with no errors.

- [ ] **Step 3: Run the full lib test suite (no regressions)**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/`
Expected: all existing tests plus Task 1's 4 new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/handlers.ts
git commit -m "feat: route free-text messages through conversational agent"
```

---

### Task 3: Deploy + smoke verification

**Files:** none (deployment + live checks).

**Interfaces:**
- Consumes: the deployed `telegram-webhook` function (project `nmxbnvmpoupdwcvqzsaj`).
- Produces: a verified conversational agent.

- [ ] **Step 1: Deploy the function**

Redeploy `telegram-webhook` (entrypoint `index.ts`, `verify_jwt=false`) with the 9 source files: `index.ts` + `lib/{telegramClient,claudeClient,supabaseClient,carDraft,expenseLogic,costFields,intent,handlers}.ts`. (Test files like `claudeClient.test.ts` are NOT deployed.) `index.ts` is unchanged (trimmed-secrets version).

- [ ] **Step 2: Smoke — conversational reply**

POST a "gracias" message from the authorized chat and confirm no car/pending is created and the request succeeds:
```bash
curl -sS -X POST "https://nmxbnvmpoupdwcvqzsaj.supabase.co/functions/v1/telegram-webhook" \
  -H "Content-Type: application/json" \
  -d '{"update_id":999200,"message":{"message_id":9200,"from":{"id":7841617429,"is_bot":false,"first_name":"Test"},"chat":{"id":7841617429,"type":"private"},"date":1783300000,"text":"gracias"}}'
```
Then verify `select count(*) from bot_pending_actions where chat_id='7841617429'` is 0 (a conversational reply stores no pending action). The user should see a friendly Spanish reply in Telegram (not "unknown", not the rigid model/year/price message).

- [ ] **Step 3: Smoke — car purchase still works**

POST a clear purchase and confirm a `new_car_confirm` pending row appears:
```bash
curl -sS -X POST "https://nmxbnvmpoupdwcvqzsaj.supabase.co/functions/v1/telegram-webhook" \
  -H "Content-Type: application/json" \
  -d '{"update_id":999201,"message":{"message_id":9201,"from":{"id":7841617429,"is_bot":false,"first_name":"Test"},"chat":{"id":7841617429,"type":"private"},"date":1783300000,"text":"compré un Ford Mustang 2018 en $8500 hoy"}}'
```
Then verify a `bot_pending_actions` row with `kind='new_car_confirm'` and payload model "Ford Mustang" exists; then DELETE that synthetic pending row so the user starts clean.

- [ ] **Step 4: User E2E + record progress**

User in Telegram: "gracias" → friendly reply; "¿qué puedes hacer?" → capability summary; a real purchase → "Got it… Confirm?" Then update `.superpowers/sdd/progress.md` with the conversational-agent status (deployed + smoke result).

---

## Self-Review

- **Spec coverage:** agent call with tool_choice auto + system prompt (Task 1 `interpretMessage`) ✓; discriminated `InterpretResult` + pure parser with fallback (Task 1 `parseInterpretResponse`) ✓; reply vs car_purchase routing and Spanish incomplete-purchase fallback (Task 2) ✓; English action messages preserved (Task 2 keeps the "Got it…"/`new_car_confirm` path) ✓; unit tests for the three parser branches (Task 1 test, 4 cases) ✓; deploy + smoke incl. conversational reply and purchase-still-works (Task 3) ✓; keyword delete stays before the agent (Task 2 keeps `isDeleteCommand` first) ✓.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `InterpretResult` defined in Task 1 and consumed in Task 2 via `interpretMessage`'s return; `parseInterpretResponse(content)` signature matches its test and its call site inside `interpretMessage`; `interpretMessage(messageText, today)` matches the `handleTextMessage` call `claude.interpretMessage(text, today)`; return object extended to `{ extractCarPurchase, readReceipt, interpretMessage }`, and `handleTextMessage` uses only `interpretMessage` from it; `CarPurchaseExtraction` reused from the existing file (not redefined).
