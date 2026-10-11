/**
 * Bill reading evaluation on the synthetic bills in e2e/fixtures/bills (regenerate with `bun scripts/make-bills.ts`):
 *   bun run eval:bills        reader accuracy per printed number, and whether the checks flag the inconsistent bill
 * The checks are also run on the ground truth, which needs no API key; the reader needs OPENROUTER_API_KEY.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBill, type BillReading, type Finding } from "../../extract/bill-checks";
import { readBills } from "../bill";
import { llmEnabled } from "../provider";

type Truth = { file: string; description: string; consistent: boolean; statement: { start: string; end: string } | null; fuels: BillReading["fuels"] };

const dir = join(import.meta.dir, "../../../../e2e/fixtures/bills");
const truth: Truth[] = JSON.parse(readFileSync(join(dir, "truth.json"), "utf8"));
const concerns = (findings: Finding[]) => findings.filter((f) => f.level !== "ok");
const heatingFor = (t: Truth) => (t.fuels.some((f) => f.fuel === "gas") ? "gas_boiler" : "heat_pump");
const near = (a: number | null | undefined, b: number | null) => a != null && b != null && Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

function accuracy(t: Truth, read: BillReading) {
  let right = 0;
  let total = 0;
  const misses: string[] = [];
  for (const f of t.fuels) {
    const got = read.fuels.filter((g) => g.fuel === f.fuel);
    for (const p of f.periods) {
      total++;
      const hit = got.flatMap((g) => g.periods).find((q) => q.start === p.start && q.end === p.end);
      if (near(hit?.consumption, p.consumption)) right++;
      else misses.push(`${f.fuel} ${p.start}..${p.end}: want ${p.consumption}, got ${hit?.consumption ?? "none"}`);
    }
    if (f.annualTotal != null) {
      total++;
      if (got.some((g) => near(g.annualTotal, f.annualTotal))) right++;
      else misses.push(`${f.fuel} yearly total: want ${f.annualTotal}`);
    }
    if (got.some((g) => g.unit !== f.unit)) misses.push(`${f.fuel} unit: want ${f.unit}`);
  }
  return { right, total, misses };
}

console.log("Checks on the ground truth (no model involved):");
for (const t of truth) {
  const flagged = concerns(checkBill({ fuels: t.fuels, statements: t.statement ? [t.statement] : [] }, { heating: heatingFor(t) }).findings);
  const verdict = t.consistent ? (flagged.length ? "FALSE ALARM" : "ok") : flagged.length ? "caught" : "MISSED";
  console.log(`  ${t.file.padEnd(24)} ${verdict}${flagged.length ? `  (${flagged[0].message})` : ""}`);
}

if (!llmEnabled()) {
  console.log("\nOPENROUTER_API_KEY not set: skipping the reader. Set it to measure per-number accuracy.");
  process.exit(0);
}

console.log("\nReader accuracy:");
let [right, total] = [0, 0];
for (const t of truth) {
  const data = new Uint8Array(readFileSync(join(dir, t.file)));
  try {
    const read = await readBills([{ data, mediaType: "image/png" }]);
    const a = accuracy(t, read);
    right += a.right;
    total += a.total;
    const flagged = concerns(checkBill(read, { heating: heatingFor(t) }).findings);
    console.log(`  ${t.file.padEnd(24)} ${a.right}/${a.total} numbers right; checks ${flagged.length ? `raised ${flagged.length} (${t.consistent ? "unexpected" : "expected"})` : t.consistent ? "clean" : "MISSED the inconsistency"}`);
    for (const m of a.misses.slice(0, 5)) console.log(`      ${m}`);
  } catch (e) {
    total += t.fuels.reduce((n, f) => n + f.periods.length + (f.annualTotal != null ? 1 : 0), 0);
    console.log(`  ${t.file.padEnd(24)} reader failed: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\nOverall: ${right}/${total} numbers (${((100 * right) / Math.max(1, total)).toFixed(1)}%)`);
