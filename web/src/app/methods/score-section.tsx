import { Scroll, Section, td, th } from "./section";
import type { Methods, MTable } from "./types";

function Table({ t }: { t: MTable }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-medium">{t.title}</p>
      <Scroll>
        <table className="mt-1 w-full min-w-[220px]">
          <thead>
            <tr>
              {t.headers.map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className="border-t border-hairline">
                {r.map((c, j) => (
                  <td key={j} className={td}>
                    {c.replaceAll("_", " ")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Scroll>
      {t.note && <p className="mt-1 text-[11px] text-muted-foreground">{t.note}</p>}
    </div>
  );
}

export function ScoreSection({ score }: { score: Methods["score"] }) {
  return (
    <Section id="score" title="The score" hint="Fixed weights, monotone sub-score maps: a better state never scores lower.">
      <p className="text-xs text-muted-foreground">{score.formula}</p>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Score weights">
        {score.weights.map((w, i) => (
          <div key={w.key} className="h-full border-r border-background last:border-0" style={{ width: `${w.weight * 100}%`, background: `var(--chart-${(i % 5) + 1})` }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {score.weights.map((w, i) => (
          <li key={w.key} className="flex items-center gap-3 text-sm">
            <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--chart-${(i % 5) + 1})` }} />
            <span className="flex-1">{w.label}</span>
            <span className="tabular font-semibold">{Math.round(w.weight * 100)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] font-medium">Classes</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {score.classes.map((c) => (
          <span key={c.label} className="mr-3 inline-block whitespace-nowrap">
            <span className="tabular text-foreground">{c.min}+</span> {c.label}
          </span>
        ))}
      </p>
      <div className="mt-4 space-y-2">
        {score.components.map((c) => (
          <details key={c.key} className="group rounded-2xl bg-surface-2 px-3.5 py-3">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 text-sm">
              <span>{c.label}</span>
              <span className="tabular text-xs text-muted-foreground">{Math.round(c.weight * 100)}% weight</span>
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">{c.summary}</p>
            {c.tables.map((t) => (
              <Table key={t.title} t={t} />
            ))}
          </details>
        ))}
      </div>
    </Section>
  );
}
