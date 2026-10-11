import { Flame, Leaf, Search, Zap, type LucideIcon } from "lucide-react";
import { FocusButton } from "@/components/twin/twin-view";
import { formatGbp, formatSaving } from "@/lib/score";
import type { Band, Retrofit } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { billText } from "./format";

const kwh = (n: number) => Math.round(n).toLocaleString("en-GB");
const nonZero = (b: Band) => b.p10 !== 0 || b.p50 !== 0 || b.p90 !== 0;

export function Step({ r }: { r: Retrofit }) {
  const tier = r.relevance?.tier ?? r.suitability;
  const survey = tier === "needs survey";
  const chip = (t: string) => (t === "High" ? "bg-volt/15 text-volt" : t === "Medium" ? "bg-amber/15 text-amber" : "bg-surface-2 text-muted-foreground");
  const gas = nonZero(r.gasSavingKwh);
  const elec = nonZero(r.elecSavingKwh);
  // One scale per card so the gas and electricity bars compare honestly.
  const bands = [gas && r.gasSavingKwh, elec && r.elecSavingKwh].filter(Boolean) as Band[];
  const lo = Math.min(0, ...bands.map((b) => b.p10));
  const hi = Math.max(0, ...bands.map((b) => b.p90));
  return (
    <li>
      <FocusButton element={r.element} className="flex gap-3">
        <span className="relative z-10 mt-4 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold ring-4 ring-background group-data-[active=true]:bg-volt group-data-[active=true]:text-black">
          {r.order}
        </span>
        <span className={cn("block min-w-0 flex-1 rounded-3xl bg-surface p-4 ring-1 ring-hairline transition-colors group-data-[active=true]:ring-volt/40", survey && "border border-dashed border-muted-foreground/50 ring-0")}>
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{r.label}</span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", chip(r.suitability))}>{r.suitability} suitability</span>
              <span
                className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", survey ? "border border-dotted border-muted-foreground/60 text-muted-foreground" : chip(tier))}
                title={r.relevance ? `${Math.round(r.relevance.confidence * 100)}% confidence` : undefined}
              >
                {survey && <Search className="size-3" />}
                {survey ? "Needs survey" : `${tier} relevance`}
              </span>
            </span>
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{r.reason}</span>
          {survey && <span className="mt-2 block text-xs text-muted-foreground">We can&apos;t tell from what we know whether this suits your home; a survey would settle it.</span>}

          {(gas || elec) && (
            <span className="mt-3 block space-y-2">
              {gas && <RangeBar icon={Flame} label="Gas" band={r.gasSavingKwh} lo={lo} hi={hi} />}
              {elec && <RangeBar icon={Zap} label="Electricity" band={r.elecSavingKwh} lo={lo} hi={hi} />}
              {r.elecSavingKwh.p50 < 0 && <span className="block text-[11px] text-amber">Electricity use rises with this measure; gas use falls.</span>}
            </span>
          )}

          <span className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            <span className="tabular flex items-center gap-1 rounded-full bg-volt/10 px-2 py-0.5 text-volt">
              <Leaf className="size-3" />
              {kwh(r.carbonSavingKg.p10)}–{kwh(r.carbonSavingKg.p90)} kg CO₂e
            </span>
            <span className="tabular rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">
              {formatGbp(r.costGbp[0])}–{formatGbp(r.costGbp[1])}
            </span>
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            Bills (est.): <span className={cn("tabular", r.billSavingGbp < 0 ? "text-amber" : "text-foreground")}>{billText(r.billSavingGbp)}</span>
            {" · "}
            {r.paybackYears == null ? "doesn't pay back at today's prices" : <span className="tabular">pays back in about {r.paybackYears.toFixed(1)} years</span>}
          </span>
        </span>
      </FocusButton>
    </li>
  );
}

/** P10 to P90 span on a shared axis with a zero line; amber where use rises. The tick is the P50. */
function RangeBar({ icon: Icon, label, band, lo, hi }: { icon: LucideIcon; label: string; band: Band; lo: number; hi: number }) {
  const span = hi - lo || 1;
  const x = (v: number) => ((v - lo) / span) * 100;
  const rises = band.p50 < 0;
  return (
    <span className="block">
      <span className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Icon className="size-3" />
          {label}
        </span>
        <span className="tabular">
          {formatSaving(band.p50)} kWh <span className="opacity-70">({kwh(band.p10)} to {kwh(band.p90)})</span>
        </span>
      </span>
      <span className="relative mt-1 block h-1.5 rounded-full bg-surface-2">
        <span className={cn("absolute inset-y-0 rounded-full", rises ? "bg-amber/70" : "bg-volt/70")} style={{ left: `${x(band.p10)}%`, width: `${Math.max(x(band.p90) - x(band.p10), 1.5)}%` }} />
        <span className="absolute -inset-y-0.5 w-px bg-foreground/50" style={{ left: `${x(0)}%` }} />
        <span className="absolute -inset-y-px w-0.5 rounded bg-foreground" style={{ left: `${x(band.p50)}%` }} />
      </span>
    </span>
  );
}
