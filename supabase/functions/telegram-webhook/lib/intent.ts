// Matches delete requests before car-purchase extraction so a delete message
// never triggers a Claude purchase call. Input is normalized (lowercased and
// stripped of diacritics) so casing and Spanish accents cannot break matching.
// Spanish stems (elimin*, borr*, quit*) plus English delete/remove; ordinary
// purchase text contains none of these.
const DELETE_PATTERNS: RegExp[] = [
  /\belimin\w*/,
  /\bborr\w*/,
  /\bquit\w*/,
  /\bdelete\b/,
  /\bremove\b/,
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function isDeleteCommand(text: string): boolean {
  const normalized = normalize(text);
  return DELETE_PATTERNS.some((pattern) => pattern.test(normalized));
}
