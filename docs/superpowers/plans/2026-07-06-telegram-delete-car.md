# Telegram Delete-Car Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the authorized Telegram user delete an available (unsold) car through a list → select → confirm conversation.

**Architecture:** Extend the existing stateless webhook state machine. A keyword intent check routes delete requests to a new flow that lists only `status !== "sold"` cars, stores two new pending-action kinds (`delete_car_select`, `delete_car_confirm`), and deletes only after an explicit `yes`. Reuses existing parsing/formatting helpers.

**Tech Stack:** Deno (Supabase Edge Function), TypeScript, `@supabase/supabase-js@2`, Telegram Bot API. Tests via `Deno.test`.

## Global Constraints

- Runtime: Deno / Supabase Edge Functions. Files live under `supabase/functions/telegram-webhook/`.
- Only the authorized chat id is served (gate already in `index.ts` — do not change it).
- Deletion is irreversible: it must pass through `delete_car_confirm` + `parseYesNo(...) === "yes"` before any `deleteCar` call.
- Sold cars (`status === "sold"`, either `saleType`) must never appear in the delete list.
- Bilingual user (Spanish/English); bot copy is English (matches existing messages).
- Reuse existing helpers: `parseListSelection`, `parseYesNo`, `formatCarDisambiguationList`.
- Verify wrappers/orchestration with `deno check` (run with `export PATH="$HOME/.deno/bin:$PATH"`; use `--node-modules-dir=none` if the repo-root `node_modules` collides). Run pure-logic tests with `deno test`.

---

### Task 1: `intent.ts` — delete-intent detection

**Files:**
- Create: `supabase/functions/telegram-webhook/lib/intent.ts`
- Test: `supabase/functions/telegram-webhook/lib/intent.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isDeleteCommand(text: string): boolean`.

- [ ] **Step 1: Write the failing test**

`supabase/functions/telegram-webhook/lib/intent.test.ts`:
```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isDeleteCommand } from "./intent.ts";

Deno.test("isDeleteCommand detects Spanish delete verbs", () => {
  assertEquals(isDeleteCommand("elimina un carro"), true);
  assertEquals(isDeleteCommand("quiero eliminar un auto"), true);
  assertEquals(isDeleteCommand("borra un carro"), true);
  assertEquals(isDeleteCommand("bórrame el mustang"), true);
  assertEquals(isDeleteCommand("quita ese auto"), true);
});

Deno.test("isDeleteCommand detects English delete verbs", () => {
  assertEquals(isDeleteCommand("delete a car"), true);
  assertEquals(isDeleteCommand("please remove this vehicle"), true);
});

Deno.test("isDeleteCommand ignores purchase messages", () => {
  assertEquals(isDeleteCommand("I bought a 2018 Ford Mustang for $8500 today"), false);
  assertEquals(isDeleteCommand("compré un 2020 Toyota Corolla en 7200"), false);
  assertEquals(isDeleteCommand("hola"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/intent.test.ts`
Expected: FAIL — module `./intent.ts` not found / `isDeleteCommand` not exported.

- [ ] **Step 3: Write minimal implementation**

`supabase/functions/telegram-webhook/lib/intent.ts`:
```ts
// Matches delete requests before car-purchase extraction so a delete message
// never triggers a Claude purchase call. Spanish stems (elimin*, borr*, quit*)
// plus English delete/remove. Ordinary purchase text contains none of these.
const DELETE_PATTERNS: RegExp[] = [
  /\belimin\w*/i,
  /\bborr\w*/i,
  /\bquit\w*/i,
  /\bdelete\b/i,
  /\bremove\b/i,
];

export function isDeleteCommand(text: string): boolean {
  return DELETE_PATTERNS.some((pattern) => pattern.test(text));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/intent.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/intent.ts supabase/functions/telegram-webhook/lib/intent.test.ts
git commit -m "feat: add delete-intent detection for Telegram bot"
```

---

### Task 2: `supabaseClient.ts` — `deleteCar` + `created_at` on `listCars`

**Files:**
- Modify: `supabase/functions/telegram-webhook/lib/supabaseClient.ts`

**Interfaces:**
- Consumes: existing `createAppSupabaseClient(url, serviceRoleKey)`.
- Produces:
  - `deleteCar(carId: string): Promise<void>` on the returned client.
  - `listCars()` return type widened to `{ id: string; data: Record<string, unknown>; created_at: string }[]` (existing callers use only `id`/`data`).

