import { formatGbp, formatNumber } from "@/lib/score";
import type { Finance, PackageResult, Retrofit, ScoreComponent } from "@/lib/twin/types";
import { bandText, gbpRange, netText, monthlyText, reachesCText } from "./format";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 border-b border-foreground/20 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function Components({ components }: { components: ScoreComponent[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
      {components.map((c) => (
        <li key={c.key} className="break-inside-avoid text-xs">
          <div className="flex justify-between gap-2">
            <span className="font-medium">
              {c.label}
              {c.subScore === null ? " (missing)" : c.estimated ? " (estimated)" : ""}
            </span>
            <span className="tabular">
              {formatNumber(c.contribution, 1)} / {Math.round(c.weight * 100)}
            </span>
          </div>
          <p className="text-muted-foreground">{c.reason}</p>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ retrofits }: { retrofits: Retrofit[] }) {
  return (
    <ol className="space-y-2.5">
      {retrofits.map((r) => (
        <li key={r.id} className="break-inside-avoid text-xs">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">
              {r.order}. {r.label}
            </span>
            <span className="text-muted-foreground">{r.suitability} suitability</span>
          </div>
          <p className="text-muted-foreground">{r.reason}</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">Gas within the plan</dt>
            <dd>{bandText(r.gasSavingKwh, "kWh/yr")}</dd>
            <dt className="text-muted-foreground">Electricity within the plan</dt>
            <dd>{bandText(r.elecSavingKwh, "kWh/yr")}</dd>
            <dt className="text-muted-foreground">Carbon within the plan</dt>
            <dd>{bandText(r.carbonSavingKg, "kg CO₂/yr")}</dd>
            <dt className="text-muted-foreground">Cost</dt>
            <dd>
              {gbpRange(r.costGbp)}
              {r.paybackYears != null && <span className="text-muted-foreground"> · payback about {formatNumber(r.paybackYears, 1)} years</span>}
            </dd>
          </dl>
        </li>
      ))}
    </ol>
  );
}

export function Totals({ title, pkg, labelOf }: { title: string; pkg: PackageResult; labelOf: (id: string) => string }) {
  return (
    <div className="break-inside-avoid rounded-lg border border-foreground/15 p-3 text-xs">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground">{pkg.retrofits.map(labelOf).join(", ")}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">Gas</dt>
        <dd>{bandText(pkg.gasSavingKwh, "kWh/yr")}</dd>
        <dt className="text-muted-foreground">Electricity</dt>
        <dd>{bandText(pkg.elecSavingKwh, "kWh/yr")}</dd>
        <dt className="text-muted-foreground">Carbon</dt>
        <dd>{bandText(pkg.carbonSavingKg, "kg CO₂/yr")}</dd>
        {pkg.improvementPotentialPct != null && (
          <>
            <dt className="text-muted-foreground">Improvement potential</dt>
            <dd>{formatNumber(pkg.improvementPotentialPct, 0)}%</dd>
          </>
        )}
        <dt className="text-muted-foreground">Cost</dt>
        <dd>{gbpRange(pkg.costGbp)}</dd>
        <dt className="text-muted-foreground">Bill saving</dt>
        <dd>{pkg.billSavingGbp < 0 ? `bills rise ${formatGbp(-pkg.billSavingGbp)}` : formatGbp(pkg.billSavingGbp)} a year</dd>
        <dt className="text-muted-foreground">After the plan</dt>
        <dd>
          score {formatNumber(pkg.scoreAfter)}/100 ({pkg.classAfter}), EPC {pkg.bandAfter}
        </dd>
      </dl>
    </div>
  );
}

export function FinanceTable({ finance }: { finance: Finance }) {
  const plan = finance.plans.find((p) => p.id === "full") ?? finance.plans[0];
  if (!plan) return null;
  return (
    <div className="text-xs">
      <p className="mb-1.5">
        {plan.label}: {gbpRange(plan.costGbp)} · {reachesCText[plan.reachesC]} (SAP after {formatNumber(plan.sapAfter)}, band {plan.bandAfter})
        {finance.alreadyC && " · already EPC C or better"}
      </p>
      <table className="w-full border-collapse text-left">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Loan</th>
            <th className="py-1 font-medium">Repayment a month</th>
            <th className="py-1 font-medium">Against bill saving</th>
          </tr>
        </thead>
        <tbody>
          {plan.options.map((o) => {
            const loan = finance.assumptions.loans.find((l) => l.id === o.loan)?.label ?? o.loan;
            return (
              <tr key={`${o.loan}-${o.termYears}`} className="break-inside-avoid border-t border-foreground/10">
                <td className="py-1">
                  {loan}, {o.termYears} years
                </td>
                <td className="py-1 tabular">{monthlyText(o.repaymentGbp)}</td>
                <td className="py-1">{netText(o.netGbp)} a month</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-muted-foreground">{finance.note}</p>
    </div>
  );
}
