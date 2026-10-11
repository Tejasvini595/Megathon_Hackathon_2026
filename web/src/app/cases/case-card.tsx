import { ServerOff } from "lucide-react";
import { optionLabel, type FieldKey } from "@/lib/extract/fields";
import { epcTone, formatGbp, formatNumber, formatSaving, scoreTone } from "@/lib/score";
import type { Band, PackageResult, Retrofit } from "@/lib/twin/types";
import { tryCase } from "./actions";
import type { EdgeCase } from "./data";
import type { CaseRun } from "./run";

const LABELS: Record<string, string> = { propertyType: "Type", flatLevel: "Floor", wallType: "Walls", wallInsulation: "Wall insulation", roofType: "Roof", loftInsulation: "Loft", glazing: "Glazing", heating: "Heating", boilerAge: "Boiler", controls: "Controls", solarPv: "Solar", epcBand: "EPC", sapScore: "EPC score", floorAreaM2: "Floor area", currentValueGbp: "Home value" };

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{children}</p>;

export function CaseCard({ n, c, run }: { n: number; c: EdgeCase; run: CaseRun | null }) {
  return (
    <li className="rounded-3xl bg-surface p-4 ring-1 ring-hairline">
      <p className="text-[11px] text-muted-foreground">Case {n}</p>
      <h2 className="font-medium">{c.title}</h2>
      <div className="mt-3">
        <Label>What the brief asks</Label>
        <p className="mt-1 text-xs">{c.brief}</p>
      </div>
      <div className="mt-3">
        <Label>The home</Label>
        <dl className="mt-1.5 flex flex-wrap gap-1.5">
          {c.inputs.map((k) => {
            const v = c.record[k as FieldKey];
            return (
              <div key={k} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] ring-1 ring-hairline">
                <dt className="inline text-muted-foreground">{LABELS[k] ?? k}: </dt>
                <dd className="inline">{v == null || v === "" ? "not given" : optionLabel(k as FieldKey, v)}</dd>
              </div>
            );
          })}
        </dl>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{c.note}</p>

      {run ? <Outcome c={c} run={run} /> : <Down />}

      <form action={tryCase} className="mt-4">
        <input type="hidden" name="id" value={c.id} />
        <button type="submit" className="w-full rounded-full bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground active:scale-95">
          Try it in the app
        </button>
      </form>
    </li>
  );
}

function Down() {
  return (
    <div className="mt-4 flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 p-5 text-center ring-1 ring-hairline">
      <ServerOff className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">Engine not reachable</p>
      <p className="text-xs text-muted-foreground">This case runs live, so it needs the engine. Try again in a moment.</p>
    </div>
  );
}

