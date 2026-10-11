"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import type { ViewMode } from "@/components/twin/house";
import { MOCK_TWIN } from "@/lib/twin/mock";
import { thermalGlow } from "@/lib/twin/types";

const LINES: Record<ViewMode, { eyebrow: string; title: string; color: string }> = {
  normal: { eyebrow: "Your home", title: "A living model of your home.", color: "var(--volt)" },
  thermal: { eyebrow: "Thermal vision", title: "See exactly where the heat goes.", color: "var(--ember)" },
};

// Stable references so the camera isn't re-fitted every time the view cycles.
const GLOW = thermalGlow(MOCK_TWIN.elementScores);
const GEOMETRY = { normal: { ...MOCK_TWIN.geometry, hasSolar: true }, thermal: { ...MOCK_TWIN.geometry, hasSolar: false } };

/** The auto-rotating hero house and the headline that changes with it. */
export function LandingStage() {
  const [mode, setMode] = useState<ViewMode>("normal");
  useEffect(() => {
    const t = setInterval(() => setMode((m) => (m === "normal" ? "thermal" : "normal")), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <TwinCanvas geometry={GEOMETRY[mode]} heatLoss={GLOW} heatRef={1} mode={mode} interactive={false} autoRotate className="absolute inset-x-0 top-0 h-[66%]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--background)_0%,transparent_22%,transparent_50%,var(--background)_88%)]" />
      <div className="absolute inset-x-0 bottom-[calc(13rem+env(safe-area-inset-bottom))] mx-auto max-w-md px-6 md:max-w-2xl">
        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: LINES[mode].color }}>
              {LINES[mode].eyebrow}
            </p>
            <h1 className="text-gradient mt-2 text-[2.75rem] font-semibold leading-[1.02] tracking-tight md:text-6xl">{LINES[mode].title}</h1>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
