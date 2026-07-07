# Telegram bot: delete a car

Date: 2026-07-06
Status: Approved

## Goal

Let the authorized user delete a vehicle through the Telegram bot. When the user
asks to delete a car, the bot shows a numbered list of **only the available
(unsold) cars**, most recent first. The user picks one by number, confirms, and
the car is removed. Sold cars (cash or finance) are never offered and cannot be
deleted through the bot.

## Why "available only"

In the data model a car is sold when `status === "sold"` (see
`src/lib/carCalculations.js` `isSold`), regardless of `saleType` (`cash` or
`finance`). "Available / not sold" is therefore `status !== "sold"` — the same
predicate the dashboard uses for its available-cars count (`src/App.jsx`).
Deleting a sold car would destroy sale/financing history, so those are protected.

## Conversation flow

1. User sends a delete request, e.g. "elimina un carro", "borra un auto",
   "delete a car".
2. Bot detects delete intent and replies with a numbered list of available cars,
   most recent first (ordered by `created_at` descending):
   ```
   ¿Cuál carro quieres eliminar?
   1) 2018 Ford Mustang
   2) 2018 Chevrolet Silverado
   ...
   ```
   Stores pending action `delete_car_select` with the payload
   `{ cars: [{ id, year, model }] }`.
3. User replies with a number. Bot validates it against the list length.
4. Bot asks to confirm:
   "Delete the 2018 Ford Mustang? This can't be undone. (yes/no)"
   Stores pending action `delete_car_confirm` with `{ carId, label }`.
5. User replies:
   - `yes` → bot deletes the car, replies "Deleted: 2018 Ford Mustang.",
     clears pending state.
   - `no` → bot replies "Cancelled.", clears pending state.

### List size

Show **all** available cars (most recent first). Unsold inventory in a car-flip
business is naturally small, so no cap is applied. If the list ever grows
uncomfortably long this can be revisited, but it is out of scope now.

## Intent detection

Delete intent is detected by a keyword check **before** the car-purchase
extraction, so a delete message never triggers a Claude purchase call and a
purchase message is never mistaken for a delete.

- New pure module `lib/intent.ts` exporting `isDeleteCommand(text: string): boolean`.
- Matches case-insensitively on delete verbs in Spanish and English:
  `elimina`, `eliminar`, `borra`, `borrar`, `quita`, `quitar`, `delete`, `remove`.
  (Matched as whole words / stems so ordinary purchase text does not trigger it.)
- Unit-tested: delete phrases return true; purchase phrases
  ("I bought a 2018 Ford Mustang for $8500") return false.

## Edge cases

- **No available cars:** "You have no available (unsold) cars to delete."
  (No pending action stored.)
- **Invalid selection number:** "Please reply with a number from 1 to N."
  (Pending `delete_car_select` remains so the user can retry.)
- **Car already gone at confirm time:** if the chosen `carId` no longer exists
  when confirming, reply "That vehicle no longer exists, cancelling." and clear
  state. (Mirrors the existing expense-confirm guard.)

## Components / changes

- `lib/intent.ts` (new): `isDeleteCommand` — pure, unit-tested.
- `lib/supabaseClient.ts`:
  - `deleteCar(carId: string): Promise<void>` — `delete().eq("id", carId)`.
  - `listCars` also selects `created_at` so the handler can sort by recency.
    (Existing callers ignore the extra field.)
- `lib/handlers.ts`:
  - In `handleTextMessage`, check `isDeleteCommand(text)` first; if true call
    `startDeleteFlow`, else fall through to the existing purchase extraction.
  - `startDeleteFlow`: list cars, filter `status !== "sold"`, sort by
    `created_at` desc, map to `{ id, year, model }`; if empty send the no-cars
    message, else store `delete_car_select` and send the numbered list.
  - `resolvePending`: two new cases:
    - `delete_car_select`: parse the number with the existing
      `parseListSelection`; on valid selection store `delete_car_confirm` and ask
      to confirm; on invalid, re-prompt.
    - `delete_car_confirm`: parse yes/no with the existing `parseYesNo`; on `yes`
      re-check existence then `deleteCar` and confirm; on `no` cancel. Clears
      pending state in both branches.
- Reuse existing helpers: `parseListSelection`, `parseYesNo`,
  `formatCarDisambiguationList` (already renders `N) year model`).

## Safety

- Only the authorized chat id is served (unchanged gate in `index.ts`).
- Deletion is irreversible, so it always requires an explicit `yes` confirmation
  showing the exact car. No delete happens without passing through
  `delete_car_confirm` + `parseYesNo === "yes"`.
- Sold cars are excluded from the candidate list, so they cannot be deleted even
  by a mistaken selection.

## Testing

- `lib/intent.test.ts`: delete phrases (ES/EN) true; purchase phrases false.
- Extend existing state-machine reasoning: the two new pending kinds are a closed
  set (stored == resolved), and the only `deleteCar` call sits inside
  `delete_car_confirm` after a `yes`.
- Manual E2E: ask to delete → list shows only available cars → pick number →
  confirm yes → car gone from dashboard; verify a sold car never appears; verify
  `no` cancels.

## Out of scope

- Deleting by name ("borra el mustang") without the numbered list.
- Bulk deletion.
- Undo / soft-delete / archiving.
- Editing existing cars (separate feature).
