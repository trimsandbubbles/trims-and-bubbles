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
