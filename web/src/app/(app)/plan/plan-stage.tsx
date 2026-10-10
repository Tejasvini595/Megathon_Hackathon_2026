"use client";

import { useMemo } from "react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import { useTwinView } from "@/components/twin/twin-view";
import { Segmented } from "@/components/app/segmented";
import type { Element, Geometry } from "@/lib/twin/types";

type Props = {
  geometry: Geometry;
  heatLoss: Record<Element, number>;
  heatLossAfter: Record<Element, number>;
  addsSolar: boolean;
  addsHeatPump: boolean;
};

/** Today vs after-plan view. Heat shares after the plan come from the engine, scaled to today's maximum. */
export function PlanStage({ geometry, heatLoss, heatLossAfter, addsSolar, addsHeatPump }: Props) {
  const { mode, setMode, focus, setFocus, after, setAfter } = useTwinView();
  const shown = useMemo(
    () => ({ ...geometry, hasSolar: geometry.hasSolar || (after && addsSolar), hasHeatPump: geometry.hasHeatPump || (after && addsHeatPump) }),
    [geometry, after, addsSolar, addsHeatPump],
  );
  const heatRef = useMemo(() => Math.max(...Object.values(heatLoss)), [heatLoss]);

  return (
    <>
      <TwinCanvas
        geometry={shown}
        heatLoss={after ? heatLossAfter : heatLoss}
        heatRef={heatRef}
        mode={after || mode === "thermal" ? "thermal" : "normal"}
        focus={focus}
        className="absolute inset-0"
      />
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
    </>
  );
}
