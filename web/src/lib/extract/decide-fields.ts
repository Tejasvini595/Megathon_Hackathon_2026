import { decide, decisionThreshold } from "../llm/decide";
import { FIELDS, type ExtractedField, type FieldKey, type FieldSource } from "./fields";

/**
 * The decision model reads the description once and returns a probability for every option of every choice field.
 * Fields the rules or the LLM reader didn't state get the most likely option when it clears DECISION_CONFIDENT; every
 * choice field keeps its probabilities so the review can ask the uncertain, high-stakes ones first (engine /sensitivity).
 */
const CHOICE_FIELDS = FIELDS.filter((f) => f.kind === "enum");

export async function decideFields(text: string, fields: Record<FieldKey, ExtractedField>, source: FieldSource) {
  const questions = Object.fromEntries(
    CHOICE_FIELDS.map((f) => [
      f.key,
      {
        type: "choice" as const,
        instructions: `${f.label}${"hint" in f && f.hint ? ` (${f.hint})` : ""}: the most likely answer for this home from the description. If it isn't stated, judge from what is (age, type, location).`,
        criteria: Object.fromEntries(f.options.map((o) => [o.value, o.label])),
      },
    ]),
  );
  const answers = await decide({ description: text }, questions);
  if (!answers) return false;
  const threshold = decisionThreshold();
  for (const f of CHOICE_FIELDS) {
    const a = answers[f.key];
    if (!a?.probabilities || !a.choice) continue;
    const key = f.key as FieldKey;
    const prior = fields[key];
    const p = a.probabilities[a.choice] ?? 0;
    if (prior && prior.source !== "default") fields[key] = { ...prior, probabilities: a.probabilities };
    else if (p >= threshold) fields[key] = { value: a.choice, confidence: p, source, evidence: "Read from your description", probabilities: a.probabilities };
    else if (prior) fields[key] = { ...prior, probabilities: a.probabilities };
  }
  return true;
}
