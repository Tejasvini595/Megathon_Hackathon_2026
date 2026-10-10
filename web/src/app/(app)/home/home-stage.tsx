"use client";

import { AnimatePresence, motion } from "motion/react";
import { Thermometer } from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import { useTwinView } from "@/components/twin/twin-view";
import { Segmented } from "@/components/app/segmented";
import type { Element, Geometry } from "@/lib/twin/types";

export function HomeStage({ geometry, heatLoss }: { geometry: Geometry; heatLoss: Record<Element, number> }) {
  const { mode, setMode, focus, setFocus, isSwitching } = useTwinView();
  return (
    <>
      <div className={cn("absolute inset-0 transition-opacity duration-500", isSwitching && "opacity-60")}>
        <TwinCanvas geometry={geometry} heatLoss={heatLoss} mode={mode} focus={focus} className="size-full" />
      </div>

      <AnimatePresence>
        {isSwitching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center"
          >
            {/* Concentric pulsing energy halo */}
            <div className="absolute size-72 rounded-full bg-[radial-gradient(circle,var(--volt-dim),transparent_70%)] animate-breathe" />
            <div className="absolute size-44 rounded-full border border-volt/20 animate-ping [animation-duration:2.5s]" />

            {/* Subtle floating status pill */}
            <div className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-foreground shadow-2xl backdrop-blur-xl border-volt/25">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-volt opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-volt" />
              </span>
              <span className="font-medium tracking-tight">Updating twin...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
