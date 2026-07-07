// Matches delete requests before car-purchase extraction so a delete message
// never triggers a Claude purchase call. Spanish stems (elimin*, borr*, quit*)
// plus English delete/remove. Ordinary purchase text contains none of these.
const DELETE_PATTERNS: RegExp[] = [
  /\belimin[a-záéíóúü]*/i,
  /\b[bB][oó]rr[a-záéíóúü]*/,
  /\bquit[a-záéíóúü]*/i,
  /\bdelete\b/i,
  /\bremove\b/i,
];

export function isDeleteCommand(text: string): boolean {
  return DELETE_PATTERNS.some((pattern) => pattern.test(text));
}
