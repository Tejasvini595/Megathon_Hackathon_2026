import { STOREY_H, houseLayout, systemAnchor, type HouseDetail, type Highlight, type Parts } from "@/components/twin/house";
import type { FieldKey, FieldValue, PropertyRecord } from "@/lib/extract/fields";
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
  { id: "shape", label: "Shape", building: "Raising the walls", focus: null, part: "body", fields: ["propertyType", "builtForm", "storeys", "flatLevel", "blockStoreys", "ageBand", "floorAreaM2", "bedrooms"] },
  { id: "walls", label: "Walls", building: "Reading the walls", focus: "walls", part: "body", fields: ["wallType", "wallInsulation"] },
  { id: "roof", label: "Roof", building: "Placing the roof", focus: "roof", part: "roof", fields: ["roofType", "loftInsulationMm"] },
  { id: "windows", label: "Windows", building: "Fitting the windows", focus: "windows", part: "windows", fields: ["glazing"] },
  { id: "heating", label: "Heating", building: "Finding the heating", focus: "system", part: "system", fields: ["heating", "secondaryHeating", "controls"] },
  { id: "power", label: "Power", building: "Checking for solar", focus: "roof_pv", part: "solar", fields: ["solarPv"] },
];

export function recordOf(fields: Record<FieldKey, { value: FieldValue }>) {
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

/** Where a step's hotspot sits on the model, spread out so markers don't overlap from the default view. */
export function stepAnchor(id: StepId, g: Geometry): [number, number, number] {
  const { baseY, bodyH, topY, roofRise, hasRoofAbove, blockTopY } = houseLayout(g);
  const roofY = hasRoofAbove ? topY : blockTopY;
  switch (id) {
    case "walls":
      return [g.width / 2 + 0.05, baseY + bodyH * 0.72, -g.depth * 0.2];
    case "roof":
      return [-g.width * 0.25, roofY + roofRise * 0.75 + 0.3, -g.depth * 0.1];
    case "windows":
      return [-g.width * 0.3, baseY + STOREY_H * 0.55, g.depth / 2 + 0.1];
    case "heating": {
      const [x, y, z] = systemAnchor(g);
      return [x, y + 0.9, z];
    }
    case "power":
      return [g.width * 0.25, roofY + roofRise * 0.3 + 0.3, g.depth * 0.3];
    default:
      return [0, baseY + 0.4, g.depth / 2 + 0.6];
  }
}
