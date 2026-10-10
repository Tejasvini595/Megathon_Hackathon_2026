"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import type { Element, Geometry } from "@/lib/twin/types";
import { HoloCanvas } from "./holo-canvas";

type OrientationEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

const clamp = (n: number) => Math.max(-1, Math.min(1, n));
const subscribeNone = () => () => {};
const needsOrientationPermission = () => typeof DeviceOrientationEvent !== "undefined" && typeof (DeviceOrientationEvent as OrientationEvent).requestPermission === "function";

/**
 * Frame, specular sheen and tilt input. Pointer or device tilt is written straight to CSS variables
 * (sheen) and a shared ref (3D parallax), so nothing re-renders per event.
 */
export function HoloCard({ geometry, heatLoss, children }: { geometry: Geometry; heatLoss: Record<Element, number>; children: React.ReactNode }) {
  const card = useRef<HTMLDivElement>(null);
  const tilt = useRef({ x: 0, y: 0 });
  const reduced = Boolean(useReducedMotion());
  const needsPermission = useSyncExternalStore(subscribeNone, needsOrientationPermission, () => false);
  const [granted, setGranted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const aim = useCallback((x: number, y: number) => {
    tilt.current.x = x;
    tilt.current.y = y;
    card.current?.style.setProperty("--sx", x.toFixed(3));
    card.current?.style.setProperty("--sy", y.toFixed(3));
  }, []);

  useEffect(() => {
    if (reduced) return;
    const onPointer = (e: PointerEvent) => aim(clamp((e.clientX / window.innerWidth) * 2 - 1), clamp((e.clientY / window.innerHeight) * 2 - 1));
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma != null && e.beta != null) aim(clamp(e.gamma / 30), clamp((e.beta - 45) / 30));
    };
    window.addEventListener("pointermove", onPointer);
    if (!needsPermission || granted) window.addEventListener("deviceorientation", onTilt);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, [reduced, needsPermission, granted, aim]);

  const enableTilt = async () => {
    setDismissed(true);
    try {
      setGranted((await (DeviceOrientationEvent as OrientationEvent).requestPermission?.()) === "granted");
    } catch {
      setGranted(false);
    }
  };

  return (
    <div
      ref={card}
      className="relative w-full max-w-[360px] rounded-[34px] p-[1.5px] shadow-[0_0_60px_-12px_var(--volt-dim),0_30px_60px_-30px_#000]"
      style={{ background: "linear-gradient(145deg, rgba(255,255,255,.6), rgba(255,255,255,.07) 28%, rgba(61,255,176,.3) 68%, rgba(255,255,255,.4))" }}
    >
      <div className="relative overflow-hidden rounded-[32.5px] bg-[#0b0d10] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
        <div className="h-[min(48dvh,420px)] min-h-[280px] bg-[radial-gradient(70%_55%_at_50%_58%,var(--volt-dim),transparent_75%)]">
          <HoloCanvas geometry={geometry} heatLoss={heatLoss} tilt={tilt} reduced={reduced} />
        </div>
        {children}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] mix-blend-screen">
        <div
          className="absolute -inset-[40%] transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{
            transform: "translate(calc(var(--sx, 0.25) * 18%), calc(var(--sy, -0.15) * 18%))",
            background: "linear-gradient(115deg, transparent 38%, rgba(120,255,220,.16) 44%, rgba(255,255,255,.26) 50%, rgba(190,140,255,.16) 56%, transparent 62%)",
          }}
        />
      </div>
      {needsPermission && !dismissed && (
        <button
          type="button"
          onClick={enableTilt}
          className="glass absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-xs font-medium"
        >
          Tap to bring it to life
        </button>
      )}
    </div>
  );
}
