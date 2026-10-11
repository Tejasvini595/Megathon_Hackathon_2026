import { describe, expect, test } from "bun:test";
import { checkBill, m3ToKwh, type BillFuel, type BillReading } from "./bill-checks";

const monthPeriods = (year: number, values: number[], from = 1) =>
  values.map((consumption, i) => {
    const m = from + i;
    const [y, mm] = [year + Math.floor((m - 1) / 12), ((m - 1) % 12) + 1];
    const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    const p = String(mm).padStart(2, "0");
    return { start: `${y}-${p}-01`, end: `${y}-${p}-${last}`, consumption };
  });
const fuel = (f: "electricity" | "gas", periods: BillFuel["periods"], extra: Partial<BillFuel> = {}): BillFuel => ({ fuel: f, unit: "kWh", periods, annualTotal: null, calorificValue: null, ...extra });
const reading = (...fuels: BillFuel[]): BillReading => ({ fuels, statements: [] });
const levels = (r: ReturnType<typeof checkBill>) => r.findings.map((f) => f.level);
const quarters = (values: number[]) => values.map((consumption, i) => ({ start: `2025-${String(i * 3 + 1).padStart(2, "0")}-01`, end: ["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"][i], consumption }));

const ELEC = [300, 280, 260, 240, 220, 200, 200, 210, 230, 260, 290, 320];
const GAS = [1800, 1600, 1200, 800, 400, 250, 200, 200, 350, 800, 1400, 1900];

