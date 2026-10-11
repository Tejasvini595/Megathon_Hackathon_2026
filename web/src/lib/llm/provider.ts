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

/** OpenRouter provider routing from `<KEY>_PROVIDER` ("deepinfra,fireworks", tried in order) and `<KEY>_PROVIDER_FALLBACKS`. */
export function routing(key: string) {
  const order = process.env[`${key}_PROVIDER`]?.split(",").map((p) => p.trim()).filter(Boolean);
  if (!order?.length) return undefined;
  return { order, allow_fallbacks: process.env[`${key}_PROVIDER_FALLBACKS`] !== "false" };
}

export function config(role: Role) {
  const key = `LLM_${role.toUpperCase()}`;
  const effort = process.env[`${key}_REASONING`] ?? DEFAULTS[role].effort;
  if (!EFFORTS.includes(effort)) throw new Error(`${key}_REASONING must be one of ${EFFORTS.join(", ")}`);
  return { model: process.env[`${key}_MODEL`] ?? DEFAULTS[role].model, effort: effort as Effort | "default", provider: routing(key) };
}

/** The decision model (Jev-style: typed questions in, a probability per option out; OpenRouter Decisions API). */
export const decisionModelId = () => process.env.DECISION_MODEL ?? "perplexity/pplx-decider-v1.1-27b";
export const decisionRouting = () => routing("DECISION");

export const llmEnabled = () => Boolean(process.env.OPENROUTER_API_KEY);

let provider: ReturnType<typeof createOpenRouter> | null = null;
export function openrouter() {
  provider ??= createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, ...(process.env.OPENROUTER_BASE_URL && { baseURL: process.env.OPENROUTER_BASE_URL }) });
  return provider;
}

/** The language model for a job, with its thinking level ("default" leaves it to the model) and provider routing. */
export function model(role: Role) {
  const { model: id, effort, provider: route } = config(role);
  return openrouter()(id, { extraBody: { ...(effort !== "default" && { reasoning: { effort } }), ...(route && { provider: route }) } });
}
