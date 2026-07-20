export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export const SIZE_BAND_LABELS: Record<string, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

export const SIZE_BAND_HINTS: Record<string, string> = {
  SMALL: "up to 9kg",
  MEDIUM: "10–19kg",
  LARGE: "20–29kg",
};

/** Plain-English duration, e.g. "3 hours 30 minutes", "1 hour", "45 minutes". */
export function formatDuration(minutes: number): string {
  const wholeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(wholeMinutes / 60);
  const mins = wholeMinutes % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins > 0) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);

  return parts.length > 0 ? parts.join(" ") : "0 minutes";
}
