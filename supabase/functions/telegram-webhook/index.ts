import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createTelegramClient } from "./lib/telegramClient.ts";
import { createClaudeClient } from "./lib/claudeClient.ts";
import { createAppSupabaseClient } from "./lib/supabaseClient.ts";
import { handleUpdate } from "./lib/handlers.ts";

// Secrets are trimmed defensively — a stray leading/trailing space or tab from
// pasting into the dashboard would otherwise break the auth gate and API auth.
const TELEGRAM_BOT_TOKEN = (Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "").trim();
const TELEGRAM_AUTHORIZED_CHAT_ID = (Deno.env.get("TELEGRAM_AUTHORIZED_CHAT_ID") ?? "").trim();
const ANTHROPIC_API_KEY = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

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
