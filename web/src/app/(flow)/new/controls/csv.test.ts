import { describe, expect, test } from "bun:test";
import { importReadings, inspect, isReady, parseDate } from "./csv";

const read = (text: string) => {
  const i = inspect(text)!;
  return { i, ...importReadings(i) };
};

describe("parseDate", () => {
  test("common formats", () => {
    expect(parseDate("2025-03-14T00:30:00Z")).toEqual({ y: 2025, m: 3, d: 14 });
    expect(parseDate("14/03/2025 00:30")).toEqual({ y: 2025, m: 3, d: 14 });
    expect(parseDate("03/2025")).toEqual({ y: 2025, m: 3, d: null });
    expect(parseDate("March 2025")).toEqual({ y: 2025, m: 3, d: null });
    expect(parseDate("hello")).toBeNull();
  });
});

describe("inspect and import", () => {
  test("monthly rows with separate electricity and gas columns", () => {
    const { i, months } = read("Month,Electricity (kWh),Gas (kWh),Cost\nJan 2026,410,2300,£90\nFeb 2026,380,1950,£80\n");
    expect(i.roles).toEqual(["date", "elec", "gas", "ignore"]);
    expect(isReady(i.roles)).toBe(true);
    expect(months).toEqual([{ month: "2026-01", elecKwh: 410, gasKwh: 2300 }, { month: "2026-02", elecKwh: 380, gasKwh: 1950 }]);
  });

  test("daily rows add up to months and partial months are skipped", () => {
    const rows = Array.from({ length: 31 }, (_, d) => `2026-01-${String(d + 1).padStart(2, "0")},10`).concat(["2026-02-01,10", "2026-02-02,10"]);
    const { months, skipped } = read(`Date,Electricity consumption kWh\n${rows.join("\n")}`);
    expect(months).toEqual([{ month: "2026-01", elecKwh: 310, gasKwh: null }]);
    expect(skipped).toEqual(["2026-02 electricity (2 days)"]);
  });

  test("half-hourly smart meter rows in Wh", () => {
    const rows: string[] = [];
    for (let d = 1; d <= 28; d++) for (const t of ["00:00", "00:30"]) rows.push(`${String(d).padStart(2, "0")}/02/2026 ${t};250`);
    const { months } = read(`Start;Electricity import (Wh)\n${rows.join("\n")}`);
    expect(months).toEqual([{ month: "2026-02", elecKwh: 14, gasKwh: null }]);
  });

  test("one value column with a fuel column", () => {
    const { i, months } = read("Date,Fuel,kWh\n2026-01-01,Electricity,400\n2026-01-01,Gas,2000\n2026-02-01,Electricity,350\n");
    expect(i.roles).toEqual(["date", "fuel", "value"]);
    expect(months).toEqual([{ month: "2026-01", elecKwh: 400, gasKwh: 2000 }, { month: "2026-02", elecKwh: 350, gasKwh: null }]);
  });

  test("an unlabelled kWh column needs the user to say which fuel", () => {
    const i = inspect("Date,Consumption (kWh)\n2026-01-01,400\n")!;
    expect(isReady(i.roles)).toBe(false);
  });

  test("not a meter export", () => {
    expect(inspect("name,age\nann,3\n")).toBeNull();
  });
});