- [ ] **Step 1: Update `listCars` to select `created_at`**

Replace the existing `listCars` function body:
```ts
  async function listCars(): Promise<{ id: string; data: Record<string, unknown>; created_at: string }[]> {
    const { data, error } = await client.from("cars").select("id, data, created_at");
    if (error) throw new Error(`listCars failed: ${error.message}`);
    return data ?? [];
  }
```

- [ ] **Step 2: Add `deleteCar`**

Add immediately after `updateCarData`:
```ts
  async function deleteCar(carId: string): Promise<void> {
    const { error } = await client.from("cars").delete().eq("id", carId);
    if (error) throw new Error(`deleteCar failed: ${error.message}`);
  }
```

- [ ] **Step 3: Export `deleteCar` from the client**

Change the final return to include `deleteCar`:
```ts
  return { getPendingAction, setPendingAction, clearPendingAction, listCars, insertCar, updateCarData, deleteCar };
```

- [ ] **Step 4: Type-check**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno check --node-modules-dir=none supabase/functions/telegram-webhook/lib/supabaseClient.ts`
Expected: `Check ...supabaseClient.ts` with no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/supabaseClient.ts
git commit -m "feat: add deleteCar and created_at to Supabase client"
```

---

### Task 3: `handlers.ts` — delete flow orchestration

**Files:**
- Modify: `supabase/functions/telegram-webhook/lib/handlers.ts`

**Interfaces:**
- Consumes: `isDeleteCommand` (Task 1); `deleteCar`, widened `listCars` (Task 2); existing `parseListSelection`, `parseYesNo`, `formatCarDisambiguationList`, `setPendingAction`, `clearPendingAction`.
- Produces: two new `resolvePending` cases (`delete_car_select`, `delete_car_confirm`) and a `startDeleteFlow` helper. No new exported symbols.

- [ ] **Step 1: Import `isDeleteCommand`**

Add to the imports block (after the `costFields.ts` import):
```ts
import { isDeleteCommand } from "./intent.ts";
```

- [ ] **Step 2: Route delete intent at the top of `handleTextMessage`**

In `handleTextMessage`, insert the intent check as the first statements after destructuring `deps` (before `const today = ...`):
```ts
  if (isDeleteCommand(text)) {
    await startDeleteFlow(deps);
    return;
  }
```

- [ ] **Step 3: Add the `startDeleteFlow` helper**

Add a new function after `handleTextMessage`:
```ts
async function startDeleteFlow(deps: Deps): Promise<void> {
  const { telegram, supabase, chatId } = deps;
  const cars = await supabase.listCars();
  const available = cars
    .filter((entry) => (entry.data as Record<string, unknown>).status !== "sold")
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .map((entry) => ({
      id: entry.id,
      year: String((entry.data as Record<string, unknown>).year ?? ""),
      model: String((entry.data as Record<string, unknown>).model ?? ""),
    }));

  if (available.length === 0) {
    await telegram.sendMessage(chatId, "You have no available (unsold) cars to delete.");
    return;
  }

  await supabase.setPendingAction(
    chatId,
    "delete_car_select",
    { cars: available } as unknown as Record<string, unknown>,
  );
  await telegram.sendMessage(
    chatId,
    `Which car do you want to delete?\n${formatCarDisambiguationList(available)}`,
  );
}
```

- [ ] **Step 4: Add the two `resolvePending` cases**

In `resolvePending`, add these two cases before the `default:` case:
```ts
    case "delete_car_select": {
      const payload = pending.payload as unknown as { cars: { id: string; year: string; model: string }[] };
      const cars = payload.cars;
      const selection = parseListSelection(text, cars.length);
      if (selection === null) {
        await telegram.sendMessage(chatId, `Please reply with a number from 1 to ${cars.length}.`);
        return;
      }
      const chosen = cars[selection - 1];
      const label = `${chosen.year} ${chosen.model}`;
      await supabase.setPendingAction(
        chatId,
        "delete_car_confirm",
        { carId: chosen.id, label } as unknown as Record<string, unknown>,
      );
      await telegram.sendMessage(chatId, `Delete the ${label}? This can't be undone. (yes/no)`);
      return;
    }

    case "delete_car_confirm": {
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
      const payload = pending.payload as unknown as { carId: string; label: string };
      const cars = await supabase.listCars();
      const exists = cars.some((entry) => entry.id === payload.carId);
      if (!exists) {
        await telegram.sendMessage(chatId, "That vehicle no longer exists, cancelling.");
        return;
      }
      await supabase.deleteCar(payload.carId);
      await telegram.sendMessage(chatId, `Deleted: ${payload.label}.`);
      return;
    }
