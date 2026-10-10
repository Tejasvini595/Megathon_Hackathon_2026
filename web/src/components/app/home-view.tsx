"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, Flame, Info, Leaf, Sparkles, Thermometer, TriangleAlert, Zap, type LucideIcon
} from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import type { Focus } from "@/components/twin/scene";
import type { ViewMode } from "@/components/twin/house";
import { ScoreRing, scoreTone } from "@/components/app/score-ring";
import { Segmented } from "@/components/app/segmented";
import type { Element, TwinState } from "@/lib/twin/types";
import { cn } from "@/lib/utils";

const ELEMENTS: { key: Element; label: string }[] = [
  { key: "walls", label: "Walls" },
  { key: "roof", label: "Roof" },
  { key: "windows", label: "Windows" },
  { key: "draughts", label: "Draughts" },
  { key: "floor", label: "Floor" },
];

const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function HomeView({ twin, source }: { twin: TwinState; source: "engine" | "mock" }) {
  const [mode, setMode] = useState<ViewMode>("normal");
  const [focus, setFocus] = useState<Focus>(null);

  function focusElement(el: Element) {
    setMode("thermal");
    setFocus((f) => (f === el ? null : el));
  }

  const maxShare = Math.max(...Object.values(twin.heatLoss));
  const next = twin.retrofits[0];

  return (
    <div className="relative">
      {/* Hero: the twin */}
      <section className="sticky top-0 h-[64dvh] min-h-[420px] w-full">
        <TwinCanvas geometry={twin.geometry} heatLoss={twin.heatLoss} mode={mode} focus={focus} className="!absolute inset-0" />

        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-safe">
          <div className="pointer-events-auto pt-3">
            <button className="flex items-center gap-1 text-left">
              <h1 className="text-2xl font-semibold tracking-tight">{twin.nickname}</h1>
              <ChevronDown className="mt-1 size-4 text-muted-foreground" />
            </button>
            <p className="text-xs text-muted-foreground">
              {[twin.postcode, twin.epcBand && `EPC ${twin.epcBand}`].filter(Boolean).join(" · ") || "No postcode"}
            </p>
          </div>
          <div className="pointer-events-auto mt-3 flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs">
            <span className="size-1.5 rounded-full" style={{ background: scoreTone(twin.score), boxShadow: `0 0 8px ${scoreTone(twin.score)}` }} />
            <span className="tabular font-medium">{twin.score}</span>
            <span className="text-muted-foreground">{twin.scoreClass}</span>
          </div>
        </header>

        <div className="absolute inset-x-0 bottom-14 flex flex-col items-center gap-3">
          <AnimatePresence>
            {mode === "thermal" && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
              >
                <span>Less heat lost</span>
                <span className="h-1 w-24 rounded-full bg-[linear-gradient(90deg,#2f8cff,#ffb020,#ff3b1f)]" />
                <span>More</span>
              </motion.div>
            )}
          </AnimatePresence>
          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m);
              if (m === "normal") setFocus(null);
            }}
            options={[
              { value: "normal", label: "Home" },
              { value: "thermal", label: <><Thermometer className="size-3.5" /> Thermal</> },
            ]}
          />
        </div>
      </section>

      {/* Sheet */}
      <section className="relative z-10 -mt-10 rounded-t-[32px] border-t hairline bg-background/85 px-5 pb-40 pt-3 backdrop-blur-2xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-surface-2" />

        {source === "mock" && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl bg-amber/10 px-3.5 py-2.5 text-xs text-amber">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>Preview numbers. The engine isn&apos;t connected yet, so figures are illustrative; your home&apos;s shape is real.</span>
          </div>
        )}

        {/* Score */}
        <div className="flex items-center gap-5">
          <ScoreRing score={twin.score} label={twin.scoreClass} size={140} />
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Green Home Score</p>
              <p className="mt-1 text-sm leading-snug">
                Your plan could take you to{" "}
                <span className="tabular font-semibold" style={{ color: scoreTone(twin.package.scoreAfter) }}>
                  {twin.package.scoreAfter} · {twin.package.classAfter}
                </span>
              </p>
            </div>
            <ConfidenceMeter value={twin.confidence} />
          </div>
        </div>

        {/* Where heat goes */}
        <Card title="Where your heat goes" hint="Tap to see it on the house" className="mt-7">
          <div className="space-y-2.5">
            {ELEMENTS.map(({ key, label }) => {
              const share = twin.heatLoss[key];
              const active = focus === key;
              const t = share / maxShare;
              return (
                <button key={key} onClick={() => focusElement(key)} className={cn("group w-full rounded-xl px-2 py-1.5 text-left transition-colors", active && "bg-surface-2")}>
                  <div className="flex items-center justify-between text-sm">
                    <span className={cn(active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                    <span className="tabular font-medium">{Math.round(share * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${t * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                      style={{ background: t > 0.75 ? "var(--ember)" : t > 0.45 ? "var(--amber)" : "var(--frost)" }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Total fabric heat loss <span className="tabular text-foreground">{twin.heatLossWPerK} W/K</span>
          </p>
        </Card>

        {/* Stats */}
        <div className="-mx-5 mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          <Stat icon={Flame} label="Gas" value={fmt(twin.energy.gasKwh)} unit="kWh/yr" />
          <Stat icon={Zap} label="Electricity" value={fmt(twin.energy.elecKwh)} unit="kWh/yr" />
          <Stat icon={Thermometer} label="Intensity" value={fmt(twin.energy.intensityKwhM2)} unit="kWh/m²" />
          <Stat icon={Leaf} label="Carbon" value={fmt(twin.carbonKg != null ? twin.carbonKg / 1000 : null, 1)} unit="t CO₂e/yr" />
        </div>

        {twin.energy.performanceGapPct != null && Math.abs(twin.energy.performanceGapPct) >= 10 && (
          <div className="mt-4 rounded-3xl bg-[linear-gradient(135deg,color-mix(in_oklch,var(--ember)_18%,transparent),transparent)] p-4 ring-1 ring-ember/20">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ember">Performance gap</p>
            <p className="mt-1 text-lg leading-snug">
              This home uses <span className="tabular font-semibold">{Math.abs(twin.energy.performanceGapPct)}%</span>{" "}
              {twin.energy.performanceGapPct > 0 ? "more" : "less"} gas than its construction suggests.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Based on {twin.energy.monthsMetered} months of meter readings.</p>
          </div>
        )}

        {/* Key issues */}
        <Card title="Key issues" className="mt-4">
          <ul className="space-y-2.5">
            {twin.keyIssues.map((issue) => (
              <li key={issue} className="flex gap-2.5 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Next step */}
        {next && (
          <Link href="/plan" className="mt-4 block rounded-3xl bg-[linear-gradient(135deg,color-mix(in_oklch,var(--volt)_20%,transparent),transparent_70%)] p-4 ring-1 ring-volt/25 transition-transform active:scale-[0.99]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.16em] text-volt">Start here</p>
              <span className="rounded-full bg-volt/15 px-2 py-0.5 text-[10px] font-medium text-volt">{next.suitability} fit</span>
            </div>
            <p className="mt-1.5 text-lg font-medium">{next.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{next.reason}</p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="tabular">
                Saves ~{fmt(next.gasSavingKwh.p50 + next.elecSavingKwh.p50)} kWh/yr · score → {next.scoreAfter}
              </span>
              <span className="flex items-center gap-1 font-medium">
                Full plan <ArrowRight className="size-4" />
              </span>
            </div>
          </Link>
        )}

        {/* Breakdown */}
        <Card title="Why this score" hint="Weight × sub-score" className="mt-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
            {twin.components.map((c, i) => (
              <motion.div
                key={c.key}
                initial={{ width: 0 }}
                whileInView={{ width: `${c.contribution}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.05 }}
                className="h-full border-r border-background last:border-0"
                style={{ background: `var(--chart-${(i % 5) + 1})` }}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-3">
            {twin.components.map((c, i) => (
              <li key={c.key} className="flex items-start gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: `var(--chart-${(i % 5) + 1})` }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm">{c.label}</span>
                    <span className="tabular text-sm">
                      <span className="font-semibold">{fmt(c.contribution, 1)}</span>
                      <span className="text-muted-foreground"> / {Math.round(c.weight * 100)}</span>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {twin.flags.length > 0 && (
          <div className="mt-4 space-y-2">
            {twin.flags.map((f) => (
              <div key={f.field + f.message} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Sparkles className={cn("mt-0.5 size-3.5 shrink-0", f.severity === "warn" ? "text-amber" : "text-frost")} />
                {f.message}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ title, hint, className, children }: { title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-3xl bg-surface p-4 ring-1 ring-hairline", className)}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value, unit }: { icon: LucideIcon; label: string; value: string; unit: string }) {
  return (
    <div className="min-w-[132px] snap-start rounded-3xl bg-surface p-4 ring-1 ring-hairline">
      <Icon className="size-4 text-muted-foreground" />
      <p className="tabular mt-3 text-2xl font-light tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">
        {label} · {unit}
      </p>
    </div>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const bars = 5;
  const filled = Math.round(value * bars);
  return (
    <div>
      <div className="flex gap-1">
        {Array.from({ length: bars }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < filled ? "bg-foreground/80" : "bg-surface-2")} />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Data confidence {Math.round(value * 100)}%</p>
    </div>
  );
}
