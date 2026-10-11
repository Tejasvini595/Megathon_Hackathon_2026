import type { FieldKey, FieldValue } from "@/lib/extract/fields";

/**
 * Which review questions matter for this home. The decision model says how likely each answer is; the engine re-runs
 * the home under each likely answer and measures how much the score, the plan and the bills would move. Fields are then
 * asked in order of that impact. Numbers come from the engine; the UI only orders and labels.
 */
export type FieldImpact = {
  key: FieldKey;
  /** The most likely answer and the probability of each option (from the decision model). */
  best: FieldValue;
  probabilities: Record<string, number>;
  /** True when the best answer's probability clears DECISION_CONFIDENT: shown pre-filled, still confirmable. */
  confident: boolean;
  /** Probability-weighted |score change| (points) if the answer were different from `best`. */
  scoreSpread: number;
  /** Probability that the recommended package would change. */
  planChangeProb: number;
  /** Probability-weighted |change in the package's bill saving| (pounds a year). */
  billSpreadGbp: number;
  /** 1 = ask first. */
  rank: number;
};

export type QuestionPlan = { fields: FieldImpact[]; threshold: number; source: "engine" | "unavailable" };
