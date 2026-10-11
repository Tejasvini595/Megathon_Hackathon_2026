import type { EnergyUsage } from "./fields";
import { isGasHeated, monthlyProblems } from "./usage";

/** What the bill reader returns: numbers exactly as printed, with dates as YYYY-MM-DD. */
export type BillPeriod = { start: string; end: string; consumption: number };
export type BillFuel = { fuel: "electricity" | "gas"; unit: "kWh" | "m3"; periods: BillPeriod[]; annualTotal: number | null; calorificValue: number | null };
export type BillReading = { fuels: BillFuel[]; statements: { start: string; end: string }[] };

export type Finding = { level: "ok" | "check" | "reject"; message: string };
export type BillCheck = { usage: EnergyUsage | null; findings: Finding[] };

const DAY = 86_400_000;
const M3_TO_KWH = { volumeCorrection: 1.02264, calorificValue: 39.5, mjPerKwh: 3.6 };
const FULL_YEAR = { min: 350, max: 380 };
const MONTHLY_DAYS = { min: 25, max: 35 };
const ANNUAL_TOLERANCE = 0.02;
const ANNUAL_RANGE = { electricity: [500, 20_000], gas: [0, 60_000] } as const;
const MONTH_HIGH = { electricity: 3_000, gas: 15_000 } as const;

/** Mains gas volume to energy: m³ × 1.02264 (volume correction) × calorific value (MJ/m³) ÷ 3.6. */
export const m3ToKwh = (m3: number, calorific = M3_TO_KWH.calorificValue) => (m3 * M3_TO_KWH.volumeCorrection * calorific) / M3_TO_KWH.mjPerKwh;

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === iso ? Math.round(t / DAY) : null;
}

const monthOfDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 7);
const fmt = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const num = (n: number) => Math.round(n).toLocaleString("en-GB");

type Period = { start: number; end: number; kwh: number };
type FuelResult = { months?: Map<string, number>; annual?: number; findings: Finding[]; reject: boolean };

/** Entries for one fuel, converted to kWh. Several photos of the same fuel are pooled. */
function toKwh(fuel: "electricity" | "gas", entries: BillFuel[], findings: Finding[]) {
  const periods: { start: string; end: string; kwh: number }[] = [];
  const annuals: number[] = [];
  for (const e of entries) {
    let factor = 1;
    if (e.unit === "m3") {
      const printed = e.calorificValue != null && e.calorificValue >= 36 && e.calorificValue <= 42;
      if (e.calorificValue != null && !printed) findings.push({ level: "check", message: `The calorific value on the gas bill (${e.calorificValue}) looks wrong, so the standard ${M3_TO_KWH.calorificValue} MJ/m³ was used.` });
      const cv = printed ? e.calorificValue! : M3_TO_KWH.calorificValue;
      factor = m3ToKwh(1, cv);
      findings.push({ level: "ok", message: `Gas is billed in m³, converted to kWh as m³ × ${M3_TO_KWH.volumeCorrection} × ${cv} MJ/m³ ÷ ${M3_TO_KWH.mjPerKwh} (about ×${factor.toFixed(2)}).` });
    }
    for (const p of e.periods) periods.push({ start: p.start, end: p.end, kwh: p.consumption * factor });
    if (e.annualTotal != null) annuals.push(e.annualTotal * factor);
  }
  return { periods, annual: annuals.length ? annuals[0] : null };
}

