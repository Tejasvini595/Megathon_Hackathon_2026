"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { durationMs: number; photoUrl?: string; hasText: boolean; hasPlan: boolean; hasPostcode: boolean };

/** Scanning view shown while the capture server function runs; steps tick at an even pace. */
export function Analysing({ durationMs, photoUrl, hasText, hasPlan, hasPostcode }: Props) {
  const steps = [
    hasText && { label: "Reading your description", model: "agent" },
    photoUrl && { label: "Looking at the façade", model: "omni" },
    hasPlan && { label: "Measuring the floor plan", model: "omni" },
    hasPostcode && { label: "Matching local EPC records", model: "data" },
    { label: "Classifying walls, roof & glazing", model: "jev" },
    { label: "Checking for conflicts", model: "jev" },
  ].filter(Boolean) as { label: string; model: string }[];
  const [done, setDone] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDone((d) => Math.min(d + 1, steps.length)), durationMs / steps.length);
    return () => clearInterval(t);
  }, [steps.length, durationMs]);

  return (
    <div className="flex flex-1 flex-col pt-8">
      <div className="relative mx-auto aspect-[4/5] w-full overflow-hidden rounded-[32px] bg-surface ring-1 ring-hairline">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={photoUrl} alt="" className="size-full object-cover opacity-70" />
        ) : (
          <div className="grid size-full place-items-center">
            <div className="size-48 animate-breathe rounded-full bg-[radial-gradient(circle,var(--volt-dim),transparent_70%)]" />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_60%,var(--background))]" />
        <div className="absolute inset-0 bg-[linear-gradient(var(--hairline)_1px,transparent_1px),linear-gradient(90deg,var(--hairline)_1px,transparent_1px)] bg-[size:28px_28px] opacity-60" />
        <div className="absolute inset-x-0 top-0 h-1/3 animate-scan bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklch,var(--volt)_35%,transparent),transparent)]" />
        <div className="absolute bottom-5 left-5 right-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-volt">Analysing</p>
          <p className="mt-1 text-2xl font-medium tracking-tight">Building your record…</p>
        </div>
      </div>
      <ul className="mt-6 space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex animate-in fade-in slide-in-from-left-2 items-center gap-3 text-sm fill-mode-both" style={{ animationDelay: `${i * 80}ms` }}>
            <span className={cn("grid size-6 place-items-center rounded-full ring-1", i < done ? "bg-volt text-black ring-volt" : "ring-hairline")}>
              {i < done ? <Check className="size-3.5" strokeWidth={3} /> : i === done ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
            </span>
            <span className={cn("flex-1", i <= done ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
            <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{s.model}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        Models only classify what they see into fixed categories. Scores and savings are calculated later from your confirmed details.
      </p>
    </div>
  );
}
