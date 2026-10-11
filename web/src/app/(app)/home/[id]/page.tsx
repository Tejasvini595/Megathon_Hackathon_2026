import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Flame, HelpCircle, Leaf, Search, Thermometer, TriangleAlert, Zap, type LucideIcon } from "lucide-react";
import { EpcLadder } from "@/components/app/epc-ladder";
import { ExampleBanner, FlagList } from "@/components/app/flags";
import { RatingChip } from "@/components/app/rating";
import { FocusButton, TwinViewProvider } from "@/components/twin/twin-view";
import { findPostcode } from "@/lib/geo/postcode";
import { getOwnedHomeTwin } from "@/lib/homes";
import { prisma } from "@/lib/prisma";
import { formatGbp, formatNumber, formatSaving, scoreTone } from "@/lib/score";
import type { ElementScores, TwinState } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { HomeSheet } from "../home-sheet";
import { HomeSkeleton } from "../home-skeleton";
import { HomeStage, type PartInfo } from "../home-stage";
import { HomeSwitcher } from "../home-switcher";
import { ScoreRing, type RangeNote } from "../score-ring";
import { ShareButton } from "../share-button";

export const metadata: Metadata = { title: "Home" };

export default function Page({ params }: PageProps<"/home/[id]">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent params={params} />
    </Suspense>
  );
}

const ELEMENTS: { key: keyof ElementScores; label: string }[] = [
  { key: "walls", label: "Walls" },
  { key: "roof", label: "Roof" },
  { key: "windows", label: "Windows" },
  { key: "floor", label: "Floor" },
];

const band = (b: { p10: number; p90: number }) => `${Math.round(b.p10).toLocaleString("en-GB")} to ${Math.round(b.p90).toLocaleString("en-GB")}`;

/** What the matching retrofit would save, straight from the engine's estimate. */
function partInfo(twin: TwinState): PartInfo {
  return Object.fromEntries(
    ELEMENTS.map(({ key, label }) => {
      const r = twin.retrofits.find((x) => x.element === key);
      const saving = r && r.billSavingGbp > 0 ? `${r.label}: about ${formatGbp(r.billSavingGbp)} a year, gas ${band(r.gasSavingKwh)} kWh (estimate)` : null;
      return [key, { label, saving }];
    }),
  ) as PartInfo;
}

function rangeNote(twin: TwinState, homeId: string): RangeNote {
  const notes = twin.components.flatMap((c) =>
    c.subScore === null
      ? [`${c.label}: not known yet, so it is left out of the score.`]
      : c.estimated
        ? [`${c.label}: estimated from your home's details, not a recorded rating.`]
        : [],
  );
  if (twin.rating.source !== "recorded" && !twin.components.some((c) => c.key === "energy_efficiency" && c.estimated)) {
    notes.unshift(
      twin.rating.source === "band"
        ? "Energy efficiency: only your EPC band is known, not the exact SAP rating."
        : "Energy efficiency: no EPC rating on record, so it is estimated from the home's details.",
    );
  }
  const estimated = twin.rating.source === "estimated";
  return {
    chip: estimated ? "Estimated rating" : "Provisional",
    headline: estimated ? "This rating is estimated" : "This score is provisional",
    notes,
    editHref: `/edit/${homeId}`,
  };
}

