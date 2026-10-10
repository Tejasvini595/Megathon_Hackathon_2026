"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import { motion } from "motion/react";
import { Loader2, MapPin, X } from "lucide-react";
import { useWebGLSupported } from "@/components/twin/twin-canvas";
import { lookupStreet } from "@/lib/geo/actions";
import type { StreetResult } from "@/lib/geo/street";

const StreetScene = dynamic(() => import("./street-scene"), { ssr: false });

export type PickedHome = { osmId: number; address: string };

const BUILT_FORM: Record<string, string> = { detached: "Detached", semi: "Semi-detached", end_terrace: "End terrace", mid_terrace: "Mid terrace", flat: "Block of flats" };

/** Full-screen street model around a postcode; the user taps their own building. */
export function StreetPicker({ postcode, onPick, onClose }: { postcode: string; onPick: (h: PickedHome) => void; onClose: () => void }) {
  const webgl = useWebGLSupported();
  const [street, setStreet] = useState<StreetResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    startLoading(async () => setStreet(await lookupStreet(postcode)));
  }, [postcode]);

  const building = street?.ok ? street.buildings.find((b) => b.osmId === selected) : undefined;
  const form = building?.suggestions.builtForm;

  function select(id: number) {
    navigator.vibrate?.(8);
    setSelected(id);
    const b = street?.ok ? street.buildings.find((x) => x.osmId === id) : undefined;
    setAddress(b?.label ?? "");
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 mx-auto flex max-w-md flex-col bg-background">
      <header className="flex items-center gap-3 px-5 pb-3 pt-safe">
        <button onClick={onClose} aria-label="Close map" className="grid size-10 place-items-center rounded-full bg-surface ring-1 ring-hairline">
          <X className="size-4" />
        </button>
        <div>
          <h2 className="text-lg font-semibold leading-tight">Tap your home</h2>
          <p className="text-xs text-muted-foreground">{street?.ok ? [street.postcode, street.district].filter(Boolean).join(" · ") : postcode}</p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {loading || !street ? (
          <div className="grid size-full place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Loading your street…
            </span>
          </div>
        ) : !street.ok || !webgl ? (
          <div className="grid size-full place-items-center px-10 text-center text-sm text-muted-foreground">
            {street.ok ? "The 3D street view needs WebGL, which this browser can't start. We'll use your postcode on its own." : street.error}
          </div>
        ) : (
          <>
            <StreetScene buildings={street.buildings} selected={selected} onSelect={select} />
            <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-muted-foreground/70">{street.attribution}</p>
          </>
        )}
      </div>

      <div className="space-y-3 px-5 pb-safe pt-4">
        {building ? (
          <>
            <p className="text-sm">
              <span className="font-medium">{form ? BUILT_FORM[form.value] : "Building"}</span>
              <span className="tabular text-muted-foreground">
                {" "}
                · {building.measure.widthM} × {building.measure.depthM} m footprint
              </span>
            </p>
            {form && <p className="-mt-2 text-xs text-muted-foreground">{form.evidence}</p>}
            <label className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-hairline">
              <MapPin className="size-4 text-muted-foreground" />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House number and street (optional)"
                maxLength={200}
                autoComplete="street-address"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              onClick={() => onPick({ osmId: building.osmId, address: address.trim() })}
              className="h-14 w-full rounded-2xl bg-volt text-base font-semibold text-black transition-transform active:scale-[0.98]"
            >
              This is my home
            </button>
          </>
        ) : (
          <p className="pb-2 text-center text-sm text-muted-foreground">
            {street?.ok ? "Drag to look around, pinch to zoom. Your postcode is the green ring." : ""}
          </p>
        )}
        <button onClick={onClose} className="w-full pb-2 text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          Skip, just use the postcode
        </button>
      </div>
    </motion.div>
  );
}
