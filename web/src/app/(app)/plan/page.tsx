import { Suspense } from "react";
import type { Metadata } from "next";
import { Flame, Leaf, PoundSterling, Zap, type LucideIcon } from "lucide-react";
import { EmptyHome } from "@/components/app/empty-home";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { FocusButton, TwinViewProvider } from "@/components/twin/twin-view";
import { getActiveHome } from "@/lib/homes";
import { formatGbp, formatSaving, scoreTone } from "@/lib/score";
import type { Band, Retrofit } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { PlanStage } from "./plan-stage";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlanContent />
    </Suspense>
  );
}

const band = (b: Band) => `${Math.round(b.p10).toLocaleString("en-GB")} to ${Math.round(b.p90).toLocaleString("en-GB")}`;

async function PlanContent() {
  const { user, twin } = await getActiveHome();
  if (!twin) return <EmptyHome name={user.name} />;
  const p = twin.package;
  const v = twin.value;

  return (
    <TwinViewProvider>
      <section className="sticky top-0 h-[44dvh] min-h-[320px]">
        <PlanStage
          geometry={twin.geometry}
          heatLoss={twin.heatLoss}
          heatLossAfter={p.heatLossAfter}
          addsSolar={twin.retrofits.some((r) => r.id === "solar_pv")}
          addsHeatPump={twin.retrofits.some((r) => r.id === "heat_pump")}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 px-5 pt-safe">
          <h1 className="pt-3 text-2xl font-semibold tracking-tight">Your plan</h1>
          <p className="text-xs text-muted-foreground">Ordered so each step makes the next one work better</p>
        </div>
      </section>

      <section className="relative z-10 -mt-8 rounded-t-[32px] border-t hairline bg-background px-5 pb-40 pt-5">
        <div className="rounded-3xl bg-surface p-4 ring-1 ring-hairline">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Score</p>
              <p className="tabular mt-1 text-4xl font-light tracking-tight">
                <span style={{ color: scoreTone(twin.score) }}>{twin.score}</span>
                <span className="mx-2 text-muted-foreground">→</span>
                <span style={{ color: scoreTone(p.scoreAfter) }}>{p.scoreAfter}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {twin.scoreClass} → {p.classAfter}
              </p>
            </div>
            {p.improvementPotentialPct != null && (
              <div className="text-right">
                <p className="tabular text-2xl font-light">{p.improvementPotentialPct}%</p>
                <p className="text-[11px] text-muted-foreground">less purchased energy</p>
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Mini icon={Flame} label="Gas" value={formatSaving(p.gasSavingKwh.p50)} sub="kWh/yr" warn={p.gasSavingKwh.p50 < 0} />
            <Mini icon={Zap} label="Electricity" value={formatSaving(p.elecSavingKwh.p50)} sub="kWh/yr" warn={p.elecSavingKwh.p50 < 0} />
            <Mini icon={Leaf} label="Carbon" value={`−${(p.carbonSavingKg.p50 / 1000).toFixed(1)}`} sub="t CO₂e/yr" />
          </div>
          {p.elecSavingKwh.p50 < 0 && (
            <p className="mt-3 rounded-2xl bg-amber/10 px-3 py-2 text-xs text-amber">Electricity goes up because the heat pump replaces gas. Net carbon still falls.</p>
          )}
          {v.currentGbp && v.upliftPct && (
            <div className="mt-4 flex items-center gap-3 border-t hairline pt-4">
              <PoundSterling className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm">
                  Value <span className="tabular font-medium">{formatGbp(v.currentGbp * (1 + v.upliftPct[0] / 100))}</span> to{" "}
                  <span className="tabular font-medium">{formatGbp(v.currentGbp * (1 + v.upliftPct[1] / 100))}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  +{v.upliftPct[0]}–{v.upliftPct[1]}% on {formatGbp(v.currentGbp)}. {v.note}
                </p>
              </div>
            </div>
          )}
        </div>

        <ol className="relative mt-6 space-y-3 before:absolute before:bottom-6 before:left-[15px] before:top-6 before:w-px before:bg-hairline">
          {twin.retrofits.map((r) => (
            <Step key={r.id} r={r} />
          ))}
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">All savings are estimates, not guarantees. Ranges show the 10th to 90th percentile.</p>
      </section>
    </TwinViewProvider>
  );
}

function Step({ r }: { r: Retrofit }) {
  const suit = r.suitability === "High" ? "bg-volt/15 text-volt" : r.suitability === "Medium" ? "bg-amber/15 text-amber" : "bg-surface-2 text-muted-foreground";
  return (
    <li>
      <FocusButton element={r.element} className="flex gap-3">
        <span className="relative z-10 mt-4 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold ring-4 ring-background group-data-[active=true]:bg-volt group-data-[active=true]:text-black">
          {r.order}
        </span>
        <span className="block flex-1 rounded-3xl bg-surface p-4 ring-1 ring-hairline transition-colors group-data-[active=true]:ring-volt/40">
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{r.label}</span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", suit)} title={`${Math.round(r.confidence * 100)}% confidence`}>
              {r.suitability}
            </span>
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{r.reason}</span>
          <span className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            {r.gasSavingKwh.p50 !== 0 && <Chip icon={Flame} warn={r.gasSavingKwh.p50 < 0} text={`${formatSaving(r.gasSavingKwh.p50)} kWh`} title={`gas, ${band(r.gasSavingKwh)} kWh`} />}
            {r.elecSavingKwh.p50 !== 0 && <Chip icon={Zap} warn={r.elecSavingKwh.p50 < 0} text={`${formatSaving(r.elecSavingKwh.p50)} kWh`} title={`electricity, ${band(r.elecSavingKwh)} kWh`} />}
            <Chip icon={Leaf} text={`−${Math.round(r.carbonSavingKg.p50)} kg`} />
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">
              {formatGbp(r.costGbp[0])}–{formatGbp(r.costGbp[1])}
            </span>
          </span>
        </span>
      </FocusButton>
    </li>
  );
}

function Chip({ icon: Icon, text, warn, title }: { icon: LucideIcon; text: string; warn?: boolean; title?: string }) {
  return (
    <span title={title} className={cn("tabular flex items-center gap-1 rounded-full px-2 py-0.5", warn ? "bg-amber/15 text-amber" : "bg-volt/10 text-volt")}>
      <Icon className="size-3" />
      {text}
    </span>
  );
}

function Mini({ icon: Icon, label, value, sub, warn }: { icon: LucideIcon; label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 p-3">
      <Icon className={cn("size-3.5", warn ? "text-amber" : "text-volt")} />
      <p className="tabular mt-2 text-lg font-light">{value}</p>
      <p className="text-[10px] text-muted-foreground">
        {label} · {sub}
      </p>
    </div>
  );
}