function analyseFuel(fuel: "electricity" | "gas", entries: BillFuel[], statementDays: number | null): FuelResult {
  const findings: Finding[] = [];
  const out = (r: Partial<FuelResult> = {}): FuelResult => ({ findings, reject: findings.some((f) => f.level === "reject"), ...r });
  const raw = toKwh(fuel, entries, findings);
  const reject = (message: string) => {
    findings.push({ level: "reject", message });
    return out();
  };

  if ([...raw.periods.map((p) => p.kwh), raw.annual ?? 0].some((v) => !Number.isFinite(v) || v < 0)) return reject(`A ${fuel} reading is negative or not a number.`);

  const parsed: Period[] = [];
  for (const p of raw.periods) {
    const [start, end] = [dayNumber(p.start), dayNumber(p.end)];
    if (start == null || end == null || end < start) return reject(`Couldn't read the dates on a ${fuel} bill (${p.start} to ${p.end}).`);
    parsed.push({ start, end, kwh: p.kwh });
  }
  parsed.sort((a, b) => a.start - b.start || a.end - b.end);

  const periods: Period[] = [];
  for (const p of parsed) {
    const prev = periods[periods.length - 1];
    if (prev && prev.start === p.start && prev.end === p.end) {
      if (Math.abs(prev.kwh - p.kwh) > 0.5) return reject(`Two ${fuel} readings disagree for ${fmt(p.start)} to ${fmt(p.end)}.`);
      findings.push({ level: "ok", message: `Ignored a repeated ${fuel} bill for ${fmt(p.start)} to ${fmt(p.end)}.` });
      continue;
    }
    if (prev && p.start < prev.end) return reject(`The ${fuel} bills overlap (${fmt(prev.start)} to ${fmt(prev.end)} and ${fmt(p.start)} to ${fmt(p.end)}).`);
    periods.push(p);
  }

  const gaps = periods.slice(1).filter((p, i) => p.start - periods[i].end > 1);
  for (const g of gaps) {
    const before = periods[periods.indexOf(g) - 1];
    findings.push({ level: "check", message: `No ${fuel} bill between ${fmt(before.end)} and ${fmt(g.start)}.` });
  }
  const covered = periods.reduce((s, p) => s + (p.end - p.start + 1), 0);
  const fullYear = !gaps.length && covered >= FULL_YEAR.min && covered <= FULL_YEAR.max;
  const monthly = periods.length > 0 && periods.every((p) => p.end - p.start + 1 >= MONTHLY_DAYS.min && p.end - p.start + 1 <= MONTHLY_DAYS.max);

  let months: Map<string, number> | undefined;
  if (monthly) {
    months = new Map();
    for (const p of periods) {
      const key = monthOfDay(Math.floor((p.start + p.end) / 2));
      if (months.has(key)) {
        findings.push({ level: "check", message: `Two ${fuel} bills fall in ${key}, so they can't be placed in separate months.` });
        months = undefined;
        break;
      }
      months.set(key, Math.round(p.kwh));
    }
  }

  const sum = periods.reduce((s, p) => s + p.kwh, 0);
  let annual: number | undefined;
  if (fullYear) {
    annual = Math.round(sum);
    if (raw.annual != null) {
      const off = Math.abs(sum - raw.annual) / raw.annual;
      findings.push(
        off <= ANNUAL_TOLERANCE
          ? { level: "ok", message: `The ${fuel} bills add up to ${num(sum)} kWh, matching the printed yearly total (${num(raw.annual)}).` }
          : { level: "check", message: `The ${fuel} bills add up to ${num(sum)} kWh but the bill prints a yearly total of ${num(raw.annual)} (${(off * 100).toFixed(1)}% apart). One number may be misread.` },
      );
    }
  } else if (raw.annual != null && !months) {
    annual = Math.round(raw.annual);
    if (statementDays != null && statementDays < FULL_YEAR.min) findings.push({ level: "check", message: `The printed ${fuel} total covers only ${statementDays} days, not a full year.` });
    else findings.push({ level: "ok", message: `Using the printed yearly ${fuel} total, ${num(annual)} kWh.` });
  } else if (!months) {
    findings.push({ level: "check", message: periods.length ? `The ${fuel} bills cover about ${Math.round(covered / 30.4)} months. Add more bills to cover a full year, or enter readings yourself.` : `No ${fuel} readings found.` });
  }

  const yearly = annual ?? (months && covered >= FULL_YEAR.min ? sum : undefined);
  if (yearly != null) {
    const [lo, hi] = ANNUAL_RANGE[fuel];
    if (yearly < lo || yearly > hi) findings.push({ level: "check", message: `${num(yearly)} kWh of ${fuel} a year is unusual for a home (${num(lo)} to ${num(hi)}). Check the unit and the numbers.` });
  }
  if (months && [...months.values()].some((v) => v > MONTH_HIGH[fuel])) findings.push({ level: "check", message: `A month of ${fuel} is above ${num(MONTH_HIGH[fuel])} kWh, which is unusual. Check the numbers.` });
  if (months) findings.push({ level: "ok", message: `Read ${months.size} monthly ${fuel} bill${months.size === 1 ? "" : "s"}.` });
  else if (annual != null && fullYear) findings.push({ level: "ok", message: `${fuel[0].toUpperCase()}${fuel.slice(1)} bills cover a full year, used as a yearly total rather than split into months.` });

  return out({ months, annual });
}

