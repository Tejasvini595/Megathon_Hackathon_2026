import type { TwinState } from "@/lib/twin/types";

const W = 340;
const H = 150;
const PAD = { l: 34, r: 4, t: 8, b: 20 };
const SERIES = [
  { key: "elecKwh", label: "Electricity", color: "var(--chart-1)" },
  { key: "gasKwh", label: "Gas", color: "var(--chart-3)" },
] as const;

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
const nice = (v: number) => {
  const step = 10 ** Math.floor(Math.log10(v || 1));
  return Math.ceil(v / step) * step;
};

/** Electricity vs gas readings by month, as the user gave them. Missing months are left empty. */
export function MonthlyChart({ monthly, source }: { monthly: TwinState["energy"]["monthly"]; source: TwinState["energy"]["source"] }) {
  const rows = monthly.filter((m) => m.elecKwh != null || m.gasKwh != null);
  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-3xl bg-surface p-4 text-sm text-muted-foreground ring-1 ring-hairline">
        {source === "modelled" ? "No meter readings yet, so there is no monthly chart. Add them when you edit your home." : "No monthly readings to show."}
      </div>
    );
  }
  const max = nice(Math.max(...rows.flatMap((m) => [m.elecKwh ?? 0, m.gasKwh ?? 0])));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = plotW / rows.length;
  const bar = Math.min(10, slot / 2.6);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const summary = rows.map((m) => `${monthName(m.month)}: electricity ${m.elecKwh ?? "no reading"}, gas ${m.gasKwh ?? "no reading"} kilowatt hours`).join(". ");

  return (
    <div className="mt-3 rounded-3xl bg-surface p-4 ring-1 ring-hairline">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Month by month</h2>
        <span className="flex gap-3 text-[11px] text-muted-foreground">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className="size-2 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly energy use in kWh. ${summary}`} className="mt-3 w-full">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--hairline)" strokeWidth={1} />
            <text x={PAD.l - 5} y={y(max * f) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={9}>
              {Math.round(max * f).toLocaleString("en-GB")}
            </text>
          </g>
        ))}
        {rows.map((m, i) => {
          const cx = PAD.l + slot * (i + 0.5);
          return (
            <g key={m.month}>
              {SERIES.map((s, j) => {
                const v = m[s.key];
                if (v == null) return null;
                return <rect key={s.key} x={cx + (j === 0 ? -bar - 0.5 : 0.5)} y={y(v)} width={bar} height={PAD.t + plotH - y(v)} rx={2} fill={s.color} />;
              })}
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                {monthName(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-muted-foreground">kWh per month, as you entered them.</p>
    </div>
  );
}
