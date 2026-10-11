import { epcTone } from "@/lib/score";
import type { TwinState } from "@/lib/twin/types";

/** "EPC E · SAP 47", "EPC E · from your band" or "Estimated ≈ D (C–E)". */
export function ratingLabel(r: TwinState["rating"]) {
  if (r.source === "recorded") return `EPC ${r.band} · SAP ${r.sap}`;
  if (r.source === "band") return `EPC ${r.band} · from your band`;
  const span = r.range && r.range.band[0] !== r.range.band[1] ? ` (${r.range.band[0]}–${r.range.band[1]})` : "";
  return `Estimated ≈ ${r.band}${span}`;
}

export function RatingChip({ rating }: { rating: TwinState["rating"] }) {
  return (
    <div className="glass pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg">
      <span className="size-1.5 rounded-full" style={{ background: epcTone(rating.band) }} />
      <span className="font-semibold tracking-wide">{ratingLabel(rating)}</span>
    </div>
  );
}
