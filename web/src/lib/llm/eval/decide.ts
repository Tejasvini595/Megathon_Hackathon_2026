/**
 * Benchmarks decision models (OpenRouter Decisions API) on reading homes into the record's choice fields:
 *   - the labelled descriptions (src/lib/extract/eval: development + held-out cases), in homeowners' own words;
 *   - held-out EPC free-text descriptions with the dataset's typed fields (model/greenhome/decision_eval_export.py).
 * Reports accuracy, log loss, Brier score, calibration error (ECE), latency and cost per model, and the probability
 * threshold at which pre-filled answers are right at least 95% of the time (use it as DECISION_CONFIDENT).
 *   bun run eval:decide        (needs OPENROUTER_API_KEY; EVAL_DECISION_MODELS="a,b" to choose models; EVAL_EPC_N=150)
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { experimental_evaluate as evaluate } from "ai";
import { FIELDS, type FieldKey } from "../../extract/fields";
import { CASES } from "../../extract/eval/cases";
import { HELDOUT } from "../../extract/eval/heldout";
import { decisionRouting, openrouter } from "../provider";

const CANDIDATES = (process.env.EVAL_DECISION_MODELS ??
  "perplexity/pplx-decider-v1.1-27b,inception/mercury-decide,cloudflare/clef-flash,nace-ai/drex-v1.5,liquid/d1,microsoft/microsoft-decision-1,typesafe/jev-1.13,jaredpalmer/kev-4b,togethercomputer/tev1-4b-experimental"
).split(",");
const CHOICE = new Map(FIELDS.filter((f) => f.kind === "enum").map((f) => [f.key as FieldKey, f]));
type Item = { id: string; text: string; gold: Partial<Record<FieldKey, string>>; set: string };

function items(): Item[] {
  const own = [...CASES.map((c) => ({ ...c, set: "descriptions (dev)" })), ...HELDOUT.map((c) => ({ ...c, set: "descriptions (held-out)" }))].map((c) => ({
    id: c.id,
    text: c.text,
    set: c.set,
    gold: Object.fromEntries(Object.entries(c.gold).filter(([k, v]) => CHOICE.has(k as FieldKey) && typeof v === "string")) as Item["gold"],
  }));
  const dir = mkdtempSync(join(tmpdir(), "ght-decide-"));
  const file = join(dir, "epc.json");
  const engineDir = resolve(process.env.ENGINE_DIR ?? join(import.meta.dir, "../../../../../model"));
  const r = spawnSync("uv", ["run", "python", "-W", "ignore", "-m", "greenhome.decision_eval_export", file, "--n", process.env.EVAL_EPC_N ?? "150"], { cwd: engineDir, stdio: "inherit" });
  const epc = r.status === 0 ? (JSON.parse(readFileSync(file, "utf8")) as Omit<Item, "set">[]).map((x) => ({ ...x, set: "EPC text (held-out)" })) : [];
  return [...own, ...epc].filter((x) => Object.keys(x.gold).length);
}

type Outcome = { set: string; correct: boolean; pTrue: number; pTop: number };

async function run(model: string, all: Item[]) {
  const out: Outcome[] = [];
  let ms = 0, cost = 0, calls = 0, failures = 0;
  const route = decisionRouting();
  for (const it of all) {
    const keys = Object.keys(it.gold) as FieldKey[];
    const questions = Object.fromEntries(
      keys.map((k) => {
        const f = CHOICE.get(k)!;
        return [k, { type: "choice" as const, instructions: `${f.label}: the most likely answer for this home.`, criteria: Object.fromEntries(f.kind === "enum" ? f.options.map((o) => [o.value, o.label]) : []) }];
      }),
    );
    const t = performance.now();
    try {
      const r = await evaluate({ model: openrouter().evaluationModel(model, route ? { provider: route } : {}), state: { description: it.text }, questions });
      ms += performance.now() - t; calls++;
      cost += Number((r.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage?.cost ?? 0);
      for (const k of keys) {
        const a = r.answers[k] as { choice?: string; probabilities?: Record<string, number> };
        const probs = a?.probabilities ?? {};
        out.push({ set: it.set, correct: a?.choice === it.gold[k], pTrue: probs[it.gold[k]!] ?? 0, pTop: a?.choice ? (probs[a.choice] ?? 0) : 0 });
      }
    } catch (e) {
      failures++;
      if (failures <= 2) console.error(`${model}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { model, out, ms: calls ? ms / calls : NaN, costPer1k: calls ? (cost / calls) * 1000 : NaN, failures };
}

function metrics(o: Outcome[]) {
  const n = o.length || 1;
  const acc = o.filter((x) => x.correct).length / n;
  const logLoss = -o.reduce((s, x) => s + Math.log(Math.max(x.pTrue, 1e-4)), 0) / n;
  const brier = o.reduce((s, x) => s + (1 - x.pTrue) ** 2, 0) / n;
  let ece = 0;
  for (let b = 0; b < 10; b++) {
    const bin = o.filter((x) => x.pTop >= b / 10 && (x.pTop < (b + 1) / 10 || (b === 9 && x.pTop <= 1)));
    if (bin.length) ece += (bin.length / n) * Math.abs(bin.filter((x) => x.correct).length / bin.length - bin.reduce((s, x) => s + x.pTop, 0) / bin.length);
  }
  // smallest threshold where answers at or above it are right >= 95% of the time
  let threshold: number | null = null, coverage = 0;
  for (let t = 0.5; t <= 0.99; t += 0.01) {
    const kept = o.filter((x) => x.pTop >= t);
    if (kept.length >= 20 && kept.filter((x) => x.correct).length / kept.length >= 0.95) { threshold = Math.round(t * 100) / 100; coverage = kept.length / n; break; }
  }
  return { n: o.length, acc, logLoss, brier, ece, threshold, coverage };
}

if (import.meta.main) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("OPENROUTER_API_KEY is not set: nothing to benchmark. Set it and run `bun run eval:decide` again.");
    process.exit(0);
  }
  const all = items();
  console.log(`${all.length} items, ${CANDIDATES.length} models`);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const rows: string[] = [];
  for (const model of CANDIDATES) {
    const r = await run(model, all);
    const overall = metrics(r.out);
    const sets = [...new Set(r.out.map((x) => x.set))].map((s) => `${s}: ${pct(metrics(r.out.filter((x) => x.set === s)).acc)}`).join(" · ");
    const line = `| ${model} | ${pct(overall.acc)} | ${overall.logLoss.toFixed(3)} | ${overall.brier.toFixed(3)} | ${pct(overall.ece)} | ${overall.threshold ?? "–"} (${pct(overall.coverage)}) | ${r.ms.toFixed(0)} ms | $${r.costPer1k.toFixed(4)} | ${r.failures} | ${sets} |`;
    console.log(line);
    rows.push(line);
  }
  const md = [
    `# Decision models on reading homes (${new Date().toISOString().slice(0, 10)})`,
    "",
    `${all.length} items: homeowners' descriptions (labelled dev and held-out sets) and held-out EPC free text (truth = the dataset's typed fields, parsed from the same text by data/gen, so this measures agreement with that parser). Choice fields only.`,
    "",
    "| Model | Accuracy | Log loss | Brier | ECE | Threshold for 95% right (coverage) | Latency / call | Cost / 1k calls | Failed calls | Accuracy by set |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "Lower log loss / Brier / ECE = better calibrated probabilities. Pick the model with the best log loss at acceptable latency; set DECISION_CONFIDENT to its threshold.",
  ].join("\n");
  await Bun.write(new URL("./decide-results.md", import.meta.url).pathname, md);
  console.log("wrote src/lib/llm/eval/decide-results.md");
}
