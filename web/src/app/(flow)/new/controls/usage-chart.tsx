"use client";

import { motion, useReducedMotion } from "motion/react";

export type ChartGroup = { label: string; elec: number | null; gas: number | null; winter?: boolean };

const W = 320;
const H = 132;
const BASE = 112;
const TOP = 10;

/** Electricity and gas side by side per month; the winter months sit on a lighter band so the peak reads. */
export function UsageChart({ groups }: { groups: ChartGroup[] }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...groups.flatMap((g) => [g.elec ?? 0, g.gas ?? 0]));
  const slot = W / groups.length;
  const bar = Math.min(14, slot * 0.36);
  const height = (v: number | null) => (v ? Math.max(2, (v / max) * (BASE - TOP)) : 0);
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 220, damping: 26 };
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Energy use by month, peak ${Math.round(max)} kWh`} className="w-full">
        {groups.map((g, i) => g.winter && <rect key={`w${i}`} x={i * slot} y={0} width={slot} height={BASE} className="fill-foreground/[0.05]" />)}
        <line x1="0" x2={W} y1={BASE} y2={BASE} className="stroke-foreground/15" />
        {groups.map((g, i) => {
          const cx = i * slot + slot / 2;
          return (
            <g key={i}>
              {([["elec", "var(--frost)", -bar - 0.5], ["gas", "var(--amber)", 0.5]] as const).map(([fuel, colour, dx]) => {
                const h = height(g[fuel]);
                return h ? (
                  <motion.rect key={fuel} x={cx + dx} width={bar} rx="2" fill={colour} initial={{ y: BASE, height: 0 }} animate={{ y: BASE - h, height: h }} transition={spring} />
                ) : (
                  <circle key={fuel} cx={cx + dx + bar / 2} cy={BASE - 1.5} r="1.5" className="fill-foreground/20" />
                );
              })}
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-frost" />Electricity</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-amber" />Gas</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-foreground/10" />Winter</span>
      </figcaption>
    </figure>
  );
}
