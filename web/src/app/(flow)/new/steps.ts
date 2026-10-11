import { STOREY_H, houseLayout, systemAnchor, type HouseDetail, type Highlight, type Parts } from "@/components/twin/house";
import { FIELDS, type FieldKey, type FieldValue, type PropertyRecord } from "@/lib/extract/fields";
import type { Geometry } from "@/lib/twin/types";

export type StepId = "shape" | "walls" | "roof" | "windows" | "heating" | "power" | "usage" | "rating";

export type Step = {
  id: StepId;
  label: string;
  /** Heading in the review, when it says more than the tab. */
  title?: string;
  /** Shown while the analysis builds this part. */
  building: string;
  focus: Highlight;
  /** The part of the house this step builds; steps without one (usage, rating) are only in the review. */
  part?: keyof Parts;
  fields: FieldKey[];
};

/** One step per part of the house: the review walks through them and the analysis builds them in this order. */
export const STEPS: Step[] = [
  { id: "shape", label: "Shape", building: "Raising the walls", focus: null, part: "body", fields: ["propertyType", "builtForm", "storeys", "flatLevel", "blockStoreys", "ageBand", "floorAreaM2", "rooms"] },
  { id: "walls", label: "Walls", title: "Walls and floor", building: "Reading the walls", focus: "walls", part: "body", fields: ["wallType", "wallInsulation", "floorType", "floorInsulation"] },
  { id: "roof", label: "Roof", building: "Placing the roof", focus: "roof", part: "roof", fields: ["roofType", "loftInsulation", "flatRoofInsulation"] },
  { id: "windows", label: "Windows", building: "Fitting the windows", focus: "windows", part: "windows", fields: ["glazing"] },
  { id: "heating", label: "Heating", building: "Finding the heating", focus: "system", part: "system", fields: ["heating", "boilerAge", "controls"] },
  { id: "power", label: "Power", building: "Checking for solar", focus: "roof_pv", part: "solar", fields: ["solarPv", "solarKw"] },
  { id: "usage", label: "Usage", title: "Your energy use", building: "", focus: null, fields: [] },
  { id: "rating", label: "Rating", title: "Rating and extras", building: "", focus: null, fields: ["epcBand", "sapScore", "thermostatC", "currentValueGbp"] },
];

/** The steps that build a part of the house, in the order the analysis shows them. */
export const BUILD_STEPS = STEPS.filter((s) => s.part);

/** Optional fields the user hasn't given are missing from the fields and null in the record. */
export function recordOf(fields: Partial<Record<FieldKey, { value: FieldValue }>>) {
  return Object.fromEntries(FIELDS.map(({ key }) => [key, fields[key]?.value ?? null])) as unknown as PropertyRecord;
}

export function detailOf(r: PropertyRecord): HouseDetail {
  return {
    wallType: String(r.wallType),
    wallInsulation: String(r.wallInsulation),
    loftInsulation: String(r.loftInsulation),
    floorType: String(r.floorType),
    floorInsulation: String(r.floorInsulation),
    glazing: String(r.glazing),
    heating: String(r.heating),
    boilerAge: String(r.boilerAge),
  };
}

/** Parts built once the first `count` steps are done. */
export function partsUpTo(count: number): Parts {
  const parts: Parts = { body: false, roof: false, windows: false, system: false, solar: false };
  for (const s of BUILD_STEPS.slice(0, count)) parts[s.part!] = true;
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
