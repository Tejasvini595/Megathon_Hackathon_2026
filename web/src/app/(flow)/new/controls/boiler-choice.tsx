"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { buzz } from "./haptics";

const CHOICES = [
  { value: "before_2005", label: "Before 2005", note: "Likely an older, non-condensing boiler" },
  { value: "from_2005", label: "2005 or later", note: "Condensing, so it recovers waste heat" },
] as const;

/** Two big choices; the rule of thumb is the hint, since few people know the fitting date exactly. */
export function BoilerChoice({ value, hint, onChange }: { value: string; hint?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div role="radiogroup" aria-label="Boiler fitted" className="grid grid-cols-2 gap-2">
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
              className={cn("flex flex-col items-start gap-1.5 rounded-2xl px-4 py-4 text-left ring-1 transition-colors", on ? "bg-volt/10 ring-volt" : "ring-hairline hover:bg-surface-2")}
            >
              <Flame className={cn("size-5", c.value === "from_2005" ? "text-volt" : "text-ember")} />
              <span className="text-base font-semibold">{c.label}</span>
              <span className="text-xs text-muted-foreground">{c.note}</span>
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
