"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { formatGbp } from "@/lib/score";
import type { Finance, FinanceOption, FinancePlan, MonthlyRange } from "@/lib/twin/types";
import { cn } from "@/lib/utils";
import { usePlanVariant } from "./plan-variant";

const gbp = (a: number, b: number) => `${formatGbp(a)}–${formatGbp(b)}`;
const abs = Math.abs;
const pence = (gbp: number) => +(gbp * 100).toFixed(2);

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("rounded-full px-3 py-1.5 text-xs ring-1 transition-colors", on ? "bg-volt-dim text-volt ring-volt" : "text-muted-foreground ring-hairline")}>
      {children}
    </button>
  );
}

/** Bar widths show magnitude; the text keeps the engine's sign (a negative saving means bills rise). */
function Bar({ label, range, scale, tone, text }: { label: string; range: MonthlyRange; scale: number; tone: string; text?: string }) {
  const lo = abs(Math.min(...range));
  const hi = abs(Math.max(...range));
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-medium">{text ?? `${gbp(lo, hi)} a month`}</span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-hairline">
        <motion.div className={cn("absolute inset-y-0 left-0 rounded-full opacity-35", tone)} initial={false} animate={{ width: pct(hi) }} transition={{ type: "spring", stiffness: 160, damping: 24 }} />
        <motion.div className={cn("absolute inset-y-0 left-0 rounded-full", tone)} initial={false} animate={{ width: pct(lo) }} transition={{ type: "spring", stiffness: 160, damping: 24 }} />
      </div>
    </div>
  );
}

function savingText([low, high]: MonthlyRange) {
  if (high <= 0) return `bills rise ${gbp(abs(high), abs(low))} a month`;
  if (low < 0) return `${formatGbp(abs(low))} more to ${formatGbp(high)} less a month`;
  return `${gbp(low, high)} a month`;
}

function netText([best, worst]: MonthlyRange) {
  if (worst <= 0) return `Saves about ${gbp(abs(worst), abs(best))} a month after repayments`;
  if (best >= 0) return `Costs about ${gbp(best, worst)} a month more than it saves`;
  return `Between saving ${formatGbp(abs(best))} and costing ${formatGbp(worst)} a month`;
}

function epcText(f: Finance, p: FinancePlan) {
  if (f.alreadyC) return "Already EPC C or better";
  if (p.reachesC === "yes") return `Reaches EPC C (${p.bandAfter}), the usual green-mortgage threshold`;
  if (p.reachesC === "borderline") return `Close to EPC C (estimated ${p.bandAfter}): a survey would confirm`;
  return `Stays below EPC C (estimated ${p.bandAfter})`;
}

export function FinanceCard({ finance }: { finance: Finance }) {
  const { variant, setVariant } = usePlanVariant();
  const [route, setRoute] = useState(false);
  const [choice, setChoice] = useState<{ loan: string; term: number }>({ loan: "personal", term: 10 });
  const [grant, setGrant] = useState(false);

  const { plans, assumptions } = finance;
  const toC = plans.find((p) => p.id === "toC");
  const plan = (route ? toC : plans.find((p) => p.id === variant)) ?? plans[0];
  if (!plan) return null;

  const option: FinanceOption | undefined = plan.options.find((o) => o.loan === choice.loan && o.termYears === choice.term) ?? plan.options.find((o) => o.loan === choice.loan) ?? plan.options[0];
  if (!option) return null;

  const useGrant = grant && plan.costWithGrantGbp !== null && option.repaymentWithGrantGbp !== null && option.netWithGrantGbp !== null;
  const repayment = (useGrant ? option.repaymentWithGrantGbp : null) ?? option.repaymentGbp;
  const net = (useGrant ? option.netWithGrantGbp : null) ?? option.netGbp;
  const saving: MonthlyRange = [plan.billSavingMonthGbp[0], plan.billSavingMonthGbp[2]];
  const scale = Math.max(1, abs(repayment[1]), abs(saving[0]), abs(saving[1]));
  const loanLabel = (id: string) => assumptions.loans.find((l) => l.id === id)?.label ?? id;
  const canGrant = plan.costWithGrantGbp !== null && option.repaymentWithGrantGbp !== null;

  const pickPlan = (p: FinancePlan) => {
    if (p.id === "toC") return setRoute(true);
    setRoute(false);
    setVariant(p.id);
  };
  const selected = route && toC ? "toC" : plan.id;

  return (
    <div className="mt-3 rounded-3xl bg-surface p-4 ring-1 ring-hairline">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Monthly cost</h2>
        <span className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-hairline">Illustration</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {plans.map((p) => (
          <Chip key={p.id} on={p.id === selected} onClick={() => pickPlan(p)}>
            {p.label}
          </Chip>
        ))}
      </div>
      <p className="tabular mt-2 text-[11px] text-muted-foreground">
        Install cost {gbp(...((useGrant ? plan.costWithGrantGbp : null) ?? plan.costGbp))}
        {useGrant && " after grant"}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {plan.options.map((o) => (
          <Chip key={`${o.loan}-${o.termYears}`} on={o === option} onClick={() => setChoice({ loan: o.loan, term: o.termYears })}>
            {loanLabel(o.loan)} · {o.termYears} yr
          </Chip>
        ))}
      </div>

      {canGrant && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={grant} onChange={(e) => setGrant(e.target.checked)} className="size-4 accent-[var(--volt)]" />
          Include {assumptions.heatPumpGrantGbp ? `${formatGbp(assumptions.heatPumpGrantGbp)} ` : ""}heat pump grant
        </label>
      )}

      <div className="mt-4 space-y-3">
        <Bar label="Repayment" range={repayment} scale={scale} tone="bg-amber" />
        <Bar label={saving[1] <= 0 ? "Bill change" : "Bill saving"} range={saving} scale={scale} tone={saving[1] <= 0 ? "bg-ember" : "bg-volt"} text={savingText(saving)} />
      </div>

      <p className="mt-4 text-sm font-medium">{netText(net)}</p>
      <p className="tabular mt-1 text-[11px] text-muted-foreground">Total interest {gbp(...option.interestGbp)} over {option.termYears} years</p>

      <p className="mt-3 text-xs">{epcText(finance, plan)}</p>
      {toC && selected !== "toC" && !finance.alreadyC && (
        <button type="button" onClick={() => pickPlan(toC)} className="tabular mt-1 text-left text-xs text-volt underline-offset-2 hover:underline">
          Reach EPC C with steps 1–{toC.retrofits.length}: {gbp(...toC.costGbp)}
        </button>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">{finance.note}</p>
      <details className="mt-2 text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">Assumptions</summary>
        <ul className="mt-1 space-y-0.5">
          {assumptions.loans.map((l) => (
            <li key={l.id}>
              {l.label}: {l.aprPct}% APR, {l.terms.join(" or ")} years
            </li>
          ))}
          <li>
            Tariffs: electricity {pence(assumptions.tariffGbpPerKwh.elec)}p, gas {pence(assumptions.tariffGbpPerKwh.gas)}p per kWh
          </li>
          {assumptions.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
