"use client";

import { Flame, Leaf, Zap, type LucideIcon } from "lucide-react";
import { EpcLadder } from "@/components/app/epc-ladder";
import { Segmented } from "@/components/app/segmented";
import { useTwinView } from "@/components/twin/twin-view";
import { formatGbp, formatSaving, formatSavingRange, scoreTone } from "@/lib/score";
import type { PackageResult, TwinState } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { billText } from "./format";
import { usePlanVariant, type Variant } from "./plan-variant";

const tonnes = (kg: number) => (kg / 1000).toFixed(1);

type Props = {
  score: number;
  scoreClass: string;
  rating: TwinState["rating"];
  packages: Record<Variant, PackageResult | null>;
  unavailableReason: string | null;
};

export function PlanSummary({ score, scoreClass, rating, packages, unavailableReason }: Props) {
  const { variant, setVariant } = usePlanVariant();
  const { setAfter, setMode, setFocus } = useTwinView();
  const two = packages.noHeatPump !== null && packages.full !== null;
  const p = packages[variant] ?? packages.full;

  if (!p) {
    return (
      <div className="rounded-3xl bg-surface p-4 ring-1 ring-hairline">
        <p className="text-sm font-medium">No package to show</p>
        <p className="mt-1 text-xs text-muted-foreground">{unavailableReason ?? "The engine has no combined plan for this home yet."}</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-surface p-4 ring-1 ring-hairline">
      {two && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Two ways to go</p>
          <Segmented
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            value={variant}
            onChange={(v) => {
              setVariant(v);
              setAfter(true);
              setMode("normal");
              setFocus(null);
            }}
            options={[
              { value: "full", label: "With heat pump" },
              { value: "noHeatPump", label: "Fabric first" },
            ]}
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Score</p>
          <p className="tabular mt-1 text-4xl font-light tracking-tight">
            <span style={{ color: scoreTone(score) }}>{score}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span style={{ color: scoreTone(p.scoreAfter) }}>{p.scoreAfter}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {scoreClass} → {p.classAfter}
          </p>
          {p.improvementPotentialPct != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="tabular text-foreground">{p.improvementPotentialPct}%</span> less purchased energy
            </p>
          )}
        </div>
        <div className="w-28 shrink-0">
          <EpcLadder band={rating.band} range={rating.range?.band} after={p.bandAfter} size="sm" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Mini icon={Flame} label="Gas kWh/yr" value={formatSaving(p.gasSavingKwh.p50)} sub={formatSavingRange(p.gasSavingKwh)} warn={p.gasSavingKwh.p50 < 0} />
        <Mini icon={Zap} label="Electricity kWh/yr" value={formatSaving(p.elecSavingKwh.p50)} sub={formatSavingRange(p.elecSavingKwh)} warn={p.elecSavingKwh.p50 < 0} />
        <Mini icon={Leaf} label="Carbon t CO₂e/yr" value={`−${tonnes(p.carbonSavingKg.p50)}`} sub={`${tonnes(p.carbonSavingKg.p10)} to ${tonnes(p.carbonSavingKg.p90)}`} />
      </div>
      {p.elecSavingKwh.p50 < 0 && (
        <p className="mt-3 rounded-2xl bg-amber/10 px-3 py-2 text-xs text-amber">Electricity use rises because the heat pump replaces gas. Net carbon still falls.</p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t hairline pt-4 text-sm">
        <div>
          <dt className="text-[11px] text-muted-foreground">Cost</dt>
          <dd className="tabular">
            {formatGbp(p.costGbp[0])} to {formatGbp(p.costGbp[1])}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Bills (estimate)</dt>
          <dd className={cn("tabular", p.billSavingGbp < 0 && "text-amber")}>{billText(p.billSavingGbp)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Mini({ icon: Icon, label, value, sub, warn }: { icon: LucideIcon; label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 p-3">
      <Icon className={cn("size-3.5", warn ? "text-amber" : "text-volt")} />
      <p className="tabular mt-2 text-lg font-light">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5 text-[10px] text-muted-foreground/80">{sub}</p>
    </div>
  );
}
