/**
 * Reads supplier and smart-meter exports: a date column plus kWh, either one column per fuel or one
 * value column with a fuel column. Daily or half-hourly rows add up to calendar months.
 */

export type Role = "date" | "elec" | "gas" | "value" | "fuel" | "ignore";
export type Reading = { month: string; elecKwh: number | null; gasKwh: number | null };
export type Inspected = { headers: string[]; rows: string[][]; roles: Role[] };

export function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const first = lines.slice(0, 5).join("\n");
  const delimiter = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((line) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') cell += (i++, '"');
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        cells.push(cell.trim());
        cell = "";
      } else cell += ch;
    }
    return [...cells, cell.trim()];
  });
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type ParsedDate = { y: number; m: number; d: number | null };

export function parseDate(raw: string): ParsedDate | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  let y: number, m: number, d: number | null = null;
  let hit: RegExpMatchArray | null;
  if ((hit = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[T ].*)?$/))) [y, m, d] = [Number(hit[1]), Number(hit[2]), hit[3] ? Number(hit[3]) : null];
  else if ((hit = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T,].*)?$/))) {
    const [a, b] = [Number(hit[1]), Number(hit[2])];
    // Day first, as UK suppliers write it, unless the middle number can't be a month.
    [d, m] = b > 12 ? [b, a] : [a, b];
    y = Number(hit[3]) < 100 ? 2000 + Number(hit[3]) : Number(hit[3]);
  } else if ((hit = s.match(/^(\d{1,2})[/-](\d{4})$/))) [y, m] = [Number(hit[2]), Number(hit[1])];
  else if ((hit = s.match(/^(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})/))) {
    m = MONTHS.indexOf(hit[2].slice(0, 3).toLowerCase()) + 1;
    [y, d] = [Number(hit[3]), hit[1] ? Number(hit[1]) : null];
  } else return null;
  return m >= 1 && m <= 12 && y >= 1990 && y <= 2100 && (d == null || (d >= 1 && d <= 31)) ? { y, m, d } : null;
}

export const monthKey = (p: { y: number; m: number }) => `${p.y}-${String(p.m).padStart(2, "0")}`;
const daysIn = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();

function parseNumber(raw: string): number | null {
  const s = raw.replace(/[£,\s]/g, "");
  return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
}

const share = (cells: string[], test: (c: string) => boolean) => {
  const filled = cells.filter((c) => c !== "");
  return filled.length ? filled.filter(test).length / filled.length : 0;
};

/** Finds the header (or the lack of one) and guesses what each column is. */
export function inspect(text: string): Inspected | null {
  const all = parseCsv(text);
  const start = all.slice(0, 12).findIndex((row, i) => row.filter(Boolean).length >= 2 && (row.some((c) => parseDate(c)) || (all[i + 1] ?? []).some((c) => parseDate(c))));
  if (start < 0) return null;
  const hasHeader = !all[start].some((c) => parseDate(c));
  const rows = all.slice(hasHeader ? start + 1 : start).filter((r) => r.some(Boolean));
  const width = Math.max(...rows.map((r) => r.length));
  if (!rows.length || width < 2) return null;
  const headers = hasHeader ? Array.from({ length: width }, (_, i) => all[start][i] ?? "") : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const col = (i: number) => rows.map((r) => r[i] ?? "");

  const roles: Role[] = headers.map(() => "ignore");
  const dateCols = headers.map((_, i) => i).filter((i) => share(col(i), (c) => parseDate(c) != null) >= 0.8);
  const dateCol = dateCols.find((i) => /date|time|month|period|start|from|day|interval/i.test(headers[i])) ?? dateCols[0];
  if (dateCol == null) return null;
  roles[dateCol] = "date";
  headers.forEach((h, i) => {
    if (i === dateCol || dateCols.includes(i)) return;
    if (share(col(i), (c) => /elec|gas/i.test(c)) >= 0.8) roles[i] = "fuel";
    else if (share(col(i), (c) => parseNumber(c) != null) >= 0.8 && !/cost|£|price|charge|standing|co2|carbon|temp|rate/i.test(h)) {
      if (/elec|power|import|night|day rate/i.test(h)) roles[i] = "elec";
      else if (/gas|therm/i.test(h)) roles[i] = "gas";
    }
  });
  if (roles.includes("fuel")) {
    const value = headers.findIndex((h, i) => roles[i] === "ignore" && share(col(i), (c) => parseNumber(c) != null) >= 0.8 && /kwh|consumption|usage|units|value|energy|volume|reading/i.test(h));
    if (value >= 0) roles[value] = "value";
  }
  return { headers, rows, roles };
}

export const isReady = (roles: Role[]) => roles.includes("date") && (roles.includes("elec") || roles.includes("gas") || (roles.includes("value") && roles.includes("fuel")));

/** kWh from the header's unit: Wh and MWh are converted. */
const unitFactor = (header: string) => (/\bmwh\b/i.test(header) ? 1000 : /\bwh\b/i.test(header) ? 0.001 : 1);

type Sums = { total: number; rows: number; days: Set<number> };

/** Adds the rows up to calendar months; a month of daily or half-hourly rows must be almost complete. */
export function importReadings({ headers, rows, roles }: Inspected): { months: Reading[]; skipped: string[] } {
  const sums = { elec: new Map<string, Sums>(), gas: new Map<string, Sums>() };
  const dateCol = roles.indexOf("date");
  const fuelCol = roles.indexOf("fuel");
  for (const row of rows) {
    const date = parseDate(row[dateCol] ?? "");
    if (!date) continue;
    const key = monthKey(date);
    roles.forEach((role, i) => {
      const v = parseNumber(row[i] ?? "");
      if (v == null) return;
      const fuel = role === "elec" || role === "gas" ? role : role === "value" ? (/gas/i.test(row[fuelCol] ?? "") ? "gas" : /elec/i.test(row[fuelCol] ?? "") ? "elec" : null) : null;
      if (!fuel) return;
      const s = sums[fuel].get(key) ?? { total: 0, rows: 0, days: new Set<number>() };
      s.total += v * unitFactor(headers[i]);
      s.rows += 1;
      if (date.d) s.days.add(date.d);
      sums[fuel].set(key, s);
    });
  }
  const skipped: string[] = [];
  const full = (fuel: "elec" | "gas", key: string) => {
    const s = sums[fuel].get(key)!;
    const ok = s.rows === 1 || s.days.size >= daysIn(key) - 3;
    if (!ok) skipped.push(`${key} ${fuel === "elec" ? "electricity" : "gas"} (${s.days.size} days)`);
    return ok ? Math.round(s.total) : null;
  };
  const keys = [...new Set([...sums.elec.keys(), ...sums.gas.keys()])].sort();
  const months = keys
    .map((month): Reading => ({ month, elecKwh: sums.elec.has(month) ? full("elec", month) : null, gasKwh: sums.gas.has(month) ? full("gas", month) : null }))
    .filter((r) => r.elecKwh != null || r.gasKwh != null);
  return { months: months.slice(-12), skipped };
}
