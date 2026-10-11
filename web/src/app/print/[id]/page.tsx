import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOwnedHomeTwin } from "@/lib/homes";
import { parseMemory } from "@/lib/memory";
import { formatGbp, formatNumber } from "@/lib/score";
import type { RetrofitId } from "@/lib/twin/types";
import { PrintButton } from "../print-button";
import { gbpRange } from "../format";
import { Components, FinanceTable, Section, Steps, Totals } from "../sections";

export const metadata: Metadata = { title: "Plan summary" };

// Light palette on paper whatever the app theme: overrides the tokens the utilities read.
const PAGE_CSS = `
@page { size: A4; margin: 14mm }
.print-sheet { --background: #fff; --foreground: #111; --muted-foreground: #555; --hairline: rgb(0 0 0 / 15%); --surface: rgb(0 0 0 / 4%); --volt: #0a7d55; --amber: #a86a00; --ember: #c2410c; --frost: #1d6fa5; color-scheme: light; background: var(--background); color: var(--foreground) }
@media print { .print-sheet { font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact } body { background: #fff } }
`;

export default function Page({ params }: PageProps<"/print/[id]">) {
  return (
    <div className="print-sheet min-h-dvh">
      <style>{PAGE_CSS}</style>
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Preparing your summary…</p>}>
        <PrintContent params={params} />
      </Suspense>
    </div>
  );
}

async function PrintContent({ params }: { params: PageProps<"/print/[id]">["params"] }) {
  const id = (await params).id;
  const { home, twin } = await getOwnedHomeTwin(id);
  const memory = parseMemory(home.memory);
  const labelOf = (rid: string) => twin.retrofits.find((r) => r.id === rid)?.label ?? rid.replaceAll("_", " ");
  const declined = Object.entries(memory.declined) as [RetrofitId, string][];
  const isMock = twin.source === "mock" || twin.modelVersion === "mock";
  const { rating, value } = twin;
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const flags = twin.flags.filter((f) => !(isMock && f.message.startsWith("Example data")));

  return (
    <main className="mx-auto max-w-[210mm] px-6 py-6 text-sm print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/plan/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to plan
        </Link>
        <PrintButton />
      </div>

      <header className="flex items-end justify-between gap-4 border-b-2 border-foreground pb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Green Home Twin · Retrofit plan</p>
          <h1 className="text-2xl font-semibold tracking-tight">{twin.nickname}</h1>
          <p className="text-xs text-muted-foreground">{twin.postcode ?? "No postcode"}</p>
        </div>
        <p className="text-xs text-muted-foreground">Generated {date}</p>
      </header>

      {isMock && <p className="mt-3 rounded border border-foreground/30 px-3 py-2 text-xs font-semibold">Example data, engine not connected. Figures are illustrative.</p>}
      {twin.unavailableReason && <p className="mt-3 rounded border border-foreground/30 px-3 py-2 text-xs">{twin.unavailableReason}</p>}

      <Section title="Green Home Score">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p>
            <span className="text-3xl font-semibold tabular">{formatNumber(twin.score)}</span>
            <span className="text-muted-foreground">/100 · </span>
            <span className="font-semibold">{twin.scoreClass}</span>
            {twin.scoreRange && (
              <span className="text-xs text-muted-foreground">
                {" "}
                (provisional, {formatNumber(twin.scoreRange.low)}–{formatNumber(twin.scoreRange.high)})
              </span>
            )}
          </p>
          <p className="text-xs">
            EPC band <span className="font-semibold">{rating.band}</span> (SAP {formatNumber(rating.sap)})
            {rating.source === "estimated" && rating.range && (
              <span className="text-muted-foreground">
                {" "}
                · estimated, likely {rating.range.band[0]}–{rating.range.band[1]} (SAP {formatNumber(rating.range.sap[0])}–{formatNumber(rating.range.sap[1])})
              </span>
            )}
          </p>
        </div>
      </Section>

      <Section title="Why this score (points / weight)">
        <Components components={twin.components} />
      </Section>

      {twin.keyIssues.length > 0 && (
        <Section title="Key issues">
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {twin.keyIssues.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </Section>
      )}

      {twin.retrofits.length > 0 && (
        <Section title="The plan, in order">
          <Steps retrofits={twin.retrofits} />
        </Section>
      )}

      {twin.package && (
        <Section title="Package totals">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Totals title="Recommended plan" pkg={twin.package} labelOf={labelOf} />
            {twin.packageNoHeatPump && <Totals title="Alternative without a heat pump" pkg={twin.packageNoHeatPump} labelOf={labelOf} />}
          </div>
        </Section>
      )}

      {(value.valueAfterGbp || value.upliftPct) && (
        <Section title="Value">
          <div className="break-inside-avoid text-xs">
            {value.currentGbp != null && <p>Current value: {formatGbp(value.currentGbp)}</p>}
            {value.valueAfterGbp && <p>Value after the plan: {gbpRange(value.valueAfterGbp)}</p>}
            {value.upliftPct && (
              <p>
                Indicative uplift: {formatNumber(value.upliftPct[0], 1)}–{formatNumber(value.upliftPct[1], 1)}%
              </p>
            )}
            <p className="text-muted-foreground">{value.note}</p>
          </div>
        </Section>
      )}

      {twin.finance && (
        <Section title="Monthly cost illustration">
          <FinanceTable finance={twin.finance} />
        </Section>
      )}

      {(memory.completed.length > 0 || declined.length > 0 || memory.renting || memory.listed || memory.budget_gbp != null) && (
        <Section title="Your situation">
          <ul className="space-y-0.5 text-xs">
            {memory.completed.length > 0 && <li>Already done: {memory.completed.map(labelOf).join(", ")}</li>}
            {declined.map(([rid, reason]) => (
              <li key={rid}>
                Declined: {labelOf(rid)} ({reason})
              </li>
            ))}
            {memory.renting && <li>Renting</li>}
            {memory.listed && <li>Listed building</li>}
            {memory.budget_gbp != null && <li>Budget: {formatGbp(memory.budget_gbp)}</li>}
          </ul>
        </Section>
      )}

      <footer className="mt-6 break-inside-avoid border-t border-foreground/20 pt-2 text-[11px] text-muted-foreground">
        {flags.length > 0 && (
          <ul className="mb-1.5 list-disc pl-4">
            {flags.map((f) => (
              <li key={f.field + f.message}>{f.message}</li>
            ))}
          </ul>
        )}
        <p>All savings are estimates, not guarantees. Ranges show the 10th to 90th percentile; the middle estimate is in brackets. Savings per step are marginal within the plan, so they add up to the package. Value figures are indicative.</p>
        <p className="mt-1">Model version {twin.modelVersion}</p>
      </footer>
    </main>
  );
}
