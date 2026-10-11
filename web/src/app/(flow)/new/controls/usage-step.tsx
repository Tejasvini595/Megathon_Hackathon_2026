"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { EnergyUsage } from "@/lib/extract/fields";
import { isGasHeated, monthlyProblems } from "@/lib/extract/usage";
import { cn } from "@/lib/utils";
import type { Reading } from "./csv";
import { BillUpload } from "./bill-upload";
import { CsvDrop } from "./csv-drop";
import { UsageChart } from "./usage-chart";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** Twelve consecutive months ending at `last` (YYYY-MM), oldest first. */
function windowEnding(last: string): string[] {
  const [y, m] = [Number(last.slice(0, 4)), Number(last.slice(5, 7))];
  return Array.from({ length: 12 }, (_, i) => {
    const t = y * 12 + (m - 1) - (11 - i);
    return key(Math.floor(t / 12), (t % 12) + 1);
  });
}

function rowsFor(months: Reading[] | undefined): Reading[] {
  const now = new Date();
  const lastFull = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = months?.length ? months[months.length - 1].month : key(lastFull.getFullYear(), lastFull.getMonth() + 1);
  return windowEnding(last).map((month) => months?.find((r) => r.month === month) ?? { month, elecKwh: null, gasKwh: null });
}

const toNumber = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) || Number(s) < 0 ? null : Number(s));
const text = (v: number | null | undefined) => (v == null ? "" : String(v));

const EXTRA_FUELS = [
  { when: "oil_boiler", field: "oilLitres", label: "Heating oil", unit: "litres a year" },
  { when: "heat_network", field: "heatNetworkKwh", label: "Heat network", unit: "kWh a year" },
  { when: "solid_fuel", field: "otherFuelKwh", label: "Solid fuel", unit: "kWh a year" },
] as const;

type Props = { usage: EnergyUsage | undefined; heating: string; onChange: (u: EnergyUsage) => void };

/**
 * Metered energy: monthly readings (typed, or imported from a CSV) are preferred; yearly totals are the fallback.
 * The chart redraws as readings arrive.
 */
