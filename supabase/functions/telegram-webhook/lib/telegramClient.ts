const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const TELEGRAM_FILE_BASE = "https://api.telegram.org/file/bot";

export function createTelegramClient(botToken: string) {
  const base = `${TELEGRAM_API_BASE}${botToken}`;

  async function sendMessage(chatId: string, text: string): Promise<void> {
    const response = await fetch(`${base}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
    }
  }

  async function downloadPhoto(fileId: string): Promise<Uint8Array> {
    const fileInfoResponse = await fetch(`${base}/getFile?file_id=${fileId}`);
    if (!fileInfoResponse.ok) {
      throw new Error(`Telegram getFile failed: ${fileInfoResponse.status}`);
    }
    const fileInfo = await fileInfoResponse.json();
    const filePath = fileInfo.result.file_path;
    const fileResponse = await fetch(`${TELEGRAM_FILE_BASE}${botToken}/${filePath}`);
    if (!fileResponse.ok) {
      throw new Error(`Telegram file download failed: ${fileResponse.status}`);
    }
    const buffer = await fileResponse.arrayBuffer();
    return new Uint8Array(buffer);
  }

  return { sendMessage, downloadPhoto };
}
