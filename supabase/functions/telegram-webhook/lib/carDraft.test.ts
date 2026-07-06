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
