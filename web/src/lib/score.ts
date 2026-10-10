/** Colour for a 0-100 score, matching the brief's five classes. */
export function scoreTone(score: number) {
  if (score >= 80) return "var(--volt)";
  if (score >= 65) return "color-mix(in oklch, var(--volt) 70%, var(--amber))";
  if (score >= 50) return "var(--amber)";
  if (score >= 30) return "color-mix(in oklch, var(--amber) 35%, var(--ember))";
  return "var(--ember)";
}

/** Colour for an EPC rating A-G. */
export function epcTone(band: string | null | undefined) {
  if (!band) return "var(--muted-foreground)";
  const b = band.toUpperCase();
  if (b === "A" || b === "B") return "var(--volt)";
  if (b === "C") return "color-mix(in oklch, var(--volt) 70%, var(--amber))";
  if (b === "D") return "var(--amber)";
  if (b === "E") return "color-mix(in oklch, var(--amber) 40%, var(--ember))";
  return "var(--ember)";
}

export const formatNumber = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Savings are positive; an increase in use is shown with a plus sign. */
export const formatSaving = (n: number) => `${n > 0 ? "−" : n < 0 ? "+" : ""}${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;

export const formatGbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