async function HomeContent({ params }: { params: PageProps<"/home/[id]">["params"] }) {
  const { user, home, twin } = await getOwnedHomeTwin((await params).id);

  const homes = await prisma.home.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, nickname: true, postcode: true, status: true },
  });

  const next = twin.retrofits[0];
  const lat = home.postcode ? ((await findPostcode(home.postcode))?.lat ?? null) : null;
  const editHref = `/edit/${home.id}`;
  const pkg = twin.package;

  return (
    <TwinViewProvider>
      <section className="sticky top-0 h-[64dvh] min-h-[420px] w-full">
        <HomeStage
          geometry={twin.geometry}
          elementScores={twin.elementScores}
          parts={partInfo(twin)}
          needs={twin.needsInfo.map(({ id, question }) => ({ id, question }))}
          editHref={editHref}
          lat={lat}
        />
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-safe">
          <div className="pointer-events-auto pt-3">
            <HomeSwitcher
              homes={homes}
              currentHomeId={home.id}
              nickname={twin.nickname}
              postcode={twin.postcode}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <RatingChip rating={twin.rating} />
            <ShareButton key={home.id} homeId={home.id} sharedPath={home.shareSlug ? `/t/${home.shareSlug}` : null} />
          </div>
        </header>
      </section>

      <HomeSheet>
        <ExampleBanner twin={twin} />

        <div className="flex items-start gap-5">
          <ScoreRing
            score={twin.score}
            label={twin.scoreClass}
            range={twin.scoreRange}
            note={twin.scoreRange ? rangeNote(twin, home.id) : undefined}
          />
          <div className="flex-1 space-y-3 pt-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Green Home Score</p>
              {twin.isPoor && (
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-ember/15 px-2 py-0.5 text-[11px] font-medium text-ember">
                  <TriangleAlert className="size-3" /> Poorly performing
                </p>
              )}
              {pkg && (
                <p className="mt-1.5 text-sm leading-snug">
                  Your plan could take you to{" "}
                  <span className="tabular font-semibold" style={{ color: scoreTone(pkg.scoreAfter) }}>
                    {pkg.scoreAfter} · {pkg.classAfter}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        <Card title="Your EPC rating" hint={pkg ? `Plan: ${twin.rating.band} to ${pkg.bandAfter}` : undefined} className="mt-6">
          <EpcLadder band={twin.rating.band} range={twin.rating.range?.band} after={pkg?.bandAfter} size="sm" />
        </Card>

        <Card title="Insulation, part by part" hint="Tap to see it on the house" className="mt-4">
          <InsulationList scores={twin.elementScores} />
        </Card>

        {twin.needsInfo.map((n) => (
          <Link
            key={n.id}
            href={editHref}
            className="mt-4 flex items-start gap-3 rounded-3xl bg-amber/10 p-4 ring-1 ring-amber/30 transition-transform active:scale-[0.99]"
          >
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-amber text-black">
              <HelpCircle className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Confirm your {needsLabel(n.id)} to unlock this saving</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{n.question}</span>
            </span>
            <ArrowRight className="mt-1 size-4 shrink-0 text-amber" />
          </Link>
        ))}

        <div className="-mx-5 mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          <Stat icon={Flame} label="Gas" value={formatNumber(twin.energy.gasKwh)} unit="kWh/yr" />
          <Stat icon={Zap} label="Electricity" value={formatNumber(twin.energy.elecKwh)} unit="kWh/yr" />
          <Stat icon={Thermometer} label="Intensity" value={formatNumber(twin.energy.intensityKwhM2)} unit="kWh/m²" />
          <Stat icon={Leaf} label="Carbon" value={formatNumber(twin.carbonKg != null ? twin.carbonKg / 1000 : null, 1)} unit="t CO₂e/yr" />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {twin.energy.source === "metered" ? `Annualised from ${twin.energy.monthsMetered} months of meter readings.` : "Modelled from the home's details, not metered."}
        </p>

        {twin.unavailableReason && (
          <p className="mt-4 rounded-2xl bg-surface px-3.5 py-3 text-xs text-muted-foreground ring-1 ring-hairline">{twin.unavailableReason}</p>
        )}

        {twin.keyIssues.length > 0 && (
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
        )}

        {next && (
          <Link href={`/plan/${home.id}`} className="mt-4 block rounded-3xl bg-[linear-gradient(135deg,color-mix(in_oklch,var(--volt)_20%,transparent),transparent_70%)] p-4 ring-1 ring-volt/25 transition-transform active:scale-[0.99]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.16em] text-volt">Start here</p>
              <span className="flex items-center gap-1 rounded-full bg-volt/15 px-2 py-0.5 text-[10px] font-medium text-volt">
                {(next.relevance?.tier ?? next.suitability) === "needs survey" && <Search className="size-3" />}
                {next.relevance?.tier ?? next.suitability} fit
              </span>
            </div>
            <p className="mt-1.5 text-lg font-medium">{next.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{next.reason}</p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="tabular">
                {formatSaving(next.gasSavingKwh.p50 + next.elecSavingKwh.p50)} kWh/yr (est.) · score → {next.scoreAfter}
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
                style={{ width: `${c.contribution ?? 0}%`, background: `var(--chart-${(i % 5) + 1})`, animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-3">
            {twin.components.map((c, i) => (
              <li key={c.key} className="flex items-start gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: `var(--chart-${(i % 5) + 1})` }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm">
                      {c.label}
                      {(c.estimated || c.subScore === null) && (
                        <span className="ml-1.5 rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] text-amber">{c.subScore === null ? "missing" : "estimated"}</span>
                      )}
                    </span>
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
          <Link href="/methods" className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
            How we calculate <ArrowRight className="size-3" />
          </Link>
        </Card>

        <FlagList twin={twin} className="mt-4" />
      </HomeSheet>
    </TwinViewProvider>
  );
}

const NEEDS_LABEL: Partial<Record<string, string>> = {
  floor_insulation: "floor insulation",
  loft_insulation: "loft insulation",
  cavity_wall_insulation: "wall construction",
  solid_wall_insulation: "wall construction",
  double_glazing: "glazing",
  solar_pv: "roof details",
  heat_pump: "heating system",
};
const needsLabel = (id: string) => NEEDS_LABEL[id] ?? "home details";

function InsulationList({ scores }: { scores: ElementScores }) {
  return (
    <div className="space-y-1">
      {ELEMENTS.map(({ key, label }, i) => {
        const v = scores[key];
        return (
          <FocusButton key={key} element={key} className="rounded-xl px-2 py-1.5 transition-colors data-[active=true]:bg-surface-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground group-data-[active=true]:text-foreground">{label}</span>
              {v == null ? <span className="text-xs text-muted-foreground">not applicable</span> : <span className="tabular font-medium">{Math.round(v)}/100</span>}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              {v != null && (
                <div
                  className="h-full origin-left animate-grow rounded-full"
                  style={{ width: `${Math.max(v, 3)}%`, animationDelay: `${i * 60}ms`, background: v < 25 ? "var(--ember)" : v < 55 ? "var(--amber)" : "var(--frost)" }}
                />
              )}
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