```

Note: `delete_car_select` does not call `clearPendingAction` before `setPendingAction` because `setPendingAction` clears the chat's pending row internally (verified in `supabaseClient.ts`). On an invalid number it returns without clearing, leaving `delete_car_select` active so the user can retry.

- [ ] **Step 5: Type-check**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno check --node-modules-dir=none supabase/functions/telegram-webhook/lib/handlers.ts`
Expected: `Check ...handlers.ts` with no errors.

- [ ] **Step 6: Run the full lib test suite (no regressions)**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test supabase/functions/telegram-webhook/lib/`
Expected: all existing tests plus Task 1's 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/telegram-webhook/lib/handlers.ts
git commit -m "feat: wire up delete-car flow in webhook handlers"
```

---

### Task 4: Deploy + end-to-end verification

**Files:** none (deployment + manual test).

**Interfaces:**
- Consumes: the deployed `telegram-webhook` function (project `nmxbnvmpoupdwcvqzsaj`).
- Produces: a verified live delete flow.

- [ ] **Step 1: Deploy the function**

Redeploy `telegram-webhook` (entrypoint `index.ts`, `verify_jwt=false`) with all 9 files: `index.ts` + `lib/{telegramClient,claudeClient,supabaseClient,carDraft,expenseLogic,costFields,intent,handlers}.ts`. (`index.ts` is unchanged from the trimmed-secrets version; include it as-is.)

- [ ] **Step 2: Synthetic list check**

POST a synthetic delete message from the authorized chat id and confirm the bot lists only unsold cars:
```bash
curl -sS -X POST "https://nmxbnvmpoupdwcvqzsaj.supabase.co/functions/v1/telegram-webhook" \
  -H "Content-Type: application/json" \
  -d '{"update_id":999100,"message":{"message_id":9100,"from":{"id":7841617429,"is_bot":false,"first_name":"Test"},"chat":{"id":7841617429,"type":"private"},"date":1783300000,"text":"elimina un carro"}}'
```
Then query `bot_pending_actions` for a `delete_car_select` row and cross-check its `cars` payload against `select id, data->>'model', data->>'status' from cars where data->>'status' != 'sold'` — every listed car must be unsold; no sold car may appear. Then delete the synthetic pending row so the user starts clean.

- [ ] **Step 3: User E2E**

User in Telegram: send "elimina un carro" → bot shows numbered list of unsold cars only → reply a number → bot asks "Delete the <car>? This can't be undone. (yes/no)" → reply `yes` → bot replies "Deleted: <car>." Verify the car disappears from the dashboard, and that a known sold car never appeared in the list. Separately verify replying `no` cancels without deleting.

- [ ] **Step 4: Record progress**

Update `.superpowers/sdd/progress.md` with the delete-car feature status (deployed + E2E result).

---

## Self-Review

- **Spec coverage:** intent detection (Task 1) ✓; available-only filter + recency sort + list (Task 3 `startDeleteFlow`) ✓; number select → confirm → delete (Task 3 cases) ✓; `deleteCar` + `created_at` (Task 2) ✓; no-cars / invalid-number / car-gone edge cases (Task 3) ✓; deploy + E2E incl. sold-car exclusion and cancel (Task 4) ✓.
- **Placeholder scan:** none — all steps contain concrete code/commands.
- **Type consistency:** `listCars` returns `{ id, data, created_at }` (Task 2) and is consumed with `.data`/`.created_at`/`.id` (Task 3); `delete_car_select` payload `{ cars: {id,year,model}[] }` written in `startDeleteFlow` and read in the select case; `delete_car_confirm` payload `{ carId, label }` written in the select case and read in the confirm case; `deleteCar(carId)` defined (Task 2) and called (Task 3) with matching signature; `isDeleteCommand(text)` defined (Task 1) and called (Task 3).
