/**
 * Returns `next` only if it's a safe same-origin path, otherwise `fallback`.
 *
 * A post-login redirect target that comes from the URL (`?next=`) must never be
 * allowed to bounce the user to another site — that turns our trusted login page
 * into a phishing springboard. We accept only paths that start with a single "/"
 * (so "//evil.com" and "https://evil.com" are both rejected) and don't contain a
 * backslash (some browsers treat "/\evil.com" as protocol-relative).
 */
export function safeInternalPath(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  return next;
}
