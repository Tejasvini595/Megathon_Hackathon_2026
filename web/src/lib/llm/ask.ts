import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { engineJson, type LlmContext } from "@/lib/engine";
import { generateExplanation } from "./explainer";
import { llmEnabled, MODELS, model } from "./provider";
import type { RetrofitId } from "@/lib/twin/types";

/**
 * The LLM side of Ask. It never computes: a question becomes a typed scenario (catalogue ids only), the engine re-runs,
 * and the explanation may only reference the engine's facts through [[slots]]. The engine's /check fills the slots and
 * rejects any number or claim the facts don't support; on rejection, or without an API key, the engine's template is used.
 */

const IDS = ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing", "smart_thermostat", "heat_pump", "solar_pv", "condensing_boiler"] as const;

let prompt: { system: string; measures: Record<string, string> } | null = null;
async function enginePrompt() {
  prompt ??= await engineJson<{ system: string; measures: Record<string, string> }>("/llm/prompt");
  return prompt;
}

const intent = z.object({
  kind: z.enum(["scenario", "explain"]).describe("scenario: the user proposes doing or not doing measures. explain: a question about the current result."),
  mode: z.enum(["add", "only", "remove"]).describe("add: on top of the current selection; only: exactly these measures; remove: drop these from the current selection"),
  measures: z.array(z.enum(IDS)).describe("Measures named in the request, catalogue ids only"),
  unsupported: z.array(z.string()).describe("Things the user asked about that are not in the catalogue (e.g. a wind turbine)"),
});

export type Parsed = { kind: "scenario" | "explain"; retrofits: RetrofitId[]; unsupported: string[]; source: "llm" | "rules"; note: string };

function compose(mode: "add" | "only" | "remove", measures: RetrofitId[], current: RetrofitId[]): RetrofitId[] {
  const set = new Set(mode === "only" ? measures : mode === "add" ? [...current, ...measures] : current.filter((m) => !measures.includes(m)));
  return IDS.filter((id) => set.has(id));
}

export async function parseQuestion(question: string, current: RetrofitId[]): Promise<Parsed> {
  const p = await enginePrompt();
  if (llmEnabled() && p) {
    try {
      const { output } = await generateText({
        model: model(MODELS.parse),
        output: Output.object({ schema: intent }),
        system:
          "Turn a homeowner's message into a retrofit scenario for an energy engine. Use only these measure ids:\n" +
          Object.entries(p.measures).map(([id, label]) => `- ${id}: ${label}`).join("\n") +
          `\nThe current scenario is: ${current.length ? current.join(", ") : "nothing (the home as it is today)"}. Do not answer the question.`,
        prompt: question,
      });
      const retrofits = output.kind === "scenario" ? compose(output.mode, output.measures, current) : current;
      return { kind: output.kind, retrofits, unsupported: output.unsupported, source: "llm", note: output.unsupported.length ? `Not in the retrofit catalogue, so ignored: ${output.unsupported.join(", ")}.` : "" };
    } catch (e) {
      console.error("LLM parse failed, using rules", e instanceof Error ? e.message : e);
    }
  }
  const r = await engineJson<{ retrofits: RetrofitId[]; unsupported: string[]; note: string }>("/parse", { text: question, current });
  if (!r) throw new Error("engine unavailable");
  const changed = r.retrofits.join() !== current.join();
  return { kind: changed ? "scenario" : "explain", retrofits: r.retrofits, unsupported: r.unsupported, source: "rules", note: r.note };
}

export type Explanation = { text: string; source: "llm" | "template"; note: string | null };

export async function explain(question: string, ctx: LlmContext): Promise<Explanation> {
  const p = await enginePrompt();
  if (!llmEnabled() || !p) return { text: ctx.template, source: "template", note: "Standard explanation (the AI explainer is not configured)." };
  try {
    const raw = await generateExplanation(p.system, question, ctx);
    const check = await engineJson<{ ok: boolean; text: string; issues: string[] }>("/check", { text: raw, facts: ctx.facts });
    if (check?.ok) return { text: check.text, source: "llm", note: null };
    console.warn("LLM explanation rejected by the engine's checks:", check?.issues.slice(0, 3));
    return { text: ctx.template, source: "template", note: "Standard explanation (the AI's wording didn't pass the number and claim checks)." };
  } catch (e) {
    console.error("LLM explain failed", e instanceof Error ? e.message : e);
    return { text: ctx.template, source: "template", note: "Standard explanation (the AI explainer is unavailable right now)." };
  }
}
