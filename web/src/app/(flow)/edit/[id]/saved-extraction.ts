import { normaliseRecord } from "@/lib/extract";
import { FIELDS, type ExtractedField, type ExtractionResult, type FieldKey, type FieldValue, type PropertyRecord } from "@/lib/extract/fields";

type Saved = { models: string[]; fields: unknown; conflicts: unknown } | null;

/**
 * Rebuilds what the review step expects from a saved home. With a confirmed record, every value is
 * shown as confirmed (confidence 1); the latest extraction's source and evidence are kept when it
 * still agrees with the record, otherwise the field is marked a plain default the user can change.
 * A draft with no record shows the extraction as it was, guesses included.
 */
export function savedExtraction(saved: Record<string, unknown> | null, latest: Saved): ExtractionResult | null {
  const extracted = (latest?.fields ?? null) as Partial<Record<FieldKey, ExtractedField>> | null;
  if (!saved && !extracted) return null;
  // Older homes predate some fields; fill them with the usual defaults.
  const record = saved ? normaliseRecord(saved as Partial<PropertyRecord>) : null;
  const defaults = normaliseRecord({});
  const fields = {} as Record<FieldKey, ExtractedField>;
  for (const { key } of FIELDS) {
    const old = extracted?.[key];
    const value: FieldValue | undefined = record?.[key];
    if (value === undefined) {
      fields[key] = old ?? { value: defaults[key], confidence: 0.35, source: "default", evidence: "Typical for UK homes; please check" };
    } else if (old && String(old.value) === String(value)) {
      fields[key] = { ...old, confidence: 1 };
    } else {
      fields[key] = { value, confidence: 1, source: "default", evidence: "Saved in your record" };
    }
  }
  return { fields, conflicts: record ? [] : ((latest?.conflicts ?? []) as ExtractionResult["conflicts"]), models: latest?.models ?? [] };
}
