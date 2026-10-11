import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

/** One explanation call, shared by Ask and the evaluation script so both measure the same prompt. */
export const EXPLAIN_MODEL = process.env.ASK_EXPLAIN_MODEL ?? "claude-sonnet-5-5";

export type ExplainContext = { facts: Record<string, unknown>; slots: Record<string, unknown> };

/** Raw model output: prose with [[slot]] references only (the engine's /check fills and verifies them). */
export async function generateExplanation(system: string, question: string, ctx: ExplainContext) {
  const slots = Object.entries(ctx.slots).map(([k, v]) => `${k} = ${v}`).join("\n");
  const { text } = await generateText({
    model: anthropic(EXPLAIN_MODEL),
    maxOutputTokens: 700,
    messages: [
      { role: "system", content: system, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      { role: "user", content: `FACTS:\n${JSON.stringify(ctx.facts)}\n\nSLOTS (use these names only):\n${slots}\n\nCUSTOMER QUESTION: ${question || "Explain my score and what I should do."}` },
    ],
  });
  return text;
}