export function UsageStep({ usage, heating, onChange }: Props) {
  const [annualMode, setAnnualMode] = useState(Boolean(usage?.annual) && !usage?.months?.length);
  const [rows, setRows] = useState(() => rowsFor(usage?.months));
  const [annual, setAnnual] = useState({ elec: text(usage?.annual?.elecKwh), gas: text(usage?.annual?.gasKwh) });
  const [extras, setExtras] = useState({ oilLitres: usage?.oilLitres, heatNetworkKwh: usage?.heatNetworkKwh, otherFuelKwh: usage?.otherFuelKwh });
  const [version, setVersion] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const gasHeated = isGasHeated(heating);

  function emit(next: { annualMode?: boolean; rows?: Reading[]; annual?: typeof annual; extras?: typeof extras }) {
    const [isAnnual, r, a, x] = [next.annualMode ?? annualMode, next.rows ?? rows, next.annual ?? annual, next.extras ?? extras];
    const elec = toNumber(a.elec);
    const gas = toNumber(a.gas);
    const out: EnergyUsage = { ...Object.fromEntries(Object.entries(x).filter(([, v]) => v != null)) };
    if (isAnnual) {
      if (elec != null && gas != null) out.annual = { elecKwh: elec, gasKwh: gas };
    } else out.months = r.filter((m) => m.elecKwh != null || m.gasKwh != null);
    onChange(out);
  }

  const problems = useMemo(() => (annualMode ? [] : monthlyProblems(rows.filter((m) => m.elecKwh != null || m.gasKwh != null), gasHeated)), [annualMode, rows, gasHeated]);
  const given = rows.filter((m) => m.elecKwh != null || m.gasKwh != null).length;
  const groups = annualMode
    ? [{ label: "A year", elec: toNumber(annual.elec), gas: toNumber(annual.gas) }]
    : rows.map((r) => ({ label: MONTH_LABELS[Number(r.month.slice(5, 7)) - 1][0], elec: r.elecKwh, gas: r.gasKwh, winter: [12, 1, 2].includes(Number(r.month.slice(5, 7))) }));

  const setCell = (i: number, fuel: "elecKwh" | "gasKwh", v: string) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [fuel]: toNumber(v) } : r));
    setRows(next);
    emit({ rows: next });
  };

  function useBill(read: EnergyUsage) {
    if (read.annual) {
      const a = { elec: text(read.annual.elecKwh), gas: text(read.annual.gasKwh) };
      setAnnualMode(true);
      setAnnual(a);
      setNote(null);
      emit({ annualMode: true, annual: a });
      return;
    }
    const next = rowsFor(read.months);
    setAnnualMode(false);
    setRows(next);
    setVersion((v) => v + 1);
    setNote("Filled from your bill. Check the months below.");
    emit({ annualMode: false, rows: next });
  }

  const input = "w-full rounded-lg bg-surface-2 px-2 py-1.5 text-sm tabular-nums outline-none ring-1 ring-hairline focus:ring-volt";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{annualMode ? "Your yearly totals" : "Upload or enter your monthly readings"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {annualMode ? "From a bill or your supplier's yearly statement, in kWh." : "Bills and supplier apps list them. Six months or more, with a winter month, makes the score much sharper."}
        </p>
      </div>

      <UsageChart groups={groups} />

      <BillUpload heating={heating} onUse={useBill} />

      {annualMode ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Electricity, kWh a year
            <input inputMode="numeric" aria-label="Electricity kWh a year" className={cn(input, "mt-1 text-base")} value={annual.elec} onChange={(e) => { const a = { ...annual, elec: e.target.value }; setAnnual(a); emit({ annual: a }); }} />
          </label>
          <label className="text-xs text-muted-foreground">
            Gas, kWh a year (0 if none)
            <input inputMode="numeric" aria-label="Gas kWh a year" className={cn(input, "mt-1 text-base")} value={annual.gas} onChange={(e) => { const a = { ...annual, gas: e.target.value }; setAnnual(a); emit({ annual: a }); }} />
          </label>
        </div>
      ) : (
        <>
          <CsvDrop
            onImport={(months, message) => {
              const next = rowsFor(months);
              setRows(next);
              setVersion((v) => v + 1);
              setNote(message);
              emit({ rows: next });
            }}
          />
          {note && <p className="text-xs text-volt">{note}</p>}
          <div className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-x-2 gap-y-1.5">
            <span />
            <span className="text-[11px] text-frost">Electricity kWh</span>
            <span className="text-[11px] text-amber">Gas kWh{gasHeated ? "" : " (optional)"}</span>
            {rows.map((r, i) => (
              <div key={`${r.month}-${version}`} className="contents">
                <span className="text-xs text-muted-foreground">{MONTH_LABELS[Number(r.month.slice(5, 7)) - 1]} {r.month.slice(2, 4)}</span>
                <input inputMode="numeric" aria-label={`Electricity kWh, ${r.month}`} className={input} defaultValue={text(r.elecKwh)} onChange={(e) => setCell(i, "elecKwh", e.target.value)} />
                <input inputMode="numeric" aria-label={`Gas kWh, ${r.month}`} className={input} defaultValue={text(r.gasKwh)} onChange={(e) => setCell(i, "gasKwh", e.target.value)} />
              </div>
            ))}
          </div>
          <p className={cn("flex items-start gap-1.5 text-xs", problems.length ? "text-amber" : "text-volt")}>
            {problems.length ? `${given} months so far. ${problems.join(". ")}.` : <><Check className="size-3.5 shrink-0" /> {given} months, including a winter month.</>}
          </p>
        </>
      )}

      {EXTRA_FUELS.filter((f) => f.when === heating).map((f) => (
        <label key={f.field} className="block text-xs text-muted-foreground">
          {f.label}, {f.unit}
          <input
            inputMode="numeric"
            aria-label={`${f.label} ${f.unit}`}
            className={cn(input, "mt-1 w-40 text-base")}
            defaultValue={text(extras[f.field])}
            onChange={(e) => {
              const x = { ...extras, [f.field]: toNumber(e.target.value) ?? undefined };
              setExtras(x);
              emit({ extras: x });
            }}
          />
        </label>
      ))}

      <button
        onClick={() => {
          setAnnualMode((m) => !m);
          emit({ annualMode: !annualMode });
        }}
        className="text-sm text-volt underline-offset-4 hover:underline"
      >
        {annualMode ? "Back to monthly readings" : "I only have yearly totals"}
      </button>
    </div>
  );
}
