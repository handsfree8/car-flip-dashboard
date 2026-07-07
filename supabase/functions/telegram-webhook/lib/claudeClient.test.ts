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
