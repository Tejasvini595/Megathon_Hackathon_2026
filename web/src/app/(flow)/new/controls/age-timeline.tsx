"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FIELDS } from "@/lib/extract/fields";
import { cn } from "@/lib/utils";
import { buzz } from "./haptics";

const BANDS = FIELDS.find((f) => f.key === "ageBand")!.options as { value: string; label: string }[];
const LAST = BANDS.length - 1;

/** Era labels sit under the band (or the middle of the bands) they stand for. */
const ERAS: { label: string; at: number }[] = [
  { label: "Victorian", at: 0 },
  { label: "Edwardian", at: 1 },
  { label: "Interwar", at: 2 },
  { label: "Post-war", at: 3 },
  { label: "’70s", at: 4.5 },
  { label: "’90s", at: 7.5 },
  { label: "Modern", at: 11 },
];

const pct = (i: number) => `${(i / LAST) * 100}%`;

/** A scrubber along the decades: drag or tap anywhere on the line, and it snaps to the 13 age bands. */
export function AgeTimeline({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const index = Math.max(0, BANDS.findIndex((b) => b.value === value));

  function pick(i: number) {
    const next = Math.min(LAST, Math.max(0, i));
    if (next === index) return;
    buzz();
    onChange(BANDS[next].value);
  }

  function fromPointer(e: React.PointerEvent) {
    const rect = track.current!.getBoundingClientRect();
    pick(Math.round(((e.clientX - rect.left) / rect.width) * LAST));
  }

  return (
    <div>
      <p className="text-center text-2xl font-semibold tabular-nums">{BANDS[index].label}</p>
      <div className="mx-3 mt-5">
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Year built"
          aria-valuemin={0}
          aria-valuemax={LAST}
          aria-valuenow={index}
          aria-valuetext={BANDS[index].label}
          data-no-swipe
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => e.buttons && fromPointer(e)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") pick(index + 1);
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") pick(index - 1);
            else return;
            e.preventDefault();
          }}
          className="relative h-10 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-volt"
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2" />
          <motion.div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-volt/60" initial={false} animate={{ width: pct(index) }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} />
          {BANDS.map((b, i) => (
            <span key={b.value} style={{ left: pct(i) }} className={cn("absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full", i <= index ? "bg-volt" : "bg-foreground/25")} />
          ))}
          <motion.span
            aria-hidden
            className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-[0_0_0_6px_var(--volt-dim)]"
            initial={false}
            animate={{ left: pct(index) }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 32 }}
          />
        </div>
        <div className="relative mt-1 h-5">
          {ERAS.map((era) => (
            <button
              key={era.label}
              type="button"
              tabIndex={-1}
              onClick={() => pick(Math.round(era.at))}
              style={{ left: `${(era.at / LAST) * 100}%` }}
              className={cn("absolute -translate-x-1/2 whitespace-nowrap text-[10px] transition-colors", Math.abs(era.at - index) < 1.1 ? "text-foreground" : "text-muted-foreground/70")}
            >
              {era.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
