import { Scroll, Section, td, th } from "./section";
import type { Methods, Row } from "./types";

const fmt = (v: number | null | undefined, unit: string) => {
  if (v == null) return "n/a";
  if (unit === "share") return `${(v * 100).toFixed(0)}%`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  return Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(2);
};

function Cell({ r, s }: { r: Row; s: string }) {
  const v = r.values[s];
  const b = r.baseline?.[s];
  const better = v != null && b != null && (r.betterWhen === "lower" ? v < b : v > b);
  return (
    <td className={td}>
      <span className="font-semibold">{fmt(v, r.unit)}</span>
      {b != null && <span className={better ? "block text-[11px] text-volt" : "block text-[11px] text-amber"}>baseline {fmt(b, r.unit)}</span>}
    </td>
  );
}

export function EvidenceSection({ evidence }: { evidence: Methods["evidence"] }) {
  const splits = Object.entries(evidence.splits);
  return (
    <Section id="evidence" title="Evidence" hint="Measured on homes the models were not fitted on, against simple baselines.">
      <ul className="space-y-2">
        {evidence.tiers.map((t) => (
          <li key={t.id} className="flex gap-3 text-xs">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">{t.id}</span>
            <span>
              <span className="font-medium">{t.name}.</span> <span className="text-muted-foreground">{t.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <Scroll>
        <table className="mt-4 w-full min-w-[480px]">
          <thead>
            <tr>
              <th className={th}>Check</th>
              {splits.map(([k, label]) => (
                <th key={k} className={th}>
                  {label}
                  {evidence.nHomes?.[k] != null && <span className="block">{evidence.nHomes[k].toLocaleString("en-GB")} homes</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evidence.rows.map((r) => (
              <tr key={r.label} className="border-t border-hairline">
                <td className="py-1.5 pr-3 align-top text-xs">
                  <span className="mr-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px]">{r.tier}</span>
                  {r.label} <span className="text-[11px] text-muted-foreground">({r.unit}{r.target != null ? `, target ${fmt(r.target, r.unit)}` : ""})</span>
                </td>
                {splits.map(([k]) => (
                  <Cell key={k} r={r} s={k} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>
      {evidence.note && <p className="mt-3 text-[11px] text-muted-foreground">{evidence.note}</p>}
    </Section>
  );
}
