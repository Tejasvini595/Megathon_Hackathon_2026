import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ArrowLeft, ServerOff } from "lucide-react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { engineJson } from "@/lib/engine";
import { formatGbp } from "@/lib/score";
import { EvidenceSection } from "./evidence-section";
import { ScoreSection } from "./score-section";
import { Scroll, Section, td, th } from "./section";
import type { Methods } from "./types";

export const metadata: Metadata = { title: "How we calculate" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  await connection();     // read live at request time: prerendered at build (no engine there) it would always say "unavailable"
  const m = await engineJson<Methods>("/methods");
  const ok = m && m.score && Array.isArray(m.retrofits) && m.evidence;

  return (
    <div className="mx-auto max-w-md px-5 pt-safe pb-24">
      <Link href="/" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowLeft className="size-3.5" /> Back
      </Link>
      <h1 className="pt-2 text-2xl font-semibold tracking-tight">How we calculate</h1>
      <p className="mt-1 text-xs text-muted-foreground">Every number in the app comes from these models and rules.</p>
      {!ok ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-3xl bg-surface p-8 text-center ring-1 ring-hairline">
          <ServerOff className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">The methods aren&apos;t available right now</p>
          <p className="text-xs text-muted-foreground">They are read live from the engine, which is not reachable. Try again in a moment.</p>
        </div>
      ) : (
        <Body m={m} />
      )}
    </div>
  );
}

const pct = (v: number) => `${v}%`;

function Body({ m }: { m: Methods }) {
  const { carbon, value, finance } = m;
  return (
    <>
      <ScoreSection score={m.score} />

      <Section id="carbon" title="Carbon" hint={`Factors in ${carbon.unit}.`}>
        <p className="tabular rounded-2xl bg-surface-2 px-3.5 py-3 text-xs">{carbon.formula}</p>
        <ul className="mt-3 space-y-1.5">
          {carbon.factors.map((f) => (
            <li key={f.fuel} className="flex items-baseline justify-between text-sm">
              <span>{f.fuel}</span>
              <span className="tabular font-semibold">{f.value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">Source: {carbon.source}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Tariffs ({carbon.tariffs.unit}): electricity <span className="tabular text-foreground">{carbon.tariffs.electricity}</span>, gas <span className="tabular text-foreground">{carbon.tariffs.gas}</span>. {carbon.tariffs.note}
        </p>
      </Section>

      <Section id="retrofits" title="Retrofits" hint="The catalogue behind every measure.">
        <Scroll>
          <table className="w-full min-w-[560px]">
            <thead>
              <tr>
                {["Measure", "Cost", "Typical impact", "Source"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...m.retrofits]
                .sort((a, b) => a.order - b.order)
                .map((r) => (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className={td}>{r.label}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {formatGbp(r.costLowGbp)} to {formatGbp(r.costHighGbp)}
                    </td>
                    <td className={td}>{r.impact}</td>
                    <td className={`${td} text-muted-foreground`}>
                      {r.impactSource}. Cost: {r.costSource}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Scroll>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {m.payback.rule} High is {m.payback.highYears} years or less, Medium up to {m.payback.mediumYears}.
        </p>
      </Section>

      <Section id="value" title="Value">
        <p className="tabular rounded-2xl bg-surface-2 px-3.5 py-3 text-xs">{value.formula}</p>
        {value.ratingPremium.pctPer10Sap != null && (
          <p className="mt-3 text-xs text-muted-foreground">
            Rating premium in the production model: <span className="tabular text-foreground">{value.ratingPremium.pctPer10Sap.toFixed(1)}%</span> per 10 SAP points
            {value.ratingPremium.nSales ? `, from ${value.ratingPremium.nSales.toLocaleString("en-GB")} sales` : ""}.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{value.range}. {value.unavailable}</p>
        <p className="mt-3 rounded-2xl bg-amber/10 px-3.5 py-3 text-xs text-amber">{value.note}</p>
      </Section>

      <Section id="finance" title="Finance illustration" hint="Illustration only, not a quote or financial advice.">
        <ul className="space-y-2">
          {finance.loans.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span>{l.label}</span>
              <span className="tabular text-xs text-muted-foreground">
                {pct(l.aprPct)} over {l.terms.join(" or ")} years
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          EPC band C starts at SAP <span className="tabular text-foreground">{finance.epcCSap}</span>; within <span className="tabular text-foreground">{finance.borderlineSap}</span> SAP points of a recorded rating the answer is
          &quot;borderline&quot;. Heat pump grant assumed: <span className="tabular text-foreground">{formatGbp(finance.heatPumpGrantGbp)}</span>, eligibility not checked.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
          {finance.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Section>

      <EvidenceSection evidence={m.evidence} />

      <Section id="limitations" title="Limitations">
        <ul className="list-disc space-y-2 pl-4 text-xs text-muted-foreground">
          {m.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
