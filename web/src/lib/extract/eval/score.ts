import type { ExtractedField, ExtractionResult, FieldKey, FieldValue } from "../fields";
import type { EvalCase } from "./cases";

/** One field of one case, with what the extractor said. */
export type Outcome = { caseId: string; key: FieldKey; gold: FieldValue; value: FieldValue; confidence: number; source: string; correct: boolean; filled: boolean };

export type Tier = "Sure" | "Likely" | "Guess";
export const TIERS: Tier[] = ["Sure", "Likely", "Guess"];

export const tierOf = (confidence: number): Tier => (confidence >= 0.85 ? "Sure" : confidence >= 0.6 ? "Likely" : "Guess");

/** Numbers that the review UI only offers in steps count as right within one step. */
const TOLERANCE: Partial<Record<FieldKey, number>> = { floorAreaM2: 5, solarKw: 0.1, thermostatC: 0.5, currentValueGbp: 5000 };

export function matches(key: FieldKey, gold: FieldValue, value: FieldValue) {
  if (Array.isArray(gold) || Array.isArray(value)) {
    const a = [...(Array.isArray(gold) ? gold : [gold])].sort().join();
    const b = [...(Array.isArray(value) ? value : [value])].sort().join();
    return a === b;
  }
  if (typeof gold === "number") return Math.abs(gold - Number(value)) <= (TOLERANCE[key] ?? 0);
  return gold === value;
}

export function outcomesOf(c: EvalCase, result: ExtractionResult) {
  const outcomes = (Object.entries(c.gold) as [FieldKey, FieldValue][]).map(([key, gold]): Outcome => {
    // Optional fields are absent from the result until the text gives them.
    const f: ExtractedField | undefined = result.fields[key];
    if (!f) return { caseId: c.id, key, gold, value: "(none)", confidence: 0, source: "default", correct: false, filled: false };
    return { caseId: c.id, key, gold, value: f.value, confidence: f.confidence, source: f.source, correct: matches(key, gold, f.value), filled: f.source !== "default" };
  });
  const falseFills = (c.open ?? []).filter((k) => result.fields[k]?.source !== "default" && result.fields[k]).map((k) => ({ caseId: c.id, key: k, value: result.fields[k].value }));
  return { outcomes, falseFills };
}

const share = (n: number, d: number) => (d ? n / d : 0);

export type Summary = ReturnType<typeof summarise>;

export function summarise(outcomes: Outcome[]) {
  const keys = [...new Set(outcomes.map((o) => o.key))];
  const perField = keys.map((key) => {
    const rows = outcomes.filter((o) => o.key === key);
    return { key, n: rows.length, accuracy: share(rows.filter((o) => o.correct).length, rows.length), coverage: share(rows.filter((o) => o.filled).length, rows.length) };
  });
  const perTier = TIERS.map((tier) => {
    const rows = outcomes.filter((o) => tierOf(o.confidence) === tier);
    return { tier, n: rows.length, accuracy: share(rows.filter((o) => o.correct).length, rows.length), meanConfidence: share(rows.reduce((s, o) => s + o.confidence, 0), rows.length) };
  });
  const filled = outcomes.filter((o) => o.filled);
  return {
    n: outcomes.length,
    perField,
    perTier,
    micro: share(outcomes.filter((o) => o.correct).length, outcomes.length),
    macro: share(perField.reduce((s, f) => s + f.accuracy, 0), perField.length),
    coverage: share(filled.length, outcomes.length),
    accuracyWhenFilled: share(filled.filter((o) => o.correct).length, filled.length),
    ece: share(perTier.reduce((s, t) => s + t.n * Math.abs(t.accuracy - t.meanConfidence), 0), outcomes.length),
  };
}
