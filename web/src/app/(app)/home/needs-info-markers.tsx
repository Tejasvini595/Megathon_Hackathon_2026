"use client";

import { Html } from "@react-three/drei";
import { HelpCircle } from "lucide-react";
import { houseLayout, systemAnchor } from "@/components/twin/house";
import type { Geometry, RetrofitId } from "@/lib/twin/types";

export type NeedsInfoMarker = { id: RetrofitId; question: string };

function anchorFor(id: RetrofitId, g: Geometry): [number, number, number] {
  const { baseY, bodyH, topY, roofRise } = houseLayout(g);
  switch (id) {
    case "loft_insulation":
      return [0, topY + roofRise * 0.5, 0];
    case "cavity_wall_insulation":
    case "solid_wall_insulation":
      return [g.width / 2 + 0.1, baseY + bodyH / 2, g.depth / 2];
    case "floor_insulation":
      return [g.width / 2 + 0.1, baseY + 0.2, g.depth / 2 + 0.1];
    case "double_glazing":
      return [0, baseY + bodyH / 2, g.depth / 2 + 0.2];
    case "solar_pv":
      return [0, topY + roofRise + 0.4, 0];
    default:
      return systemAnchor(g);
  }
}

/** Amber markers (same look as the review flow) where a saving can't be estimated until the user confirms a detail. */
export function NeedsInfoMarkers({ items, geometry, onSelect }: { items: NeedsInfoMarker[]; geometry: Geometry; onSelect: () => void }) {
  return items.map((n) => (
    <Html key={n.id} position={anchorFor(n.id, geometry)} center zIndexRange={[10, 0]}>
      <button
        onClick={onSelect}
        aria-label="Confirm a detail to unlock a saving"
        className="grid size-7 place-items-center rounded-full bg-amber text-black shadow-lg ring-4 ring-amber/25 animate-in zoom-in-50"
      >
        <HelpCircle className="size-3.5" />
      </button>
    </Html>
  ));
}
