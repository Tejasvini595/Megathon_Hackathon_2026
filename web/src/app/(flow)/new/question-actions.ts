"use server";

import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { engineJson, placeOf } from "@/lib/engine";
import { decisionThreshold } from "@/lib/llm/decide";
import type { FieldKey } from "@/lib/extract/fields";
import type { FieldImpact, QuestionPlan } from "@/lib/questions";

const input = z.object({
  record: z.record(z.string(), z.unknown()),
  probabilities: z.record(z.string(), z.record(z.string(), z.number().min(0).max(1))),
  postcode: z.string().max(10).nullable(),
});

type Sensitivity = { fields: { key: string; best: string | number; score_spread: number; plan_change_prob: number; bill_spread_gbp: number }[] };

/**
 * Orders the review questions by how much each answer matters for this home: the decision model's probabilities say
 * which answers are plausible, and the engine (/sensitivity) re-runs the home under each one. Unavailable without the
 * engine; the review then keeps its normal order.
 */
export async function planQuestions(record: Record<string, unknown>, probabilities: Partial<Record<FieldKey, Record<string, number>>>, postcode: string | null): Promise<QuestionPlan> {
  await requireUser();
  const p = input.parse({ record, probabilities, postcode });
  const threshold = decisionThreshold();
  const r = await engineJson<Sensitivity>("/sensitivity", { record: p.record, place: await placeOf(p.postcode), alternatives: p.probabilities });
  if (!r) return { fields: [], threshold, source: "unavailable" };
  const fields: FieldImpact[] = r.fields.map((f, i) => {
    const probs = p.probabilities[f.key] ?? {};
    return {
      key: f.key as FieldKey,
      best: f.best,
      probabilities: probs,
      confident: Math.max(0, ...Object.values(probs)) >= threshold,
      scoreSpread: f.score_spread,
      planChangeProb: f.plan_change_prob,
      billSpreadGbp: f.bill_spread_gbp,
      rank: i + 1,
    };
  });
  return { fields, threshold, source: "engine" };
}
