import { applies, FIELDS, type EnergyUsage, type PropertyRecord } from "@/lib/extract/fields";
import { sapInBand } from "@/lib/extract/epc";
import { usageProblems } from "@/lib/extract/usage";
import type { EpcBand } from "@/lib/twin/types";
import { STEPS, type StepId } from "./steps";

export type Missing = { step: StepId; message: string };

/** What still blocks the engine: applicable required fields without a value, a score outside its band, and unusable usage. */
export function missingOf(record: PropertyRecord, usage: EnergyUsage | undefined): Missing[] {
  const out: Missing[] = [];
  for (const step of STEPS) {
    for (const key of step.fields) {
      const def = FIELDS.find((f) => f.key === key)!;
      if (!applies(key, record)) continue;
      if (!("optional" in def) && record[key] == null) out.push({ step: step.id, message: `${def.label} is missing` });
    }
  }
  const sap = record.sapScore;
  if (sap != null && record.epcBand !== "unknown" && !sapInBand(Number(sap), record.epcBand as EpcBand)) out.push({ step: "rating", message: `EPC score ${sap} isn't in band ${record.epcBand}` });
  for (const message of usageProblems(usage, record)) out.push({ step: "usage", message });
  return out;
}
