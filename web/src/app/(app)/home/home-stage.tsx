"use client";

import { AnimatePresence, motion } from "motion/react";
import { Thermometer } from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import { useTwinView } from "@/components/twin/twin-view";
import { Segmented } from "@/components/app/segmented";
import { cn } from "@/lib/utils";
import type { Element, Geometry } from "@/lib/twin/types";

export function HomeStage({ geometry, heatLoss }: { geometry: Geometry; heatLoss: Record<Element, number> }) {
  const { mode, setMode, focus, setFocus, isSwitching } = useTwinView();
  return (
    <>
      {/* While another home loads, the current one just dims a little. */}
      <div className={cn("absolute inset-0 transition-opacity duration-300", isSwitching && "opacity-50")}>
        <TwinCanvas geometry={geometry} heatLoss={heatLoss} mode={mode} focus={focus} className="size-full" />
      </div>

      <div className="absolute inset-x-0 bottom-14 flex flex-col items-center gap-3">
        <AnimatePresence>
          {mode === "thermal" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              <span>Less heat lost</span>
              <span className="h-1 w-24 rounded-full bg-[linear-gradient(90deg,#2f8cff,#ffb020,#ff3b1f)]" />
              <span>More</span>
            </motion.div>
          )}
        </AnimatePresence>
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            if (m === "normal") setFocus(null);
          }}
          options={[
            { value: "normal", label: "Home" },
            { value: "thermal", label: <><Thermometer className="size-3.5" /> Thermal</> },
          ]}
        />
      </div>
    </>
  );
}
