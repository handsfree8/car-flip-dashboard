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
