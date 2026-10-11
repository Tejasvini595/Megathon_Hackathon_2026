import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion, type JSONValue } from "ai";
import { decisionModelId, decisionRouting, llmEnabled, openrouter } from "./provider";

/**
 * Typed decisions with a probability for every option, from the configured decision model (OpenRouter Decisions API).
 * Used where a calibrated distribution matters more than prose: reading a description into field options, and
 * spotting memory facts in an Ask message. Null when no key is configured or the call fails (callers fall back).
 */
export type Choice = { choice: string; probabilities: Record<string, number> };
export type Questions = Record<string, Experimental_EvaluationQuestion>;

export const decisionThreshold = () => Number(process.env.DECISION_CONFIDENT ?? 0.85);

export async function decide(state: string | { [k: string]: JSONValue }, questions: Questions, model = decisionModelId()) {
  if (!llmEnabled()) return null;
  try {
    const route = decisionRouting();
    const result = await evaluate({ model: openrouter().evaluationModel(model, route ? { provider: route } : {}), state, questions });
    return result.answers as Record<string, { choice?: string; probability?: number; probabilities?: Record<string, number>; score?: number }>;
  } catch (e) {
    console.error("decision model failed", e instanceof Error ? e.message : e);
    return null;
  }
}
