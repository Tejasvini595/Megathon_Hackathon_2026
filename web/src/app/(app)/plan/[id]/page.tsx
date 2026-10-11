import { Suspense } from "react";
import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { ExampleBanner, FlagList } from "@/components/app/flags";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { ValueCard } from "@/components/app/value-card";
import { TwinViewProvider } from "@/components/twin/twin-view";
import { engineJson, placeOf, engineRecord } from "@/lib/engine";
import { getOwnedHomeTwin } from "@/lib/homes";
import { parseMemory, RETROFIT_LABEL, toEngineMemory } from "@/lib/memory";
import { PlanPdfLink } from "@/app/print/pdf-link";
import type { RetrofitId } from "@/lib/twin/types";
import { AboutYou } from "../about-you";
import { FinanceCard } from "../finance-card";
import { MemoryTimeline } from "../memory-timeline";
import { PlanStage } from "../plan-stage";
import { PlanSummary } from "../plan-summary";
import { PlanVariantProvider } from "../plan-variant";
import { RouteSection } from "../route-section";
import type { RoutePlan } from "../route-types";
import { Step } from "../step";
import { WhyThisOrder } from "../why-order";
import { StepActions, type StepStatus } from "../step-actions";

export const metadata: Metadata = { title: "Plan" };

export default function Page({ params }: PageProps<"/plan/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlanContent params={params} />
    </Suspense>
  );
}

async function PlanContent({ params }: { params: PageProps<"/plan/[id]">["params"] }) {
  const { home, twin } = await getOwnedHomeTwin((await params).id);
  const packages = { full: twin.package, noHeatPump: twin.packageNoHeatPump };
  const memory = parseMemory(home.memory);
  const plan = home.record ? await engineJson<RoutePlan>("/plan", { record: engineRecord(home.record), place: await placeOf(home.postcode), memory: toEngineMemory(memory), top: 3 }) : null;
  // The engine applies memory: done measures are part of the home, declined ones leave the plan. They're listed here so they can be undone.
  const remembered: { id: RetrofitId; status: NonNullable<StepStatus> }[] = [
    ...memory.completed.map((id) => ({ id, status: { kind: "done" as const } })),
    ...(Object.entries(memory.declined) as [RetrofitId, string][]).map(([id, reason]) => ({ id, status: { kind: "declined" as const, reason } })),
  ];
  const excluded = twin.excluded.filter((e) => !remembered.some((m) => m.id === e.id));
  const label = (id: RetrofitId) => twin.retrofits.find((r) => r.id === id)?.label ?? RETROFIT_LABEL[id];

  return (
    <TwinViewProvider>
      <PlanVariantProvider>
        <section className="sticky top-0 h-[44dvh] min-h-[320px]">
          <PlanStage geometry={twin.geometry} elementScores={twin.elementScores} packages={packages} />
          <div className="pointer-events-none absolute inset-x-0 top-0 px-5 pt-safe">
            <div className="flex items-start justify-between gap-3 pt-3">
              <h1 className="text-2xl font-semibold tracking-tight">Your plan</h1>
              <span className="pointer-events-auto">
                <PlanPdfLink homeId={home.id} />
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Ordered so each step makes the next one work better</p>
          </div>
        </section>

        <section className="relative z-10 -mt-8 rounded-t-[32px] border-t hairline bg-background px-5 pb-40 pt-5">
          <ExampleBanner twin={twin} />
          <PlanSummary score={twin.score} scoreClass={twin.scoreClass} rating={twin.rating} packages={packages} unavailableReason={twin.unavailableReason} />
          <div className="mt-3 rounded-3xl bg-surface p-4 ring-1 ring-hairline">
            <ValueCard value={twin.value} editHref={`/edit/${home.id}`} />
          </div>
          {twin.finance && <FinanceCard finance={twin.finance} />}
          {twin.unavailableReason && <p className="mt-3 rounded-2xl bg-surface px-3.5 py-3 text-xs text-muted-foreground ring-1 ring-hairline">{twin.unavailableReason}</p>}

          {twin.retrofits.length > 1 && <WhyThisOrder ids={twin.retrofits.map((r) => r.id)} />}
          {twin.retrofits.length > 1 && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Each step&apos;s savings are what it adds after the steps before it, so they add up to the plan total. The score on each card is that step done on its own.
            </p>
          )}
          <ol className="relative mt-6 space-y-3 before:absolute before:bottom-6 before:left-[15px] before:top-6 before:w-px before:bg-hairline">
            {twin.retrofits.map((r) => (
              <Step key={r.id} r={r} homeId={home.id} status={null} />
            ))}
          </ol>

          {remembered.length > 0 && (
            <div className="mt-5 rounded-3xl bg-surface p-4 ring-1 ring-hairline">
              <h2 className="text-sm font-medium">From what you told us</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Done work is now part of your home&apos;s score and energy; ruled-out measures are left out of the plan.</p>
              <ul className="mt-2 space-y-2">
                {remembered.map((m) => (
                  <li key={m.id}>
                    <span className="text-sm">{label(m.id)}</span>
                    <StepActions homeId={home.id} id={m.id} status={m.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <RouteSection plan={plan?.available === undefined ? null : plan} />
          <AboutYou key={JSON.stringify([memory.renting, memory.listed, memory.budget_gbp])} homeId={home.id} renting={memory.renting} listed={memory.listed} budget={memory.budget_gbp} priority={memory.priority} />
          <MemoryTimeline log={memory.log} />

          {excluded.length > 0 && (
            <details className="group mt-5 rounded-3xl bg-surface ring-1 ring-hairline">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
                <span>
                  Not recommended <span className="text-muted-foreground">({excluded.length})</span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <ul className="space-y-2 px-4 pb-4 text-sm">
                {excluded.map((e) => (
                  <li key={e.id}>
                    <span className="font-medium">{label(e.id)}</span>
                    <span className="block text-xs text-muted-foreground">{e.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <FlagList twin={twin} className="mt-4" />
          <p className="mt-5 text-xs text-muted-foreground">All savings are estimates, not guarantees. Ranges show the 10th to 90th percentile; the tick marks the middle estimate. Value figures are indicative.</p>
        </section>
      </PlanVariantProvider>
    </TwinViewProvider>
  );
}
