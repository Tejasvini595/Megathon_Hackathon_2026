"use client";

import { useState, useTransition } from "react";
import { MotionConfig, motion } from "motion/react";
import { Segmented } from "@/components/app/segmented";
import { formatGbp } from "@/lib/score";
import { cn } from "@/lib/utils";
import { saveProfile } from "./actions";

type Props = { homeId: string; renting: boolean; listed: boolean; budget: number | null; priority: "carbon" | "cost" | null };

const DEFAULT_BUDGET = 8000;

export function AboutYou({ homeId, renting, listed, budget, priority }: Props) {
  const [pending, start] = useTransition();
  const [level, setLevel] = useState(budget ?? DEFAULT_BUDGET);
  const save = (p: Parameters<typeof saveProfile>[1]) => start(() => saveProfile(homeId, p));

  return (
    <MotionConfig reducedMotion="user">
      <section aria-busy={pending} className={cn("mt-6 rounded-3xl bg-surface p-4 ring-1 ring-hairline transition-opacity", pending && "opacity-70")}>
        <h2 className="text-sm font-medium">About you</h2>
        <p className="text-xs text-muted-foreground">Tell us what applies and the route below changes.</p>
        <div className="mt-3 space-y-2">
          <Switch label="I rent this home" on={renting} onChange={(v) => save({ renting: v })} />
          <Switch label="Listed building or conservation area" on={listed} onChange={(v) => save({ listed: v })} />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="budget" className="text-muted-foreground">
              Budget
            </label>
            <span className="tabular">{budget == null ? "No limit" : `up to ${formatGbp(level)}`}</span>
          </div>
          <input
            id="budget"
            type="range"
            min={1000}
            max={30000}
            step={500}
            value={level}
            disabled={budget == null}
            onChange={(e) => setLevel(Number(e.target.value))}
            onPointerUp={() => save({ budget_gbp: level })}
            onKeyUp={() => save({ budget_gbp: level })}
            className="mt-2 h-1.5 w-full cursor-pointer accent-volt disabled:cursor-default disabled:opacity-40"
          />
          <button type="button" onClick={() => save({ budget_gbp: budget == null ? level : null })} className="mt-2 text-[11px] text-volt">
            {budget == null ? "Set a budget" : "Remove the limit"}
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">What matters most</p>
          <Segmented
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            value={priority ?? "none"}
            onChange={(v) => save({ priority: v === "none" ? null : v })}
            options={[
              { value: "none", label: "Either" },
              { value: "carbon", label: "Carbon" },
              { value: "cost", label: "Cost" },
            ]}
          />
        </div>
      </section>
    </MotionConfig>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface-2/60 px-3.5 py-2.5 text-left text-sm">
      {label}
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-volt" : "bg-surface-2 ring-1 ring-hairline")}>
        <motion.span className="absolute top-0.5 size-4 rounded-full bg-white" initial={false} animate={{ left: on ? 18 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 34 }} />
      </span>
    </button>
  );
}