function Outcome({ c, run }: { c: EdgeCase; run: CaseRun }) {
  const t = run.twin;
  const range = t.rating.range;
  return (
    <div className="mt-4 space-y-3 border-t hairline pt-3">
      <Label>What the engine did</Label>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="tabular text-3xl font-light" style={{ color: scoreTone(t.score) }}>
            {formatNumber(t.score)}
            {t.scoreRange && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                provisional, {t.scoreRange.low}–{t.scoreRange.high}
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">{t.scoreClass}</p>
        </div>
        <div className="text-right">
          <p className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-black" style={{ background: epcTone(t.rating.band) }}>
            EPC {t.rating.band}
            {range && ` (${range.band[0]}–${range.band[1]})`}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t.rating.source === "estimated" ? "Estimated" : t.rating.source === "band" ? "Recorded band" : "Recorded"}, energy {t.energy.source}
          </p>
        </div>
      </div>

      {t.components.some((x) => x.subScore == null) && (
        <p className="text-xs text-muted-foreground">
          Left out of the score: {t.components.filter((x) => x.subScore == null).map((x) => x.label.toLowerCase()).join(", ")}.
        </p>
      )}

      {t.flags.filter((f) => f.field !== "region_unknown").length > 0 && (
        <ul className="space-y-1.5">
          {t.flags.filter((f) => f.field !== "region_unknown").map((f) => (
            <li key={f.field} className="rounded-2xl px-3 py-2 text-xs ring-1 ring-hairline" style={{ background: `color-mix(in oklch, ${f.severity === "warn" ? "var(--amber)" : "var(--frost)"} 12%, transparent)` }}>
              <span className="font-medium">{f.severity === "warn" ? "Warning" : "Note"} · {f.field.replaceAll("_", " ")}.</span> {f.message}
            </li>
          ))}
        </ul>
      )}

      {t.unavailableReason && (
        <p className="rounded-2xl px-3 py-2 text-xs ring-1 ring-hairline" style={{ background: "color-mix(in oklch, var(--ember) 12%, transparent)" }}>
          <span className="font-medium">Savings not estimated.</span> {t.unavailableReason}.
        </p>
      )}

      {t.needsInfo.length > 0 && (
        <div>
          <Label>Needs from you</Label>
          <ul className="mt-1 list-inside list-disc text-xs">
            {t.needsInfo.map((q) => (
              <li key={q.id}>{q.question}</li>
            ))}
          </ul>
        </div>
      )}

      {t.excluded.length > 0 && (
        <div>
          <Label>Excluded</Label>
          <ul className="mt-1 space-y-0.5 text-xs">
            {t.excluded.slice(0, 8).map((x) => (
              <li key={x.id}>
                <span className="font-medium">{x.id.replaceAll("_", " ")}</span> <span className="text-muted-foreground">{x.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.plan && t.retrofits.length > 0 && <Plan t={t} alone={run.alone?.retrofits.find((r) => r.id === c.alone) ?? null} />}
      {c.plan && t.package && <Total p={t.package} title="Whole package" />}
      {c.plan && t.packageNoHeatPump && <Total p={t.packageNoHeatPump} title="Without the heat pump" />}

      <Value v={t.value} />
    </div>
  );
}

/** Savings are positive; a negative figure is use going up. */
function Kwh({ label, b }: { label: string; b: Band }) {
  const up = b.p50 < 0;
  return (
    <span className={up ? "text-ember" : undefined}>
      {label} {formatSaving(b.p50)} kWh
    </span>
  );
}

const bill = (n: number) => (n >= 0 ? `bill −${formatGbp(n)}/yr` : `bill +${formatGbp(-n)}/yr`);

function Plan({ t, alone }: { t: CaseRun["twin"]; alone: Retrofit | null }) {
  return (
    <div>
      <Label>Measures, in order (marginal within the plan)</Label>
      <ol className="mt-1.5 space-y-1.5">
        {t.retrofits.map((r) => (
          <li key={r.id} className="rounded-2xl bg-surface-2 px-3 py-2 text-xs ring-1 ring-hairline">
            <p className="font-medium">
              {r.order}. {r.label}
            </p>
            <p className="tabular text-muted-foreground">
              <Kwh label="Gas" b={r.gasSavingKwh} /> · <Kwh label="Elec" b={r.elecSavingKwh} /> · CO₂ {formatSaving(r.carbonSavingKg.p50)} kg · {bill(r.billSavingGbp)}
            </p>
            {alone && alone.id === r.id && (
              <p className="tabular mt-1 text-frost">
                On its own: <Kwh label="Gas" b={alone.gasSavingKwh} /> · <Kwh label="Elec" b={alone.elecSavingKwh} />
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Total({ p, title }: { p: PackageResult; title: string }) {
  return (
    <div className="rounded-2xl px-3 py-2 text-xs ring-1 ring-hairline" style={{ background: "color-mix(in oklch, var(--volt) 10%, transparent)" }}>
      <p className="font-medium">
        {title}: EPC {p.bandAfter}, score {formatNumber(p.scoreAfter)}
      </p>
      <p className="tabular text-muted-foreground">
        <Kwh label="Gas" b={p.gasSavingKwh} /> · <Kwh label="Elec" b={p.elecSavingKwh} /> · CO₂ {formatSaving(p.carbonSavingKg.p50)} kg · {bill(p.billSavingGbp)}
      </p>
    </div>
  );
}

function Value({ v }: { v: CaseRun["twin"]["value"] }) {
  const text = v.valueAfterGbp
    ? `${formatGbp(v.valueAfterGbp[0])} to ${formatGbp(v.valueAfterGbp[1])} after the package`
    : v.upliftPct
      ? `Uplift ${v.upliftPct[0]}–${v.upliftPct[1]}%; value in pounds unavailable without the home's current value`
      : "Value impact unavailable";
  return (
    <div>
      <Label>Value</Label>
      <p className="mt-1 text-xs">{text}</p>
    </div>
  );
}
