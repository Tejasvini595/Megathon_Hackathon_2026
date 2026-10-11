import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/** All LLM calls go through OpenRouter (OPENROUTER_API_KEY). Models are OpenRouter slugs and can be swapped by env. */
export const MODELS = {
  parse: process.env.ASK_PARSE_MODEL ?? "anthropic/claude-haiku-5.5",
  explain: process.env.ASK_EXPLAIN_MODEL ?? "anthropic/claude-sonnet-5.5",
  extract: process.env.EXTRACT_MODEL ?? "anthropic/claude-haiku-5.5",
};

export const llmEnabled = () => Boolean(process.env.OPENROUTER_API_KEY);

let provider: ReturnType<typeof createOpenRouter> | null = null;
export function model(id: string) {
  provider ??= createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  return provider(id);
}
