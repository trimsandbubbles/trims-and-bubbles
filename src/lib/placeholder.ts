/**
 * src/config/business.ts intentionally ships with raw "TODO_CLIENT: ..." text
 * so it's unmissable in the source file. But rendering that literal string on
 * the live site looks broken to a visitor — this swaps it for a graceful,
 * still-obviously-a-placeholder fallback in the UI while leaving the config
 * file's TODO markers untouched (that's what `npm run check:placeholders`
 * scans for).
 */
export function displayOrFallback(value: string, fallback: string): string {
  return value.startsWith("TODO_CLIENT") ? fallback : value;
}
