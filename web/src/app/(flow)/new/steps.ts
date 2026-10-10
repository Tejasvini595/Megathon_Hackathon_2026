import { PLINTH_H, STOREY_H, systemAnchor, type HouseDetail, type Highlight, type Parts } from "@/components/twin/house";
import type { FieldKey, PropertyRecord } from "@/lib/extract/fields";
import type { Geometry } from "@/lib/twin/types";

export type StepId = "shape" | "walls" | "roof" | "windows" | "heating" | "power";

export type Step = {
  id: StepId;
  label: string;
  /** Shown while the analysis builds this part. */
  building: string;
  focus: Highlight;
  part: keyof Parts;
  fields: FieldKey[];
};

/** One step per part of the house: the review walks through them and the analysis builds them in this order. */
export const STEPS: Step[] = [
  { id: "shape", label: "Shape", building: "Raising the walls", focus: null, part: "body", fields: ["propertyType", "builtForm", "storeys", "ageBand", "floorAreaM2", "bedrooms"] },
  { id: "walls", label: "Walls", building: "Reading the walls", focus: "walls", part: "body", fields: ["wallType", "wallInsulation"] },
  { id: "roof", label: "Roof", building: "Placing the roof", focus: "roof", part: "roof", fields: ["roofType", "loftInsulationMm"] },
  { id: "windows", label: "Windows", building: "Fitting the windows", focus: "windows", part: "windows", fields: ["glazing"] },
  { id: "heating", label: "Heating", building: "Finding the heating", focus: "system", part: "system", fields: ["heating", "controls"] },
  { id: "power", label: "Power", building: "Checking for solar", focus: "roof_pv", part: "solar", fields: ["solarPv"] },
];

export function recordOf(fields: Record<FieldKey, { value: string | number }>) {
  return Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.value])) as PropertyRecord;
}

export function detailOf(r: PropertyRecord): HouseDetail {
  return { wallType: String(r.wallType), wallInsulation: String(r.wallInsulation), loftInsulationMm: Number(r.loftInsulationMm), glazing: String(r.glazing), heating: String(r.heating) };
}

/** Parts built once the first `count` steps are done. */
export function partsUpTo(count: number): Parts {
  const parts: Parts = { body: false, roof: false, windows: false, system: false, solar: false };
  for (const s of STEPS.slice(0, count)) parts[s.part] = true;
  return parts;
}

/** Where a step's hotspot sits on the model. */
export function stepAnchor(id: StepId, g: Geometry): [number, number, number] {
  const baseY = g.builtForm === "flat" ? (g.isTopFloor ? 2 * STOREY_H + PLINTH_H : STOREY_H + PLINTH_H) : PLINTH_H;
  const topY = baseY + (g.builtForm === "flat" ? 1 : g.storeys) * STOREY_H;
  switch (id) {
    case "walls":
      return [g.width / 2 + 0.1, baseY + STOREY_H * 0.5, g.depth * 0.25];
    case "roof":
      return [-g.width * 0.3, topY + 1.4, -g.depth * 0.1];
    case "windows":
      return [-g.width / 4, baseY + STOREY_H * 0.55, g.depth / 2 + 0.1];
    case "heating": {
      const [x, y, z] = systemAnchor(g);
      return [x, y + 0.8, z];
    }
    case "power":
      return [g.width * 0.3, topY + 0.7, g.depth * 0.3];
    default:
      return [0, baseY + 0.4, g.depth / 2 + 0.6];
  }
}