function mergeMonths(elec?: Map<string, number>, gas?: Map<string, number>) {
  const keys = [...new Set([...(elec?.keys() ?? []), ...(gas?.keys() ?? [])])].sort().slice(-12);
  return keys.map((month) => ({ month, elecKwh: elec?.get(month) ?? null, gasKwh: gas?.get(month) ?? null }));
}

/**
 * Turns what a bill says into energy use, with findings for the user. Nothing here trusts the reader: the arithmetic,
 * date and range checks are ours, and the result must meet the same validity rules as readings typed by hand.
 */
export function checkBill(reading: BillReading, opts: { heating?: unknown } = {}): BillCheck {
  const gasHeated = isGasHeated(opts.heating);
  const statementDays = reading.statements.length === 1 ? (() => {
    const [s, e] = [dayNumber(reading.statements[0].start), dayNumber(reading.statements[0].end)];
    return s != null && e != null && e >= s ? e - s + 1 : null;
  })() : null;
  const by = (fuel: "electricity" | "gas") => reading.fuels.filter((f) => f.fuel === fuel);
  const [elec, gas] = [by("electricity"), by("gas")].map((e, i) => (e.length ? analyseFuel(i ? "gas" : "electricity", e, statementDays) : null));
  const findings = [...(elec?.findings ?? []), ...(gas?.findings ?? [])];

  if (!elec && !gas) return { usage: null, findings: [{ level: "reject", message: "We couldn't find any electricity or gas readings in that." }] };
  if (!elec) findings.push({ level: "check", message: "No electricity bill found. Add one to complete the picture." });
  if (!gas) findings.push({ level: gasHeated ? "check" : "ok", message: gasHeated ? "No gas bill found, and this home heats with gas." : "No gas bill found; fine if the home doesn't use mains gas." });
  if ([elec, gas].some((f) => f?.reject)) return { usage: null, findings };

  const usage: EnergyUsage = {};
  const monthly = elec?.months || gas?.months;
  if (monthly) {
    usage.months = mergeMonths(elec?.months, gas?.months);
    for (const [name, f] of [["electricity", elec], ["gas", gas]] as const) {
      if (f && !f.months) findings.push({ level: "check", message: `The ${name} figures are a yearly total, so they can't go into the monthly chart. Add monthly ${name} bills or enter them by hand.` });
    }
    for (const problem of monthlyProblems(usage.months, gasHeated)) findings.push({ level: "check", message: `Still missing: ${problem[0].toLowerCase()}${problem.slice(1)}.` });
  } else if (elec?.annual != null && (gas?.annual != null || !gasHeated)) {
    usage.annual = { elecKwh: elec.annual, gasKwh: gas?.annual ?? 0 };
    if (!gas) findings.push({ level: "ok", message: "No gas bill, so gas is recorded as 0 kWh a year." });
  } else if (gas?.annual != null && elec?.annual == null) {
    findings.push({ level: "check", message: "Yearly gas found but no yearly electricity. Add an electricity bill." });
  }
  if (!usage.months && !usage.annual) {
    findings.push({ level: "check", message: "These bills aren't enough to fill in your energy use yet." });
    return { usage: null, findings };
  }
  return { usage, findings };
}
