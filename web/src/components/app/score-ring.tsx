"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** Colour for a 0-100 score, matching the brief's five classes. */
export function scoreTone(score: number) {
  if (score >= 80) return "var(--volt)";
  if (score >= 65) return "color-mix(in oklch, var(--volt) 70%, var(--amber))";
  if (score >= 50) return "var(--amber)";
  if (score >= 30) return "color-mix(in oklch, var(--amber) 35%, var(--ember))";
  return "var(--ember)";
}

export function ScoreRing({
  score,
  label,
  size = 132,
  stroke = 8,
  className,
}: {
  score: number;
  label?: string;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.75; // 270° gauge
  const value = useMotionValue(0);
  const shown = useTransform(value, (v) => Math.round(v).toString());
  const dash = useTransform(value, (v) => `${(v / 100) * c * arc} ${c}`);

  useEffect(() => {
    const controls = animate(value, score, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [score, value]);

  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[135deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * arc} ${c}`} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreTone(score)}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ strokeDasharray: dash, filter: `drop-shadow(0 0 3px ${scoreTone(score)})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <motion.div className="tabular text-5xl font-light tracking-tight">{shown}</motion.div>
          {label && <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>}
        </div>
      </div>
    </div>
  );
}
