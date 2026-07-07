# Telegram bot: conversational agent layer

Date: 2026-07-06
Status: Approved

## Goal

Make the bot feel like a conversational agent. Today any non-delete text is
forced through car-purchase extraction, so messages like "gracias" get a rigid
"I couldn't tell the model, year..." reply (perceived as "unknown"). Instead, a
single agent call decides whether the message is a real car purchase or ordinary
conversation, replies naturally in the user's language when it's conversation,
and asks a short clarifying question when it is unsure — never "unknown".

## Scope (locked)

- **Stateless / no conversation memory.** Each message is handled fresh. No
  multi-turn gathering of missing car fields across messages.
- **Language:** conversational replies are in the user's language (Claude
  detects and matches). Fixed action/confirmation messages ("Got it…", "Saved…",
  "Deleted…", "Confirm? (yes/no)", disambiguation lists) stay in English,
  unchanged.

## Current vs new text flow

`handleTextMessage(text)` today: if `isDeleteCommand(text)` → delete flow; else →
`extractCarPurchase` (forced `tool_choice`) → rigid English error if incomplete.

New:
1. `isDeleteCommand(text)` → `startDeleteFlow` (unchanged).
2. Otherwise → `claude.interpretMessage(text, today)` returns a discriminated result:
   - `{ kind: "car_purchase", data: CarPurchaseExtraction }` — Claude called the
     `extract_car_purchase` tool because the message clearly describes a purchase.
     Handled exactly as today: build the draft; if complete, store
     `new_car_confirm` and send the English "Got it: … Confirm? (yes/no)".
   - `{ kind: "reply", text: string }` — Claude produced a natural-language reply
     (greeting, thanks, question, clarifying question, or a "please give me model/
     year/price" ask). Send that text verbatim to the user.

### Incomplete-purchase safety net

Because `tool_choice` is `auto` and the system prompt tells Claude to ask instead
of calling the tool with missing fields, the tool should only fire when model,
year, and price are present. If the tool nonetheless fires with an incomplete
draft (`!isCarPurchaseDraftComplete`), fall back to a short friendly Spanish ask
rather than the old rigid message:
"Necesito el modelo, el año y el precio de compra. Por ejemplo: \"compré un Ford
Mustang 2018 en $8500\"."

## Agent call (claudeClient.ts)

New method `interpretMessage(messageText: string, today: string): Promise<InterpretResult>`.

- `system` prompt (the agent's brief):
  - Role: the assistant for a car-flip inventory bot. It can help the user
    (1) register a car they bought, (2) delete a car, (3) log expenses from
    receipt photos.
  - If the message clearly describes buying a car with model, year, and price,
    call the `extract_car_purchase` tool.
  - Otherwise reply with a short, friendly message **in the same language the
    user wrote in**. If intent is unclear or key info is missing, ask one brief
    clarifying question instead of guessing. Never reply with the literal word
    "unknown". For thanks/greetings, respond warmly and briefly. If asked what it
    can do, list the three capabilities.
- `tools`: `[extract_car_purchase]` (same schema as today).
- `tool_choice`: `{ type: "auto" }`.
- `today` is injected into the tool's `purchaseDate` description exactly as in the
  existing `extractCarPurchase`.

### Response parsing (pure, unit-tested)

Factor the response interpretation into a pure exported helper so it can be
tested without the network:

`parseInterpretResponse(content: Array<Record<string, unknown>>): InterpretResult`
- If any block has `type === "tool_use"` → `{ kind: "car_purchase", data: block.input }`.
- Else concatenate the `text` of all `type === "text"` blocks (trimmed) → `{ kind: "reply", text }`.
- If there is neither a tool_use nor any non-empty text → `{ kind: "reply", text: FALLBACK }`
  where `FALLBACK` is a safe Spanish sentence
  ("Perdona, no entendí. ¿Me lo puedes decir de otra forma?").

`InterpretResult` type:
```ts
export type InterpretResult =
  | { kind: "car_purchase"; data: CarPurchaseExtraction }
  | { kind: "reply"; text: string };
```

`interpretMessage` does the fetch (reusing the existing headers/URL/model
constants) and returns `parseInterpretResponse(result.content)`.

## Delete-intent trade-off (accepted)

Delete detection stays keyword-based and runs BEFORE the agent. A message that
merely mentions a delete verb (e.g. the question "¿puedes borrar carros?") will
trigger the delete list rather than a conversational answer. Accepted as a known
limitation to keep scope small; a future iteration could move delete into the
agent as a tool so the model distinguishes command from question. The delete list
is harmless if shown unintentionally (the user can ignore it; the pending action
only advances on a valid number).

## Components / changes

- `lib/claudeClient.ts`:
  - Export `InterpretResult` type and `parseInterpretResponse(content)` (pure).
  - Add `interpretMessage(messageText, today)` to the returned client.
  - Keep `extractCarPurchase` and `readReceipt` as-is (receipt flow unchanged).
- `lib/claudeClient.test.ts` (new): unit-test `parseInterpretResponse` for the
  three branches (tool_use → car_purchase; text blocks → reply; empty → fallback).
- `lib/handlers.ts`: `handleTextMessage` calls `interpretMessage`; routes `reply`
  to `sendMessage`, and `car_purchase` into the existing draft/confirm logic
  (with the incomplete-purchase Spanish fallback above).

## Safety

- Only the authorized chat is served (unchanged gate).
- The agent has exactly one tool (`extract_car_purchase`); it cannot delete,
  spend, or take any side-effecting action on its own. Car creation still passes
  through the existing `new_car_confirm` yes/no confirmation before any DB write.
- Conversational replies are plain text echoed to the user; no tool or DB call.

## Testing

- Unit: `parseInterpretResponse` — tool_use, text, and empty/fallback cases.
- `deno check` on `claudeClient.ts` and `handlers.ts`.
- Live smoke (controller, via curl to the Anthropic API and/or synthetic webhook
  POSTs): "gracias" → a friendly Spanish reply, no car saved, no pending row;
  "¿qué puedes hacer?" → capability summary; "compré un Ford Mustang 2018 en
  $8500" → car_purchase → English "Got it… Confirm?" + `new_car_confirm` pending
  row; an ambiguous message → a clarifying question, no pending row.

## Out of scope

- Conversation memory / multi-turn car-field gathering.
- Moving delete detection into the agent.
- Translating the fixed action/confirmation messages to Spanish.
- Voice notes or non-text/non-photo message types.
