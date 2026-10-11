"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { buzz } from "./haptics";

/** Layer height (of 30) for each category, and how it looks from the hatch. */
const CHOICES = [
  { value: "none", label: "None", caption: "Bare joists, nothing between", layer: 0 },
  { value: "thin", label: "Thin, under 100 mm", caption: "Joists stick out well above it", layer: 8 },
  { value: "some", label: "Some, 100–199 mm", caption: "About level with the joists", layer: 17 },
  { value: "thick", label: "Thick, 200 mm or more", caption: "Can’t see the joists", layer: 28 },
] as const;

const JOISTS = [10, 34, 58, 82, 106];

/** Picture choices: a slice of loft floor, with the insulation rising between (and over) the joists. */
export function LoftPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const reduce = useReducedMotion();
  return (
    <div role="radiogroup" aria-label="Loft insulation" className="grid grid-cols-2 gap-2">
      {CHOICES.map((c) => {
        const on = value === c.value;
        return (
          <button
            key={c.value}
            role="radio"
            aria-checked={on}
            aria-label={c.label}
            onClick={() => {
              buzz();
              onChange(c.value);
            }}
            className={cn("rounded-2xl p-2 text-left ring-1 transition-colors", on ? "bg-volt/10 ring-volt" : "ring-hairline hover:bg-surface-2")}
          >
            <svg viewBox="0 0 120 56" className="w-full rounded-lg bg-surface" aria-hidden>
              <rect x="0" y="46" width="120" height="10" className="fill-foreground/15" />
              {JOISTS.map((x) => (
                <rect key={x} x={x} y="20" width="6" height="26" rx="1" fill="#a67c52" />
              ))}
              <motion.rect
                x="0"
                width="120"
                fill="#f2c94c"
                fillOpacity="0.85"
                initial={false}
                animate={{ y: 46 - c.layer, height: c.layer }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 24 }}
              />
              {c.layer >= 17 && JOISTS.map((x) => <circle key={x} cx={x + 3} cy={46 - c.layer + 2} r="2.4" fill="#f2c94c" />)}
            </svg>
            <span className="mt-1.5 block text-sm font-medium">{c.label}</span>
            <span className="block text-xs text-muted-foreground">{c.caption}</span>
          </button>
        );
      })}
    </div>
  );
}
