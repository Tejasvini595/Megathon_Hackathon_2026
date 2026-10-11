import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Every LLM call goes through OpenRouter. Each job has its own model and thinking level, set by environment variables
 * (see .env.example); the defaults are small open-weight models, since none of these jobs needs a frontier model.
 */
type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type Role = "parse" | "explain" | "extract" | "vision";

const DEFAULTS: Record<Role, { model: string; effort: Effort | "default" }> = {
  parse: { model: "deepseek/deepseek-v4.1-flash", effort: "none" },
  explain: { model: "z-ai/glm-5.3-flash", effort: "low" },
  extract: { model: "deepseek/deepseek-v4.1-flash", effort: "none" },
  vision: { model: "z-ai/glm-5.3-flash", effort: "low" },
};
const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "default"];

export function config(role: Role) {
  const key = `LLM_${role.toUpperCase()}`;
  const effort = process.env[`${key}_REASONING`] ?? DEFAULTS[role].effort;
  if (!EFFORTS.includes(effort)) throw new Error(`${key}_REASONING must be one of ${EFFORTS.join(", ")}`);
  return { model: process.env[`${key}_MODEL`] ?? DEFAULTS[role].model, effort: effort as Effort | "default" };
}

/** The Jev-style decision model for typed questions with probabilities (OpenRouter Decisions API). */
export const decisionModelId = () => process.env.DECISION_MODEL ?? "typesafe/jev-1.13";

export const llmEnabled = () => Boolean(process.env.OPENROUTER_API_KEY);

let provider: ReturnType<typeof createOpenRouter> | null = null;
export function openrouter() {
  provider ??= createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  return provider;
}

/** The language model for a job, with its thinking level ("default" leaves it to the model). */
export function model(role: Role) {
  const { model: id, effort } = config(role);
  return openrouter()(id, effort === "default" ? {} : { extraBody: { reasoning: { effort } } });
}
