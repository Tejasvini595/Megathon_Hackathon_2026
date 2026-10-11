import { formatGbp, formatNumber, formatSaving } from "@/lib/score";
import type { Band, FinancePlan, MonthlyRange } from "@/lib/twin/types";

export const gbpRange = ([a, b]: [number, number]) => `${formatGbp(a)}–${formatGbp(b)}`;

/** Savings are positive; a negative middle estimate is an increase in use. */
export function bandText(b: Band, unit: string) {
  const mid = b.p50 < 0 ? `increase ${formatNumber(Math.abs(b.p50))}` : formatSaving(b.p50);
  return `${formatSaving(b.p10)} to ${formatSaving(b.p90)} ${unit} (middle ${mid})`;
}

export function monthlyText([a, b]: MonthlyRange) {
  return `${formatGbp(Math.abs(a))}–${formatGbp(Math.abs(b))}`;
}

/** Positive net means the plan costs more a month than it saves. */
export function netText([best, worst]: MonthlyRange) {
  if (worst <= 0) return `saves ${monthlyText([worst, best])}`;
  if (best >= 0) return `costs ${monthlyText([best, worst])} more`;
  return `saves ${formatGbp(Math.abs(best))} to costs ${formatGbp(worst)}`;
}

export const reachesCText: Record<FinancePlan["reachesC"], string> = { yes: "reaches EPC C", borderline: "borderline for EPC C", no: "does not reach EPC C" };
