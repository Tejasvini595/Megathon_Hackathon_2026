import type { EnergyUsage, PropertyRecord } from "./fields";

export const GAS_HEATING = ["gas_boiler", "gas_warm_air", "gas_room_heaters"];

const MIN_MONTHS = 6;

const monthNumber = (month: string) => Number(month.slice(5, 7));
const isWinter = (month: string) => [12, 1, 2].includes(monthNumber(month));

/** True when `heating` runs on mains gas, so the gas meter matters. */
export const isGasHeated = (heating: unknown) => GAS_HEATING.includes(String(heating));

/** Whether the readings can stand on their own: enough months with a winter one, for each meter the home needs. */
export function monthlyProblems(months: NonNullable<EnergyUsage["months"]>, gasHeated: boolean): string[] {
  const problems: string[] = [];
  const have = (key: "elecKwh" | "gasKwh") => months.filter((m) => m[key] != null);
  if (have("elecKwh").length < MIN_MONTHS) problems.push(`Add electricity for at least ${MIN_MONTHS} months`);
  if (gasHeated && have("gasKwh").length < MIN_MONTHS) problems.push(`Add gas for at least ${MIN_MONTHS} months`);
  if (!months.some((m) => isWinter(m.month) && (m.elecKwh != null || m.gasKwh != null))) problems.push("Include at least one month from December to February");
  return problems;
}

/** What is still missing from the usage; an empty list means the engine can use it. */
export function usageProblems(usage: EnergyUsage | undefined | null, r: Partial<PropertyRecord>): string[] {
  if (!usage) return ["Add your energy use"];
  if (usage.annual) return [];
  if (!usage.months?.length) return ["Add monthly readings, or yearly totals"];
  return monthlyProblems(usage.months, isGasHeated(r.heating));
}
