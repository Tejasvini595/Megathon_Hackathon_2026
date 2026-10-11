"use client";

import { Minus, Plus } from "lucide-react";

const round = (v: number, step: number) => Math.round(v / step) * step;

export function Stepper({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Number(Math.min(max, Math.max(min, round(v, step))).toFixed(2)));
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => set(value - step)} className="grid size-10 place-items-center rounded-full bg-surface-2" aria-label="Decrease">
        <Minus className="size-4" />
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-2 accent-[var(--volt)]"
      />
      <button onClick={() => set(value + step)} className="grid size-10 place-items-center rounded-full bg-surface-2" aria-label="Increase">
        <Plus className="size-4" />
      </button>
      <span className="tabular w-16 text-right text-sm font-medium">
        {value}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
