"use client";

import { useMemo } from "react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import { useTwinView } from "@/components/twin/twin-view";
import { Segmented } from "@/components/app/segmented";
import { thermalGlow, type ElementScores, type Geometry, type RetrofitId } from "@/lib/twin/types";
import { usePlanVariant, type Variant } from "./plan-variant";

type After = { retrofits: RetrofitId[]; elementScoresAfter: ElementScores };
type Props = {
  geometry: Geometry;
  elementScores: ElementScores;
  packages: Record<Variant, After | null>;
};

/** Today vs after-plan view. The glow and which systems appear come from the engine's package for the chosen variant. */
export function PlanStage({ geometry, elementScores, packages }: Props) {
  const { mode, setMode, focus, setFocus, after, setAfter } = useTwinView();
  const { variant } = usePlanVariant();
  const pkg = packages[variant] ?? packages.full;
  const shown = useMemo(
    () => ({
      ...geometry,
      hasSolar: geometry.hasSolar || (after && !!pkg?.retrofits.includes("solar_pv")),
      hasHeatPump: geometry.hasHeatPump || (after && !!pkg?.retrofits.includes("heat_pump")),
    }),
    [geometry, after, pkg],
  );
  const glow = useMemo(() => thermalGlow(after && pkg ? pkg.elementScoresAfter : elementScores), [after, pkg, elementScores]);

  return (
    <>
      <TwinCanvas geometry={shown} heatLoss={glow} heatRef={1} mode={after || mode === "thermal" ? "thermal" : "normal"} focus={focus} className="absolute inset-0" />
      {pkg && (
        <div className="absolute inset-x-0 bottom-12 flex justify-center">
          <Segmented
            value={after ? "after" : "now"}
            onChange={(v) => {
              setAfter(v === "after");
              setMode("normal");
              setFocus(null);
            }}
            options={[
              { value: "now", label: "Today" },
              { value: "after", label: "After plan" },
            ]}
          />
        </div>
      )}
    </>
  );
}
