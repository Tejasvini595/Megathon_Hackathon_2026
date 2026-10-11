/**
 * Live explanation run: engine facts -> production prompt and model (generateExplanation) -> engine /check.
 *   bun run eval:live-explain          (needs OPENROUTER_API_KEY and the engine at ENGINE_URL)
 * Writes model/reports/llm_live_explain.json; score it with score_live.py (the brief's four metrics).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { normaliseRecord } from "@/lib/extract";
import { generateExplanationWithUsage } from "../explainer";
import { SCENARIOS } from "./live-scenarios";

const engine = process.env.ENGINE_URL ?? "http://localhost:8000";
const post = async (path: string, body: unknown) => {
  const res = await fetch(`${engine}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};
const { system } = (await (await fetch(`${engine}/llm/prompt`)).json()) as { system: string };

type Check = { ok: boolean; text: string; issues: string[] };
async function one(s: (typeof SCENARIOS)[number]) {
  const { llm } = await post("/twin", { record: normaliseRecord(s.record), place: s.place, retrofits: s.retrofits });
  const out: Record<string, unknown> = { ...s, record: undefined, facts: llm.facts, slots: llm.slots, template: llm.template };
  const t0 = performance.now();
  try {
    const g = await generateExplanationWithUsage(system, s.question, llm);
    out.latencyMs = Math.round(performance.now() - t0);
    out.raw = g.text;
    out.usage = g.usage;
    out.cost = (g.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage?.cost ?? null;
    const c = (await post("/check", { text: g.text, facts: llm.facts })) as Check;
    Object.assign(out, { ok: c.ok, rendered: c.text, issues: c.issues });
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}

const results: Record<string, unknown>[] = new Array(SCENARIOS.length);
let next = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < SCENARIOS.length) {
      const i = next++;
      results[i] = await one(SCENARIOS[i]);
      console.log(`${i + 1}/${SCENARIOS.length} ${SCENARIOS[i].id} ${results[i].error ?? (results[i].ok ? "accepted" : "rejected")}`);
    }
  }),
);
const out = join(import.meta.dir, "../../../../../model/reports/llm_live_explain.json");
writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), engine, models: process.env.LLM_EXPLAIN_MODEL, results }, null, 1));
console.log("wrote", out, "cost", results.reduce((a, r) => a + ((r.cost as number) ?? 0), 0));
