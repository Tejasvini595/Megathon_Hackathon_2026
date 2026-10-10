"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";
import { scoreTone } from "@/lib/score";

/** 270° gauge that counts up to the score on mount. */
export function ScoreRing({ score, label, size = 140, stroke = 8 }: { score: number; label: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.75;
  const value = useMotionValue(0);
  const shown = useTransform(value, (v) => Math.round(v).toString());
  const dash = useTransform(value, (v) => `${(v / 100) * c * arc} ${c}`);

  useEffect(() => {
    const controls = animate(value, score, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [score, value]);

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[135deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * arc} ${c}`} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreTone(score)} strokeWidth={stroke} strokeLinecap="round" style={{ strokeDasharray: dash }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <motion.div className="tabular text-5xl font-light tracking-tight">{shown}</motion.div>
          <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}
