import { extract, type Extractor } from "../index";
import { CASES } from "./cases";
import { toConsole, toMarkdown, type Report } from "./report";
import { outcomesOf, summarise } from "./score";

/** Runs any extractor over the hand-written cases as TEXT input. */
export async function evaluate(extractor: Extractor, name?: string): Promise<Report> {
  const outcomes = [];
  const falseFills = [];
  const models = new Set<string>();
  for (const c of CASES) {
    const result = await extractor([{ kind: "TEXT", text: c.text }]);
    result.models.forEach((m) => models.add(m));
    const o = outcomesOf(c, result);
    outcomes.push(...o.outcomes);
    falseFills.push(...o.falseFills);
  }
  return {
    extractor: name ?? [...models].join(" + "),
    date: new Date().toISOString().slice(0, 10),
    cases: CASES.length,
    summary: summarise(outcomes),
    misses: outcomes.filter((o) => !o.correct),
    falseFills,
  };
}

/** `bun run.ts [module] [out.md]`: the module exports `extract` (or a default) of type Extractor. */
if (import.meta.main) {
  const [modulePath, out = new URL("./results.md", import.meta.url).pathname] = process.argv.slice(2);
  const extractor: Extractor = modulePath ? ((m) => m.extract ?? m.default)(await import(modulePath)) : extract;
  const report = await evaluate(extractor);
  await Bun.write(out, toMarkdown(report));
  console.log(toConsole(report));
  console.log(`wrote ${out}`);
}
