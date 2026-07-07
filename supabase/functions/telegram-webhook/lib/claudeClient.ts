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

  return { extractCarPurchase, readReceipt, interpretMessage };
}
