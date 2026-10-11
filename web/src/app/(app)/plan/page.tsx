import { Suspense } from "react";
import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { EmptyHome } from "@/components/app/empty-home";
import { ExampleBanner, FlagList } from "@/components/app/flags";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { ValueCard } from "@/components/app/value-card";
import { TwinViewProvider } from "@/components/twin/twin-view";
import { getActiveHome } from "@/lib/homes";
import type { RetrofitId } from "@/lib/twin/types";
import { PlanStage } from "./plan-stage";
import { PlanSummary } from "./plan-summary";
import { PlanVariantProvider } from "./plan-variant";
import { Step } from "./step";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlanContent />
    </Suspense>
  );
}

async function PlanContent() {
  const { user, home, twin } = await getActiveHome();
  if (!twin || !home) return <EmptyHome name={user.name} />;
  const packages = { full: twin.package, noHeatPump: twin.packageNoHeatPump };
  const label = (id: RetrofitId) => twin.retrofits.find((r) => r.id === id)?.label ?? id.replaceAll("_", " ");

  return (
    <TwinViewProvider>
      <PlanVariantProvider>
        <section className="sticky top-0 h-[44dvh] min-h-[320px]">
          <PlanStage geometry={twin.geometry} elementScores={twin.elementScores} packages={packages} />
          <div className="pointer-events-none absolute inset-x-0 top-0 px-5 pt-safe">
            <h1 className="pt-3 text-2xl font-semibold tracking-tight">Your plan</h1>
            <p className="text-xs text-muted-foreground">Ordered so each step makes the next one work better</p>
          </div>
        </section>

        <section className="relative z-10 -mt-8 rounded-t-[32px] border-t hairline bg-background px-5 pb-40 pt-5">
          <ExampleBanner twin={twin} />
          <PlanSummary score={twin.score} scoreClass={twin.scoreClass} rating={twin.rating} packages={packages} unavailableReason={twin.unavailableReason} />
          <div className="mt-3 rounded-3xl bg-surface p-4 ring-1 ring-hairline">
            <ValueCard value={twin.value} editHref={`/edit/${home.id}`} />
          </div>
          {twin.unavailableReason && <p className="mt-3 rounded-2xl bg-surface px-3.5 py-3 text-xs text-muted-foreground ring-1 ring-hairline">{twin.unavailableReason}</p>}

          <ol className="relative mt-6 space-y-3 before:absolute before:bottom-6 before:left-[15px] before:top-6 before:w-px before:bg-hairline">
            {twin.retrofits.map((r) => (
              <Step key={r.id} r={r} />
            ))}
          </ol>

          {twin.excluded.length > 0 && (
            <details className="group mt-5 rounded-3xl bg-surface ring-1 ring-hairline">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
                <span>
                  Not recommended <span className="text-muted-foreground">({twin.excluded.length})</span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <ul className="space-y-2 px-4 pb-4 text-sm">
                {twin.excluded.map((e) => (
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
