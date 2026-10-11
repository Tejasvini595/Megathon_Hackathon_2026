"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { buzz } from "./haptics";

const SIZE = 200;
const C = SIZE / 2;
const R = 78;
/** The arc runs 270° clockwise from the bottom left, leaving the gap at the bottom. */
const START = 135;
const SWEEP = 270;

const at = (deg: number): [number, number] => [C + R * Math.cos((deg * Math.PI) / 180), C + R * Math.sin((deg * Math.PI) / 180)];
const ARC = `M ${at(START).join(" ")} A ${R} ${R} 0 1 1 ${at(START + SWEEP).join(" ")}`;

type Props = { value: number | null; min: number; max: number; step: number; onChange: (v: number | null) => void };

/** A round thermostat: drag the ring (or use the arrow keys) to set the usual temperature; clearable. */
export function ThermostatDial({ value, min, max, step, onChange }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const frac = value == null ? 0 : (value - min) / (max - min);

  function setFrom(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    const deg = (Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) * 180) / Math.PI;
    let rel = (deg - START + 360) % 360;
    // The gap at the bottom snaps to whichever end is nearer.
    if (rel > SWEEP) rel = rel > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    const next = Math.round((min + (rel / SWEEP) * (max - min)) / step) * step;
    if (next !== value) {
      buzz();
      onChange(next);
    }
  }

  const nudge = (d: number) => onChange(Math.min(max, Math.max(min, (value ?? 19) + d)));

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={ref}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="slider"
        tabIndex={0}
        aria-label="Usual heating temperature"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value == null ? "Not set" : `${value} degrees`}
        data-no-swipe
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFrom(e);
        }}
        onPointerMove={(e) => e.buttons && setFrom(e)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") nudge(step);
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") nudge(-step);
          else return;
          e.preventDefault();
        }}
        className="size-52 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-volt rounded-full"
      >
        <defs>
          <linearGradient id="dial-heat" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--frost)" />
            <stop offset="0.5" stopColor="var(--amber)" />
            <stop offset="1" stopColor="var(--ember)" />
          </linearGradient>
        </defs>
        <path d={ARC} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-surface-2" />
        <motion.path d={ARC} fill="none" stroke="url(#dial-heat)" strokeWidth="14" strokeLinecap="round" initial={false} animate={{ pathLength: frac, opacity: value == null ? 0 : 1 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }} />
        {value != null && <circle cx={at(START + frac * SWEEP)[0]} cy={at(START + frac * SWEEP)[1]} r="11" className="fill-foreground" stroke="var(--volt-dim)" strokeWidth="6" />}
        <text x={C} y={C + 8} textAnchor="middle" className="fill-foreground text-[40px] font-semibold tabular-nums">
          {value == null ? "–" : value}
        </text>
        <text x={C} y={C + 30} textAnchor="middle" className="fill-muted-foreground text-[12px]">
          {value == null ? "Tap or drag to set" : "°C"}
        </text>
      </svg>
      {value != null && (
        <button onClick={() => onChange(null)} className="rounded-full px-3 py-1 text-xs text-muted-foreground ring-1 ring-hairline">
          Clear
        </button>
      )}
    </div>
  );
}
