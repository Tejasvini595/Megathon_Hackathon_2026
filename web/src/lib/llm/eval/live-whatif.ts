/**
 * What-if parsing, live: the production parseQuestion (LLM, enum-constrained) against the engine's rules parser (/parse) as the baseline.
 *   bun run eval:live-whatif       (needs OPENROUTER_API_KEY and the engine)
 * Writes model/reports/llm_live_whatif.json.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { engineJson } from "@/lib/engine";
import { parseQuestion } from "../ask";
import { APP_CASES, emptyCurrent, ids, PORTED, type Case } from "./live-whatif-cases";

type Out = { retrofits: string[]; unsupported: string[] };
const key = (r: string[]) => [...r].sort().join("+");
const same = (a: string[], b: string[], lenient: boolean) => key(lenient ? a.filter((x) => x !== "condensing_boiler") : a) === key(lenient ? b.filter((x) => x !== "condensing_boiler") : b);
const unsupportedOk = (got: string[], want: string[]) => want.every((g) => g.split(" ").some((w) => got.join(" ").toLowerCase().includes(w)));

const runs: { name: string; cases: Case[] }[] = [
  { name: "current = loft + glazing", cases: PORTED },
  { name: "current = nothing", cases: PORTED.map(emptyCurrent).filter((c): c is Case => c !== null) },
  { name: "app phrasings", cases: APP_CASES },
];

const rows: Record<string, unknown>[] = [];
for (const run of runs) {
  let next = 0;
  const done = new Array<Record<string, unknown>>(run.cases.length);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < run.cases.length) {
        const c = run.cases[next++], i = next - 1;
        const current = ids(c.current), gold = ids(c.gold);
        const t0 = performance.now();
        const llm = await parseQuestion(c.text, current).catch((e) => ({ error: String(e) }));
        const ms = Math.round(performance.now() - t0);
        const rules = await engineJson<Out>("/parse", { text: c.text, current });
        const wantKind = key(gold) === key(current) ? "explain" : "scenario";
        const l = "error" in llm ? null : llm;
        done[i] = {
          run: run.name, set: c.set, kind: c.kind, text: c.text, current, gold, unsupportedGold: c.unsupported ?? [], wantKind, latencyMs: ms,
          llm: l && { retrofits: l.retrofits, kind: l.kind, unsupported: l.unsupported, source: l.source },
          llmExact: !!l && same(l.retrofits, gold, false), llmLenient: !!l && same(l.retrofits, gold, c.kind === "everything"), llmKind: l?.kind === wantKind,
          llmUnsupported: l ? unsupportedOk(l.unsupported, c.unsupported ?? []) : false,
          rules: rules && { retrofits: rules.retrofits, unsupported: rules.unsupported },
          rulesExact: !!rules && same(rules.retrofits, gold, false), rulesLenient: !!rules && same(rules.retrofits, gold, c.kind === "everything"),
          rulesKind: !!rules && (key(rules.retrofits) === key(current) ? "explain" : "scenario") === wantKind,
          rulesUnsupported: rules ? unsupportedOk(rules.unsupported, c.unsupported ?? []) : false,
        };
      }
    }),
  );
  rows.push(...done);
  console.log(run.name, done.length, "cases");
}
const out = join(import.meta.dir, "../../../../../model/reports/llm_live_whatif.json");
writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), model: process.env.LLM_PARSE_MODEL, rows }, null, 1));
console.log("wrote", out);
