import type { Outcome, Summary } from "./score";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const show = (v: unknown) => (Array.isArray(v) ? `[${v.join(", ")}]` : String(v));

export type Report = {
  extractor: string;
  date: string;
  cases: number;
  summary: Summary;
  misses: Outcome[];
  falseFills: { caseId: string; key: string; value: unknown }[];
};

export function toMarkdown(r: Report) {
  const s = r.summary;
  const lines = [
    "# Extraction evaluation",
    "",
    `Extractor: \`${r.extractor}\` · ${r.date} · ${r.cases} hand-written descriptions, ${s.n} labelled fields, text input only.`,
    "",
    "## Headline",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Macro accuracy (mean of per-field accuracy) | ${pct(s.macro)} |`,
    `| Micro accuracy (all labelled fields) | ${pct(s.micro)} |`,
    `| Coverage (labelled fields filled from the text, not defaulted) | ${pct(s.coverage)} |`,
    `| Accuracy when filled from the text | ${pct(s.accuracyWhenFilled)} |`,
    `| Expected calibration error | ${pct(s.ece)} |`,
    `| False fills (fields the text leaves open but the extractor filled) | ${r.falseFills.length} |`,
    "",
    "## Per field",
    "",
    "| Field | Labelled | Accuracy | Coverage |",
    "| --- | --: | --: | --: |",
    ...s.perField.map((f) => `| ${f.key} | ${f.n} | ${pct(f.accuracy)} | ${pct(f.coverage)} |`),
    "",
    "## Calibration",
    "",
    "Tiers match the review screen: Sure at 0.85 and above, Likely at 0.6 and above, Guess below.",
    "",
    "| Tier | Fields | Accuracy | Mean confidence |",
    "| --- | --: | --: | --: |",
    ...s.perTier.map((t) => `| ${t.tier} | ${t.n} | ${t.n ? pct(t.accuracy) : "n/a"} | ${t.n ? pct(t.meanConfidence) : "n/a"} |`),
    "",
    `## Misses (${r.misses.length})`,
    "",
    "| Case | Field | Gold | Got | Confidence | Source |",
    "| --- | --- | --- | --- | --: | --- |",
    ...r.misses.map((m) => `| ${m.caseId} | ${m.key} | ${show(m.gold)} | ${show(m.value)} | ${m.confidence.toFixed(2)} | ${m.source} |`),
  ];
  if (r.falseFills.length) {
    lines.push("", "## False fills", "", "| Case | Field | Filled with |", "| --- | --- | --- |", ...r.falseFills.map((f) => `| ${f.caseId} | ${f.key} | ${show(f.value)} |`));
  }
  return lines.join("\n") + "\n";
}

export function toConsole(r: Report) {
  const s = r.summary;
  return [
    `${r.extractor}: macro ${pct(s.macro)}, micro ${pct(s.micro)}, coverage ${pct(s.coverage)}, accuracy when filled ${pct(s.accuracyWhenFilled)}, ECE ${pct(s.ece)}, false fills ${r.falseFills.length}`,
    ...s.perTier.map((t) => `  ${t.tier.padEnd(6)} n=${String(t.n).padStart(3)} accuracy ${t.n ? pct(t.accuracy) : "n/a"}`),
    ...s.perField.map((f) => `  ${f.key.padEnd(18)} ${pct(f.accuracy).padStart(6)} of ${f.n}`),
    `  ${r.misses.length} misses, listed in results.md`,
  ].join("\n");
}
