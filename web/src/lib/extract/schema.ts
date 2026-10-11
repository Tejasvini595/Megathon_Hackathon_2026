import { z } from "zod";
import { applies, FIELDS, type FieldDef, type FieldKey, type PropertyRecord } from "./fields";
import { sapInBand } from "./epc";
import { usageProblems } from "./usage";
import type { EpcBand } from "@/lib/twin/types";

const reading = z.number().min(0).max(200000);

export const usageSchema = z.object({
  months: z.array(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), elecKwh: reading.nullable(), gasKwh: reading.nullable() })).max(36).optional(),
  annual: z.object({ elecKwh: reading, gasKwh: reading }).optional(),
  oilLitres: reading.optional(),
  heatNetworkKwh: reading.optional(),
  otherFuelKwh: reading.optional(),
});

const fieldSchema = (f: FieldDef) => {
  const base =
    f.kind === "number"
      ? z.coerce.number().min(f.min).max(f.max)
      : f.kind === "multi"
        ? z.array(z.enum(f.options.map((o) => o.value) as [string, ...string[]])).max(f.options.length)
        : z.enum(f.options.map((o) => o.value) as [string, ...string[]]);
  // Fields that only apply to some homes (a flat's floor, the solar size) arrive null when they don't.
  return f.optional || f.when ? base.nullish() : base;
};

const shape = Object.fromEntries(FIELDS.map((f: FieldDef) => [f.key, fieldSchema(f)])) as Record<string, z.ZodType>;

/**
 * The record the engine reads: every field that applies to this home must have a value (only
 * sapScore, thermostatC and currentValueGbp may be left out), and fields that don't apply are nulled.
 */
export const recordSchema = z
  .object({ ...shape, postcode: z.string().max(10).nullish(), usage: usageSchema })
  .superRefine((raw, ctx) => {
    const r = raw as Partial<PropertyRecord>;
    for (const f of FIELDS as readonly FieldDef[]) {
      if (!f.optional && r[f.key as FieldKey] == null && applies(f.key as FieldKey, r)) ctx.addIssue({ code: "custom", path: [f.key], message: `${f.label} is required` });
    }
    const sap = r.sapScore as number | null | undefined;
    if (sap != null && r.epcBand !== "unknown" && !sapInBand(sap, r.epcBand as EpcBand)) ctx.addIssue({ code: "custom", path: ["sapScore"], message: `An EPC score of ${sap} isn't in band ${r.epcBand}` });
    for (const message of usageProblems(r.usage, r)) ctx.addIssue({ code: "custom", path: ["usage"], message });
  })
  .transform((raw) => {
    const r = raw as Partial<PropertyRecord>;
    const out: Record<string, unknown> = { ...raw };
    for (const { key } of FIELDS) out[key] = applies(key, r) ? (r[key] ?? null) : null;
    return out as unknown as PropertyRecord;
  });

export const confirmSchema = z.object({ nickname: z.string().trim().min(1).max(60), record: recordSchema });
