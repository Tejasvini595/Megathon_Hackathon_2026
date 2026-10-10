import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ChevronDown, Flame, Info, Leaf, Sparkles, Thermometer, TriangleAlert, Zap, type LucideIcon } from "lucide-react";
import { EmptyHome } from "@/components/app/empty-home";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { FocusButton, TwinViewProvider } from "@/components/twin/twin-view";
import { getActiveHome } from "@/lib/homes";
import { formatNumber, formatSaving, scoreTone } from "@/lib/score";
import type { Element, TwinState } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { HomeStage } from "./home-stage";
import { ScoreRing } from "./score-ring";
import { ShareButton } from "./share-button";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

const ELEMENTS: { key: Element; label: string }[] = [
  { key: "walls", label: "Walls" },
  { key: "roof", label: "Roof" },
  { key: "windows", label: "Windows" },
  { key: "draughts", label: "Draughts" },
  { key: "floor", label: "Floor" },
];

async function HomeContent() {
  const { user, home, twin } = await getActiveHome();
  if (!twin) return <EmptyHome name={user.name} />;
  const next = twin.retrofits[0];

  return (
    <TwinViewProvider>
      <section className="sticky top-0 h-[64dvh] min-h-[420px] w-full">
        <HomeStage geometry={twin.geometry} heatLoss={twin.heatLoss} />
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-safe">
          <div className="pt-3">
            <h1 className="flex items-center gap-1 text-2xl font-semibold tracking-tight">
              {twin.nickname} <ChevronDown className="mt-1 size-4 text-muted-foreground" />
            </h1>
            <p className="text-xs text-muted-foreground">{[twin.postcode, twin.epcBand && `EPC ${twin.epcBand}`].filter(Boolean).join(" · ") || "No postcode"}</p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
              <span className="size-1.5 rounded-full" style={{ background: scoreTone(twin.score) }} />
              <span className="tabular font-medium">{twin.score}</span>
              <span className="text-muted-foreground">{twin.scoreClass}</span>
            </div>
            <ShareButton sharedPath={home.shareSlug ? `/t/${home.shareSlug}` : null} />
          </div>
        </header>
      </section>

      {/* Opaque sheet: a backdrop blur over a live WebGL canvas would re-blur every frame. */}
      <section className="relative z-10 -mt-10 rounded-t-[32px] border-t hairline bg-background px-5 pb-40 pt-3">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-surface-2" />

        {twin.source === "mock" && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl bg-amber/10 px-3.5 py-2.5 text-xs text-amber">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>Preview numbers. The engine isn&apos;t connected yet, so figures are illustrative; your home&apos;s shape is real.</span>
          </div>
        )}

        <div className="flex items-center gap-5">
          <ScoreRing score={twin.score} label={twin.scoreClass} />
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

        <Card title="Where your heat goes" hint="Tap to see it on the house" className="mt-7">
          <HeatBars twin={twin} />
          <p className="mt-3 text-xs text-muted-foreground">
            Total fabric heat loss <span className="tabular text-foreground">{twin.heatLossWPerK} W/K</span>
          </p>
        </Card>

        <div className="-mx-5 mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          <Stat icon={Flame} label="Gas" value={formatNumber(twin.energy.gasKwh)} unit="kWh/yr" />
          <Stat icon={Zap} label="Electricity" value={formatNumber(twin.energy.elecKwh)} unit="kWh/yr" />
          <Stat icon={Thermometer} label="Intensity" value={formatNumber(twin.energy.intensityKwhM2)} unit="kWh/m²" />
          <Stat icon={Leaf} label="Carbon" value={formatNumber(twin.carbonKg != null ? twin.carbonKg / 1000 : null, 1)} unit="t CO₂e/yr" />
        </div>

        {twin.energy.performanceGapPct != null && Math.abs(twin.energy.performanceGapPct) >= 10 && (
          <div className="mt-4 rounded-3xl bg-[linear-gradient(135deg,color-mix(in_oklch,var(--ember)_18%,transparent),transparent)] p-4 ring-1 ring-ember/20">
            <p className="text-[11px] uppercase tracking-[0.16em] text-ember">Performance gap</p>
            <p className="mt-1 text-lg leading-snug">
              This home uses <span className="tabular font-semibold">{Math.abs(twin.energy.performanceGapPct)}%</span> {twin.energy.performanceGapPct > 0 ? "more" : "less"} gas than its
              construction suggests.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Based on {twin.energy.monthsMetered} months of meter readings.</p>
          </div>
        )}

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
                {formatSaving(next.gasSavingKwh.p50 + next.elecSavingKwh.p50)} kWh/yr · score → {next.scoreAfter}
              </span>
              <span className="flex items-center gap-1 font-medium">
                Full plan <ArrowRight className="size-4" />
              </span>
            </div>
          </Link>
        )}

        <Card title="Why this score" hint="Weight × sub-score" className="mt-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
            {twin.components.map((c, i) => (
              <div
                key={c.key}
                className="h-full origin-left animate-grow border-r border-background last:border-0"
                style={{ width: `${c.contribution}%`, background: `var(--chart-${(i % 5) + 1})`, animationDelay: `${i * 60}ms` }}
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
                      <span className="font-semibold">{formatNumber(c.contribution, 1)}</span>
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
    </TwinViewProvider>
  );
}

function HeatBars({ twin }: { twin: TwinState }) {
  const max = Math.max(...Object.values(twin.heatLoss));
  return (
    <div className="space-y-1">
      {ELEMENTS.map(({ key, label }, i) => {
        const share = twin.heatLoss[key];
        const t = share / max;
        return (
          <FocusButton key={key} element={key} className="rounded-xl px-2 py-1.5 transition-colors data-[active=true]:bg-surface-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground group-data-[active=true]:text-foreground">{label}</span>
              <span className="tabular font-medium">{Math.round(share * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full origin-left animate-grow rounded-full"
                style={{ width: `${t * 100}%`, animationDelay: `${i * 60}ms`, background: t > 0.75 ? "var(--ember)" : t > 0.45 ? "var(--amber)" : "var(--frost)" }}
              />
            </div>
          </FocusButton>
        );
      })}
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
  const filled = Math.round(value * 5);
  return (
    <div>
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < filled ? "bg-foreground/80" : "bg-surface-2")} />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Data confidence {Math.round(value * 100)}%</p>
    </div>
  );
}
