"use client";

import { useState } from "react";
import { kwToPanels, panelsToKw, SOLAR_KW_PER_PANEL } from "@/lib/extract/solar";
import { cn } from "@/lib/utils";
import { Stepper } from "./stepper";

type Props = { value: number; min: number; max: number; onChange: (kw: number) => void };

/** The system size in kW, or a count of panels turned into kW at 0.4 kW each. */
export function SolarInput({ value, min, max, onChange }: Props) {
  const [byPanels, setByPanels] = useState(false);
  const panels = kwToPanels(value);
  return (
    <div className="space-y-3">
      {byPanels ? (
        <>
          <Stepper value={panels} min={Math.ceil(min / SOLAR_KW_PER_PANEL)} max={Math.floor(max / SOLAR_KW_PER_PANEL)} unit={panels === 1 ? "panel" : "panels"} onChange={(n) => onChange(panelsToKw(n))} />
          <p className="text-sm text-volt">≈ {panelsToKw(panels).toFixed(1)} kW</p>
        </>
      ) : (
        <Stepper value={value} min={min} max={max} step={0.1} unit="kW" onChange={onChange} />
      )}
      <button
        role="switch"
        aria-checked={byPanels}
        onClick={() => setByPanels((v) => !v)}
        className={cn("rounded-full px-3 py-1.5 text-sm ring-1 transition-colors", byPanels ? "bg-foreground text-background ring-foreground" : "ring-hairline hover:bg-surface-2")}
      >
        Count panels instead
      </button>
      {byPanels && <p className="text-xs text-muted-foreground">We count each panel as {SOLAR_KW_PER_PANEL} kW, typical for a modern panel.</p>}
    </div>
  );
}
