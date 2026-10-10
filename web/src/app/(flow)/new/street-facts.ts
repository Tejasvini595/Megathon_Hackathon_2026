import type { StreetBuilding } from "@/lib/geo/street";

export const BUILT_FORM = { detached: "Detached", semi: "Semi-detached", end_terrace: "End terrace", mid_terrace: "Mid terrace", flat: "Block of flats" } as const;

const BUILDING_TYPE: Record<string, string> = {
  house: "House",
  detached: "Detached house",
  semidetached_house: "Semi-detached house",
  terrace: "Terraced house",
  bungalow: "Bungalow",
  apartments: "Apartments",
  flats: "Apartments",
  residential: "Residential building",
  dormitory: "Dormitory",
  yes: "Building",
};

const ROOF_SHAPE: Record<string, string> = { gabled: "Gabled (pitched)", hipped: "Hipped (pitched)", flat: "Flat" };
const PITCHED = new Set(["gabled", "hipped"]);
const AXES = ["N–S", "NE–SW", "E–W", "NW–SE"];

export const buildingType = (b: StreetBuilding) => BUILDING_TYPE[b.tags.building ?? "yes"] ?? "Building";
export const roofLabel = (b: StreetBuilding) => (b.tags.roofShape ? (ROOF_SHAPE[b.tags.roofShape] ?? b.tags.roofShape) : undefined);

/** Compass axis of the building's long side (bearing is 0 to 180). */
export function runsAxis(bearingDeg: number) {
  return AXES[Math.round(bearingDeg / 45) % 4];
}

/** A short plain-English sentence for the description box, using only what the map told us. */
export function describeForPrefill(b: StreetBuilding, address: string) {
  const form = b.suggestions.builtForm?.value;
  const noun = b.tags.building === "bungalow" ? "bungalow" : "house";
  const parts: string[] = [];
  if (form === "flat") parts.push("Block of flats");
  else if (form) parts.push(`${BUILT_FORM[form]} ${noun}`.replace("End terrace", "End-terrace").replace("Mid terrace", "Mid-terrace"));
  if (b.suggestions.storeys) parts.push(`${b.suggestions.storeys.value} ${b.suggestions.storeys.value === 1 ? "storey" : "storeys"} (OSM)`);
  const shape = b.tags.roofShape;
  if (shape && (PITCHED.has(shape) || shape === "flat")) parts.push(`${shape === "flat" ? "flat" : "pitched"} roof`);
  const m = b.measure;
  parts.push(`footprint about ${m.areaM2} m² (${m.widthM} × ${m.depthM} m)`);
  if (address) parts.push(address);
  return `${parts.join(", ")}.`.replace(/^./, (c) => c.toUpperCase());
}
