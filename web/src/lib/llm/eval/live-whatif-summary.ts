/** Accuracy tables from model/reports/llm_live_whatif.json (written by live-whatif.ts):  bun src/lib/llm/eval/live-whatif-summary.ts */
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON rows from the results file
type Row = Record<string, any>;
const file = join(import.meta.dir, "../../../../../model/reports/llm_live_whatif.json");
const { rows } = JSON.parse(await Bun.file(file).text()) as { rows: Row[] };
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}% (${n}/${d})` : "n/a");
const count = (rs: Row[], f: string) => rs.filter((r) => r[f]).length;
const key = (a: string[]) => [...a].sort().join("+");
const noBoiler = (a: string[]) => a.filter((x) => x !== "condensing_boiler");
/** Accepts the additive reading of "add X" (current + X), and ignores the boiler for "everything". */
const loose = (r: Row, got?: string[]) => {
  if (!got) return false;
  const [g, w] = r.kind === "everything" ? [noBoiler(got), noBoiler(r.gold)] : [got, r.gold];
  return key(g) === key(w) || key(g) === key([...new Set([...r.current, ...r.gold])]);
};
for (const r of rows) Object.assign(r, { llmLoose: loose(r, r.llm?.retrofits), rulesLoose: loose(r, r.rules?.retrofits) });

function table(title: string, rs: Row[]) {
  const withUns = rs.filter((r) => r.unsupportedGold.length);
  console.log(`\n## ${title} (n=${rs.length})`);
  console.log(`| metric | LLM parser | rules baseline |\n|---|---|---|`);
  console.log(`| exact set | ${pct(count(rs, "llmExact"), rs.length)} | ${pct(count(rs, "rulesExact"), rs.length)} |`);
  console.log(`| exact set, "everything" ignoring the boiler | ${pct(count(rs, "llmLenient"), rs.length)} | ${pct(count(rs, "rulesLenient"), rs.length)} |`);
  console.log(`| exact set, additive reading accepted too | ${pct(count(rs, "llmLoose"), rs.length)} | ${pct(count(rs, "rulesLoose"), rs.length)} |`);
  console.log(`| scenario/explain kind | ${pct(count(rs, "llmKind"), rs.length)} | ${pct(count(rs, "rulesKind"), rs.length)} |`);
  console.log(`| unsupported measure reported | ${pct(count(withUns, "llmUnsupported"), withUns.length)} | ${pct(count(withUns, "rulesUnsupported"), withUns.length)} |`);
}
const runs = [...new Set(rows.map((r) => r.run))];
for (const run of runs) {
  const rs = rows.filter((r) => r.run === run);
  table(run, rs);
  for (const set of [...new Set(rs.map((r) => r.set))]) if (rs.some((r) => r.set !== set)) table(`${run} / ${set}`, rs.filter((r) => r.set === set));
  for (const kind of [...new Set(rs.map((r) => r.kind))]) console.log(`  ${kind}: LLM ${pct(count(rs.filter((r) => r.kind === kind), "llmExact"), rs.filter((r) => r.kind === kind).length)}, rules ${pct(count(rs.filter((r) => r.kind === kind), "rulesExact"), rs.filter((r) => r.kind === kind).length)}`);
  console.log(`  parser fell back to rules: ${rs.filter((r) => r.llm?.source === "rules").length}; median LLM latency ${[...rs.map((r) => r.latencyMs)].sort((a, b) => a - b)[Math.floor(rs.length / 2)]} ms`);
}
const all = rows;
table("all runs", all);
console.log("\n## LLM failures");
for (const r of all.filter((r) => !r.llmLoose)) console.log(`[${r.run} | ${r.set} | ${r.kind}] "${r.text}" current=${r.current.join("+") || "-"} gold=${r.gold.join("+") || "-"} got=${r.llm?.retrofits.join("+") || "-"} rules=${r.rules?.retrofits.join("+") || "-"} src=${r.llm?.source}`);
