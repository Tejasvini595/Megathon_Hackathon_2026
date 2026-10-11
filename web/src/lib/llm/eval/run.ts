/**
 * Explanation evaluation for the web app's LLM pipeline (the brief's targets: groundedness >= 90%, factual accuracy >= 90%,
 * unsupported claims < 5%). Scenarios and scoring come from the engine so the metrics match model/greenhome/llm_eval.py:
 *   bun run eval:llm            (needs ANTHROPIC_API_KEY; ENGINE_DIR defaults to ../model)
 * Writes model/reports/llm_eval_web.json.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateExplanation } from "../explainer";

const engineDir = resolve(process.env.ENGINE_DIR ?? join(import.meta.dir, "../../../../../model"));
const py = (...args: string[]) => {
  const r = spawnSync("uv", ["run", "python", "-W", "ignore", "-m", "greenhome.llm_eval_external", ...args], { cwd: engineDir, stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`engine eval step failed: ${args[0]}`);
};

const dir = mkdtempSync(join(tmpdir(), "ght-llm-eval-"));
const scenarios = join(dir, "scenarios.json");
const generated = join(dir, "generated.json");
py("export", scenarios, "--n", process.env.EVAL_N ?? "100");
const items = JSON.parse(readFileSync(scenarios, "utf8")) as { question: string; facts: Record<string, unknown>; slots: Record<string, unknown>; raw?: string }[];
if (process.env.ANTHROPIC_API_KEY) {
  const r = spawnSync("uv", ["run", "python", "-c", "from greenhome import llm; print(llm.SYSTEM)"], { cwd: engineDir, encoding: "utf8" });
  const system = r.stdout.trim();
  for (const [i, it] of items.entries()) {
    try {
      it.raw = await generateExplanation(system, it.question, it);
    } catch (e) {
      console.error(`scenario ${i}:`, e instanceof Error ? e.message : e);
    }
    if (i % 10 === 9) console.log(`${i + 1}/${items.length} generated`);
  }
} else {
  console.log("ANTHROPIC_API_KEY not set: scoring the engine's template explanations only.");
}
writeFileSync(generated, JSON.stringify(items));
py("score", generated);