describe("checkBill", () => {
  test("twelve monthly bills of both fuels become months", () => {
    const r = checkBill(reading(fuel("electricity", monthPeriods(2025, ELEC)), fuel("gas", monthPeriods(2025, GAS))), { heating: "gas_boiler" });
    expect(r.usage?.months).toHaveLength(12);
    expect(r.usage?.months?.[0]).toEqual({ month: "2025-01", elecKwh: 300, gasKwh: 1800 });
    expect(levels(r)).not.toContain("check");
    expect(levels(r)).not.toContain("reject");
  });

  test("bills that do not start on the 1st still land in the month they mostly cover", () => {
    const p = [
      { start: "2025-01-15", end: "2025-02-14", consumption: 100 },
      { start: "2025-02-15", end: "2025-03-14", consumption: 90 },
    ];
    const r = checkBill(reading(fuel("electricity", p)));
    expect(r.usage?.months?.map((m) => m.month)).toEqual(["2025-01", "2025-02"]);
  });

  test("gas in m3 is converted with the standard formula and says so", () => {
    expect(m3ToKwh(100)).toBeCloseTo(1122.05, 1);
    const g = fuel("gas", monthPeriods(2025, GAS.map((v) => v / 11.2205)), { unit: "m3" });
    const r = checkBill(reading(fuel("electricity", monthPeriods(2025, ELEC)), g), { heating: "gas_boiler" });
    expect(r.usage?.months?.[0].gasKwh).toBe(1800);
    expect(r.findings.some((f) => f.level === "ok" && f.message.includes("1.02264") && f.message.includes("39.5"))).toBe(true);
  });

  test("a printed calorific value is used when plausible, ignored when not", () => {
    const run = (cv: number) => checkBill(reading(fuel("electricity", monthPeriods(2025, ELEC)), fuel("gas", monthPeriods(2025, [100, ...GAS.slice(1)]), { unit: "m3", calorificValue: cv })));
    expect(run(40).usage?.months?.[0].gasKwh).toBe(Math.round(m3ToKwh(100, 40)));
    const bad = run(400);
    expect(bad.usage?.months?.[0].gasKwh).toBe(Math.round(m3ToKwh(100)));
    expect(levels(bad)).toContain("check");
  });

  test("quarterly bills are not split into fake months; four quarters become a yearly total", () => {
    const r = checkBill(reading(fuel("electricity", quarters([900, 700, 600, 900]))));
    expect(r.usage?.months).toBeUndefined();
    expect(r.usage?.annual).toEqual({ elecKwh: 3100, gasKwh: 0 });
  });

  test("quarterly bills for a gas-heated home need the gas bill too", () => {
    const r = checkBill(reading(fuel("electricity", quarters([900, 700, 600, 900]))), { heating: "gas_boiler" });
    expect(r.usage).toBeNull();
    expect(r.findings.some((f) => f.message.includes("heats with gas"))).toBe(true);
  });

  test("two quarters ask for more bills instead of guessing", () => {
    const r = checkBill(reading(fuel("electricity", quarters([900, 700]).slice(0, 2))));
    expect(r.usage).toBeNull();
    expect(r.findings.some((f) => f.level === "check" && f.message.includes("Add more bills"))).toBe(true);
  });

  test("printed annual total agrees within 2 percent", () => {
    const ok = checkBill(reading(fuel("electricity", quarters([900, 700, 600, 900]), { annualTotal: 3150 })));
    expect(ok.findings.some((f) => f.level === "ok" && f.message.includes("matching"))).toBe(true);
    const off = checkBill(reading(fuel("electricity", quarters([900, 700, 600, 900]), { annualTotal: 4100 })));
    expect(off.findings.some((f) => f.level === "check" && f.message.includes("yearly total"))).toBe(true);
  });

  test("a printed yearly total alone is used as the yearly figure", () => {
    const r = checkBill({ fuels: [fuel("electricity", [], { annualTotal: 3100 }), fuel("gas", [], { annualTotal: 12000 })], statements: [{ start: "2025-01-01", end: "2025-12-31" }] });
    expect(r.usage?.annual).toEqual({ elecKwh: 3100, gasKwh: 12000 });
  });

  test("a printed total over a short statement is flagged", () => {
    const r = checkBill({ fuels: [fuel("electricity", [], { annualTotal: 800 })], statements: [{ start: "2025-01-01", end: "2025-03-31" }] });
    expect(r.findings.some((f) => f.level === "check" && f.message.includes("90 days"))).toBe(true);
  });

  test("overlapping periods are rejected", () => {
    const p = [{ start: "2025-01-01", end: "2025-01-31", consumption: 100 }, { start: "2025-01-20", end: "2025-02-20", consumption: 100 }];
    const r = checkBill(reading(fuel("electricity", p)));
    expect(r.usage).toBeNull();
    expect(levels(r)).toContain("reject");
  });

  test("an identical repeated bill is ignored; conflicting repeats are rejected", () => {
    const p = monthPeriods(2025, [300, 280]);
    const dup = checkBill(reading(fuel("electricity", [...p, p[0]])));
    expect(dup.usage?.months).toHaveLength(2);
    expect(dup.findings.some((f) => f.message.startsWith("Ignored a repeated"))).toBe(true);
    expect(levels(checkBill(reading(fuel("electricity", [...p, { ...p[0], consumption: 999 }]))))).toContain("reject");
  });

  test("unreadable dates and negative numbers are rejected", () => {
    expect(levels(checkBill(reading(fuel("electricity", [{ start: "2025-02-30", end: "2025-03-01", consumption: 5 }]))))).toContain("reject");
    expect(levels(checkBill(reading(fuel("electricity", [{ start: "2025-01-01", end: "2025-01-31", consumption: -5 }]))))).toContain("reject");
  });

  test("a gap between bills is flagged", () => {
    const p = [...monthPeriods(2025, [300]), ...monthPeriods(2025, [300], 3)];
    expect(checkBill(reading(fuel("electricity", p))).findings.some((f) => f.level === "check" && f.message.includes("No electricity bill between"))).toBe(true);
  });

  test("implausible yearly numbers are flagged", () => {
    const r = checkBill(reading(fuel("electricity", quarters([9000, 7000, 6000, 9000]))));
    expect(r.findings.some((f) => f.level === "check" && f.message.includes("unusual"))).toBe(true);
  });

  test("electricity-only monthly bills work for an electrically heated home, and say what is missing otherwise", () => {
    const e = fuel("electricity", monthPeriods(2025, ELEC));
    const electric = checkBill(reading(e), { heating: "heat_pump" });
    expect(electric.usage?.months?.[0].gasKwh).toBeNull();
    expect(levels(electric)).not.toContain("check");
    const gas = checkBill(reading(e), { heating: "gas_boiler" });
    expect(gas.findings.some((f) => f.level === "check" && f.message.includes("gas"))).toBe(true);
  });

  test("monthly readings must still include a winter month", () => {
    const r = checkBill(reading(fuel("electricity", monthPeriods(2025, [1, 2, 3, 4, 5, 6], 4))));
    expect(r.findings.some((f) => f.message.startsWith("Still missing: include at least one month"))).toBe(true);
  });

  test("more than twelve months keep the latest twelve", () => {
    expect(checkBill(reading(fuel("electricity", monthPeriods(2024, Array(15).fill(250))))).usage?.months).toHaveLength(12);
  });

  test("an empty reading is rejected", () => {
    expect(checkBill({ fuels: [], statements: [] }).usage).toBeNull();
  });
});
