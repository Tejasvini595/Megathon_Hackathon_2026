"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Flame, Leaf, PoundSterling, Zap, type LucideIcon
} from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import type { Focus } from "@/components/twin/scene";
import { Segmented } from "@/components/app/segmented";
import { scoreTone } from "@/components/app/score-ring";
import type { Band, Retrofit, TwinState } from "@/lib/twin/types";
import { cn } from "@/lib/utils";

const kwh = (n: number) => `${n > 0 ? "−" : n < 0 ? "+" : ""}${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;
const band = (b: Band) => `${Math.round(b.p10).toLocaleString("en-GB")} to ${Math.round(b.p90).toLocaleString("en-GB")}`;
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

export function PlanView({ twin }: { twin: TwinState }) {
  const [view, setView] = useState<"now" | "after">("now");
  const [focus, setFocus] = useState<Focus>(null);
  const after = view === "after";

  const geometry = useMemo(
    () => ({
      ...twin.geometry,
      hasSolar: twin.geometry.hasSolar || (after && twin.retrofits.some((r) => r.id === "solar_pv")),
      hasHeatPump: twin.geometry.hasHeatPump || (after && twin.retrofits.some((r) => r.id === "heat_pump")),
    }),
    [twin, after],
  );
  // Shares are relative to today's total, so the house visibly cools after the plan.
  const heatLoss = after ? twin.package.heatLossAfter : twin.heatLoss;

  const v = twin.value;
  const p = twin.package;

  return (
    <div>
      <section className="sticky top-0 h-[44dvh] min-h-[320px]">
        <TwinCanvas geometry={geometry} heatLoss={heatLoss} heatRef={Math.max(...Object.values(twin.heatLoss))} mode={focus || after ? "thermal" : "normal"} focus={focus} className="!absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 top-0 px-5 pt-safe">
          <h1 className="pt-3 text-2xl font-semibold tracking-tight">Your plan</h1>
          <p className="text-xs text-muted-foreground">Ordered so each step makes the next one work better</p>
        </div>
        <div className="absolute inset-x-0 bottom-12 flex justify-center">
          <Segmented
            value={view}
            onChange={(x) => {
              setView(x);
              setFocus(null);
            }}
            options={[
              { value: "now", label: "Today" },
              { value: "after", label: "After plan" },
            ]}
          />
        </div>
      </section>

      <section className="relative z-10 -mt-8 rounded-t-[32px] border-t hairline bg-background/85 px-5 pb-40 pt-5 backdrop-blur-2xl">
        {/* Package summary */}
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
            <Mini icon={Flame} label="Gas" value={kwh(p.gasSavingKwh.p50)} sub="kWh/yr" tone="volt" />
            <Mini icon={Zap} label="Electricity" value={kwh(p.elecSavingKwh.p50)} sub="kWh/yr" tone={p.elecSavingKwh.p50 < 0 ? "amber" : "volt"} />
            <Mini icon={Leaf} label="Carbon" value={`−${(p.carbonSavingKg.p50 / 1000).toFixed(1)}`} sub="t CO₂e/yr" tone="volt" />
          </div>
          {p.elecSavingKwh.p50 < 0 && (
            <p className="mt-3 rounded-2xl bg-amber/10 px-3 py-2 text-xs text-amber">
              Electricity goes up because the heat pump replaces gas. Net carbon still falls.
            </p>
          )}
          {v.currentGbp && v.upliftPct && (
            <div className="mt-4 flex items-center gap-3 border-t hairline pt-4">
              <PoundSterling className="size-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm">
                  Value <span className="tabular font-medium">{gbp(v.currentGbp * (1 + v.upliftPct[0] / 100))}</span> to{" "}
                  <span className="tabular font-medium">{gbp(v.currentGbp * (1 + v.upliftPct[1] / 100))}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  +{v.upliftPct[0]}–{v.upliftPct[1]}% on {gbp(v.currentGbp)}. {v.note}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Steps */}
        <ol className="relative mt-6 space-y-3 before:absolute before:bottom-6 before:left-[15px] before:top-6 before:w-px before:bg-hairline">
          {twin.retrofits.map((r, i) => (
            <Step key={r.id} r={r} i={i} active={focus === r.element} onClick={() => setFocus((f) => (f === r.element ? null : (r.element as Focus)))} />
          ))}
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">All savings are estimates, not guarantees. Ranges show the 10th to 90th percentile.</p>
      </section>
    </div>
  );
}

function Step({ r, i, active, onClick }: { r: Retrofit; i: number; active: boolean; onClick: () => void }) {
  const suit = r.suitability === "High" ? "bg-volt/15 text-volt" : r.suitability === "Medium" ? "bg-amber/15 text-amber" : "bg-surface-2 text-muted-foreground";
  return (
    <motion.li initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }} className="relative flex gap-3">
      <span className={cn("relative z-10 mt-4 grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ring-4 ring-background", active ? "bg-volt text-black" : "bg-surface-2")}>{r.order}</span>
      <button onClick={onClick} className={cn("flex-1 rounded-3xl bg-surface p-4 text-left ring-1 transition-colors", active ? "ring-volt/40" : "ring-hairline")}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{r.label}</p>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", suit)} title={`${Math.round(r.confidence * 100)}% confidence`}>
            {r.suitability}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {r.gasSavingKwh.p50 !== 0 && <Chip icon={Flame} neg={r.gasSavingKwh.p50 < 0} text={`${kwh(r.gasSavingKwh.p50)} kWh`} title={`gas, ${band(r.gasSavingKwh)} kWh`} />}
          {r.elecSavingKwh.p50 !== 0 && <Chip icon={Zap} neg={r.elecSavingKwh.p50 < 0} text={`${kwh(r.elecSavingKwh.p50)} kWh`} title={`electricity, ${band(r.elecSavingKwh)} kWh`} />}
          <Chip icon={Leaf} text={`−${Math.round(r.carbonSavingKg.p50)} kg`} />
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">
            {gbp(r.costGbp[0])}–{gbp(r.costGbp[1])}
          </span>
        </div>
      </button>
    </motion.li>
  );
}

function Chip({ icon: Icon, text, neg, title }: { icon: LucideIcon; text: string; neg?: boolean; title?: string }) {
  return (
    <span title={title} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 tabular", neg ? "bg-amber/15 text-amber" : "bg-volt/10 text-volt")}>
      <Icon className="size-3" />
      {text}
    </span>
  );
}

function Mini({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: string; sub: string; tone: "volt" | "amber" }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 p-3">
      <Icon className={cn("size-3.5", tone === "volt" ? "text-volt" : "text-amber")} />
      <p className="tabular mt-2 text-lg font-light">{value}</p>
      <p className="text-[10px] text-muted-foreground">
        {label} · {sub}
      </p>
    </div>
  );
}
