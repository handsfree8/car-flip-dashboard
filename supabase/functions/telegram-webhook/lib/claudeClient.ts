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

export interface ExpenseExtraction {
  matchedCarIds: string[];
  description: string | null;
  amount: number | null;
  labor: number | null;
  category: string | null;
}

export type InterpretResult =
  | { kind: "car_purchase"; data: CarPurchaseExtraction }
  | { kind: "expense"; data: ExpenseExtraction }
  | { kind: "reply"; text: string };

const AGENT_FALLBACK_REPLY = "Perdona, no entendí. ¿Me lo puedes decir de otra forma?";

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

export function parseInterpretResponse(content: Array<Record<string, unknown>>): InterpretResult {
  const blocks = content ?? [];
  const toolUse = blocks.find((block) => block.type === "tool_use");
  if (toolUse) {
    if (toolUse.name === "log_expense") {
      return { kind: "expense", data: toolUse.input as unknown as ExpenseExtraction };
    }
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

  return { extractCarPurchase, readReceipt, interpretMessage };
}
