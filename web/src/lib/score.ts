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

/** A P10 to P90 saving band in the same convention: magnitudes when it stays on one side of zero (the headline carries the sign), signed ends when it crosses. */
export const formatSavingRange = (b: { p10: number; p90: number }) => {
  const abs = (n: number) => Math.abs(Math.round(n)).toLocaleString("en-GB");
  if (b.p10 >= 0) return `${abs(b.p10)} to ${abs(b.p90)}`;
  if (b.p90 <= 0) return `${abs(b.p90)} to ${abs(b.p10)}`;
  return `${formatSaving(b.p90)} to ${formatSaving(b.p10)}`;
};

export const formatGbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
