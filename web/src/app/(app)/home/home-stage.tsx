"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Sun, Thermometer } from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import { useTwinView } from "@/components/twin/twin-view";
import { Segmented } from "@/components/app/segmented";
import { cn } from "@/lib/utils";
import { dayOfYear, groundDirection, SEASONS, sunDirection, sunPosition } from "@/lib/twin/sun";
import type { SunView } from "@/components/twin/sun-layer";
import { thermalGlow, type ElementScores, type Geometry } from "@/lib/twin/types";
import { NeedsInfoMarkers, type NeedsInfoMarker } from "./needs-info-markers";

export type PartInfo = Record<keyof ElementScores, { label: string; saving: string | null }>;
const PARTS: (keyof ElementScores)[] = ["walls", "roof", "windows", "floor"];

// Without a picked map outline we assume the front faces south (+x points east).
const DEFAULT_X_BEARING = 90;
type Season = (typeof SEASONS)[number]["id"] | "today";

function useSunView(on: boolean, lat: number, xBearing: number, season: Season, hour: number): SunView | undefined {
  return useMemo(() => {
    if (!on) return undefined;
    const day = season === "today" ? dayOfYear(new Date()) : SEASONS.find((s) => s.id === season)!.day;
    const path: [number, number, number][] = [];
    for (let h = 3; h <= 21; h += 0.25) {
      const p = sunPosition(lat, day, h);
      if (p.elevationDeg > -2) path.push(sunDirection(p, xBearing));
    }
    return { dir: sunDirection(sunPosition(lat, day, hour), xBearing), path, north: groundDirection(0, xBearing) };
  }, [on, lat, xBearing, season, hour]);
}

const clock = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/**
 * `lat` comes from the home's postcode (UK average when unknown). The sun view is visual only: it
 * lights the twin from the sun's real position and draws its shadow; no figure is derived from it.
 */
export function HomeStage({
  geometry,
  elementScores,
  parts,
  needs,
  editHref,
  lat,
}: {
  geometry: Geometry;
  elementScores: ElementScores;
  parts: PartInfo;
  needs: NeedsInfoMarker[];
  editHref: string;
  lat: number | null;
}) {
  const router = useRouter();
  const glow = useMemo(() => thermalGlow(elementScores), [elementScores]);
  const { mode, setMode, focus, setFocus, isSwitching } = useTwinView();
  const [sunOn, setSunOn] = useState(false);
  const [season, setSeason] = useState<Season>("today");
  const [hour, setHour] = useState(15);
  const sun = useSunView(sunOn, lat ?? 53, geometry.xBearingDeg ?? DEFAULT_X_BEARING, season, hour);
  const part = focus && focus in parts ? parts[focus as keyof ElementScores] : null;
  const score = part ? elementScores[focus as keyof ElementScores] : null;
  const approximate = lat === null || geometry.xBearingDeg === undefined;
  return (
    <>
      {/* While another home loads, the current one just dims a little. */}
      <div className={cn("absolute inset-0 transition-opacity duration-300", isSwitching && "opacity-50")}>
        <TwinCanvas geometry={geometry} heatLoss={glow} heatRef={1} mode={mode} focus={focus} sun={sun} className="size-full">
          {!sunOn && <NeedsInfoMarkers items={needs} geometry={geometry} onSelect={() => router.push(editHref)} />}
        </TwinCanvas>
      </div>

      <div className="absolute inset-x-0 bottom-14 flex flex-col items-center gap-3">
        <AnimatePresence>
          {sunOn && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="w-72 space-y-2 text-center">
              <div className="flex justify-center gap-1">
                {[...SEASONS, { id: "today" as const, label: "Today" }].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSeason(s.id)}
                    className={cn("rounded-full px-2.5 py-1 text-[11px] transition-colors", season === s.id ? "bg-foreground text-background" : "text-muted-foreground")}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-3 text-xs">
                <span className="tabular w-10 text-muted-foreground">{clock(hour)}</span>
                <input
                  type="range"
                  min={4}
                  max={21}
                  step={0.25}
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  aria-label="Time of day"
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-2 accent-[var(--amber)]"
                />
              </label>
              {approximate && <p className="text-[10px] text-muted-foreground">Approximate: pick your building on the map when adding a home to align it.</p>}
            </motion.div>
          )}
          {mode === "thermal" && (
            <motion.div key="thermal" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="flex w-full max-w-sm flex-col items-center gap-2 px-5">
              {part && (
                <div className="glass w-full rounded-2xl px-3.5 py-2 text-center text-xs">
                  <p className="tabular font-medium">
                    {part.label} · {score == null ? "not applicable" : `${score}/100`}
                  </p>
                  {part.saving && <p className="mt-0.5 text-muted-foreground">{part.saving}</p>}
                </div>
              )}
              <div className="flex gap-1">
                {PARTS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setFocus(focus === k ? null : k)}
                    aria-pressed={focus === k}
                    className={cn("rounded-full px-2.5 py-1 text-[11px] transition-colors", focus === k ? "bg-foreground text-background" : "bg-surface/80 text-muted-foreground")}
                  >
                    {parts[k].label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <span>Better insulated</span>
                <span className="h-1 w-24 rounded-full bg-[linear-gradient(90deg,#2f8cff,#ffb020,#ff3b1f)]" />
                <span>Worse</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Segmented
          value={sunOn ? "sun" : mode}
          onChange={(m) => {
            setSunOn(m === "sun");
            setMode(m === "thermal" ? "thermal" : "normal");
            if (m !== "thermal") setFocus(null);
          }}
          options={[
            { value: "normal", label: "Home" },
            { value: "thermal", label: <><Thermometer className="size-3.5" /> Thermal</> },
            { value: "sun", label: <><Sun className="size-3.5" /> Sun</> },
          ]}
        />
      </div>
    </>
  );
}
