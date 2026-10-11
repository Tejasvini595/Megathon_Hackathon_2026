import { applies, FIELDS, type ExtractedField, type FieldKey, type PropertyRecord } from "@/lib/extract/fields";
import type { FieldImpact, QuestionPlan } from "@/lib/questions";
import { STEPS } from "./steps";

type Stated = { source: string };

/** Below these a different answer barely moves anything, so the field is only a quick confirm. */
const SCORE_POINTS = 1;
const PLAN_CHANGE = 0.15;
const BILL_GBP = 20;

export type Arranged = {
  /** Uncertain fields that matter, most important first, then the ones nothing ranks (numbers, read-from-text). */
  main: FieldKey[];
  /** Read from the description with high confidence: pre-filled, one tap to confirm. */
  confident: FieldKey[];
  /** Nothing much changes whichever way they go. */
  quick: FieldKey[];
  /** Fields that carry the amber "matters" marker. */
  matters: Set<FieldKey>;
};

/** The non-trivial parts of why a question matters, phrased as estimates. Empty when it barely does. */
export function reasonParts(i: Pick<FieldImpact, "scoreSpread" | "planChangeProb" | "billSpreadGbp">): string[] {
  const parts: string[] = [];
  if (i.planChangeProb >= PLAN_CHANGE) parts.push("Could change your plan");
  if (i.scoreSpread >= SCORE_POINTS) parts.push(`±${Math.round(i.scoreSpread)} score point${Math.round(i.scoreSpread) === 1 ? "" : "s"}`);
  if (i.billSpreadGbp >= BILL_GBP) parts.push(`~£${Math.round(i.billSpreadGbp / 5) * 5}/yr`);
  return parts;
}

export const reasonOf = (i: FieldImpact) => reasonParts(i).join(" · ");

/** The options the decision model could not tell apart: an even spread for fields we only guessed, its own numbers otherwise. */
export function alternativesOf(fields: Partial<Record<FieldKey, Stated>>, extracted: Partial<Record<FieldKey, ExtractedField>>, record: PropertyRecord) {
  const out: Partial<Record<FieldKey, Record<string, number>>> = {};
  for (const step of STEPS) {
    for (const key of step.fields) {
      const def = FIELDS.find((f) => f.key === key)!;
      const f = fields[key];
      if (def.kind !== "enum" || !f || f.source === "you" || !applies(key, record)) continue;
      const modelled = extracted[key]?.probabilities;
      if (modelled && Object.keys(modelled).length) out[key] = modelled;
      else if (f.source === "default") out[key] = Object.fromEntries(def.options.map((o) => [o.value, 1 / def.options.length]));
    }
  }
  return out;
}

/** Splits one step's fields (already filtered to those that apply) by how the review should treat them. */
export function arrange(keys: FieldKey[], plan: QuestionPlan | null, fields: Partial<Record<FieldKey, Stated>>): Arranged {
  const none: Arranged = { main: keys, confident: [], quick: [], matters: new Set() };
  if (!plan || plan.source !== "engine") return none;
  const impact = new Map(plan.fields.map((f) => [f.key, f]));
  const ranked: FieldKey[] = [];
  const unranked: FieldKey[] = [];
  const confident: FieldKey[] = [];
  const quick: FieldKey[] = [];
  const matters = new Set<FieldKey>();
  for (const key of keys) {
    const i = impact.get(key);
    if (!i) unranked.push(key);
    else if (i.confident && fields[key]?.source !== "you") confident.push(key);
    else if (reasonParts(i).length === 0) quick.push(key);
    else {
      ranked.push(key);
      if (fields[key]?.source !== "you") matters.add(key);
    }
  }
  const rank = (k: FieldKey) => impact.get(k)!.rank;
  ranked.sort((a, b) => rank(a) - rank(b));
  confident.sort((a, b) => rank(a) - rank(b));
  quick.sort((a, b) => rank(a) - rank(b));
  return { main: [...ranked, ...unranked], confident, quick, matters };
}

/** The questions worth a look first, across the whole review. */
export function topQuestions(plan: QuestionPlan | null, fields: Partial<Record<FieldKey, Stated>>, shown: ReadonlySet<FieldKey>, n = 4): FieldImpact[] {
  if (!plan || plan.source !== "engine") return [];
  return plan.fields.filter((f) => shown.has(f.key) && !f.confident && fields[f.key]?.source !== "you" && reasonParts(f).length > 0).slice(0, n);
}
